"""Parallel decoding for Tessera: confidence-ordered unmasking of the full 256-token canvas.

Per step:
  1. one batched forward pass (conditional + unconditional when CFG is on)
  2. guided logits  l = l_u + w_k (l_c - l_u), optional temperature / top-k / top-p / min-p
  3. sample a color for every masked pixel
  4. keep the most confident ones, so the number still masked follows a cosine schedule.
     Gumbel noise anneals the choice (MaskGIT), and spatial non-maximum suppression stops two
     *uncertain* neighbouring pixels from being committed in the same step: their independent
     marginals can disagree, which is the main failure mode of parallel decoding.
  5. feed the full predicted distribution back as self-conditioning for the next step
Optional "polish" steps re-mask the least confident committed pixels and re-predict them.
Inpainting: pass `init_tokens` and `keep_mask`; kept pixels are never changed.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Iterator, Optional

import torch
import torch.nn.functional as F

from .utils import autocast_ctx


def filter_logits(logits: torch.Tensor, top_k: int = 0, top_p: float = 1.0, min_p: float = 0.0) -> torch.Tensor:
    if top_k and top_k > 0 and top_k < logits.shape[-1]:
        kth = torch.topk(logits, top_k, dim=-1).values[..., -1:]
        logits = logits.masked_fill(logits < kth, -math.inf)
    if min_p and min_p > 0:
        p = logits.softmax(-1)
        logits = logits.masked_fill(p < min_p * p.amax(-1, keepdim=True), -math.inf)
    if top_p is not None and top_p < 1.0:
        sorted_l, idx = torch.sort(logits, dim=-1, descending=True)
        sp = sorted_l.softmax(-1)
        remove = (sp.cumsum(-1) - sp) > top_p
        sorted_l = sorted_l.masked_fill(remove, -math.inf)
        logits = torch.full_like(logits, -math.inf).scatter(-1, idx, sorted_l)
    return logits


def cfg_weight(scale: float, schedule: str, frac: float) -> float:
    if schedule == "constant":
        return scale
    if schedule == "linear":           # ramp up guidance as the canvas fills in
        return 1.0 + (scale - 1.0) * frac
    if schedule == "cosine":
        return 1.0 + (scale - 1.0) * (1 - math.cos(math.pi * frac)) / 2
    raise ValueError(f"unknown cfg schedule {schedule!r}")


def _gumbel(shape, device, generator):
    u = torch.rand(shape, device=device, generator=generator).clamp_(1e-10, 1 - 1e-10)
    return -torch.log(-torch.log(u))


def _nms_eligible(score: torch.Tensor, masked: torch.Tensor, certain: torch.Tensor, grid: int) -> torch.Tensor:
    B, N = score.shape
    cand = masked & ~certain
    s = torch.where(cand, score, torch.full_like(score, -math.inf)).view(B, 1, grid, grid)
    local_max = F.max_pool2d(s, 3, stride=1, padding=1).view(B, N)
    return certain | (cand & (score >= local_max))


@dataclass
class SampleStep:
    """State after one decoding step (all tensors (B, N), on the sampling device).

    tokens:    current canvas; still-masked pixels hold the mask id
    preview:   the model's current best guess (argmax) for every pixel, masked ones included
    confidence: probability of each committed pixel; the best-guess probability for masked ones
    committed: pixels that were committed (or re-predicted, in polish) during this step
    """
    index: int
    total: int
    phase: str                     # "decode" or "polish"
    tokens: torch.Tensor
    preview: torch.Tensor
    confidence: torch.Tensor
    committed: torch.Tensor


@torch.no_grad()
def sample(model, text_states: torch.Tensor, text_pooled: torch.Tensor, steps: int = 16,
           return_history: bool = False, **kwargs):
    """Generate palette-token canvases. Returns tokens (B, N) [and the per-step history].

    Takes the same keyword arguments as `sample_iter`."""
    x, history = None, []
    for st in sample_iter(model, text_states, text_pooled, steps=steps, **kwargs):
        x = st.tokens
        if return_history:
            history.append(x.clone())
    if x is None:   # nothing to do (e.g. inpainting with nothing masked)
        x = _initial_canvas(model.cfg, text_pooled, kwargs.get("init_tokens"), kwargs.get("keep_mask"))
    return (x, history) if return_history else x


def _initial_canvas(cfg, text_pooled, init_tokens, keep_mask):
    B, N, M = text_pooled.shape[0], cfg.num_tokens, cfg.mask_id
    if init_tokens is not None and keep_mask is not None:
        init_tokens = init_tokens.to(text_pooled.device).long()
        return torch.where(keep_mask.to(text_pooled.device).bool(), init_tokens, torch.full_like(init_tokens, M))
    return torch.full((B, N), M, dtype=torch.long, device=text_pooled.device)


@torch.no_grad()
def sample_iter(model, text_states: torch.Tensor, text_pooled: torch.Tensor, steps: int = 16,
                cfg_scale: float = 3.0, cfg_schedule: str = "constant",
                temperature: float = 1.0, temperature_end: Optional[float] = None,
                top_k: int = 0, top_p: float = 1.0, min_p: float = 0.0,
                choice_temperature: float = 2.0, spatial_nms: bool = True, nms_threshold: float = 0.9,
                commit_threshold: float = 0.0, polish_steps: int = 0, polish_frac: float = 0.08,
                init_tokens: Optional[torch.Tensor] = None, keep_mask: Optional[torch.Tensor] = None,
                self_cond: bool = True, generator: Optional[torch.Generator] = None,
                amp_dtype: torch.dtype = torch.float32) -> Iterator[SampleStep]:
    """Same decoding as `sample`, but yields a `SampleStep` after every step (for live previews)."""
    cfg = model.cfg
    device = text_pooled.device
    B, N, K, M, G = text_pooled.shape[0], cfg.num_tokens, cfg.vocab_size, cfg.mask_id, cfg.grid_size

    x = _initial_canvas(cfg, text_pooled, init_tokens, keep_mask)
    masked = x == M
    total = steps + polish_steps
    n_start = masked.sum(1)
    conf_map = torch.where(masked, torch.zeros(B, N, device=device), torch.full((B, N), math.inf, device=device))

    use_cfg = cfg_scale is not None and abs(cfg_scale - 1.0) > 1e-6
    if use_cfg:
        ts2 = torch.cat([text_states, text_states])
        tp2 = torch.cat([text_pooled, text_pooled])
        drop2 = torch.cat([torch.zeros(B, dtype=torch.bool, device=device),
                           torch.ones(B, dtype=torch.bool, device=device)])
    sc = torch.zeros(B, N, K, device=device) if (cfg.self_cond and self_cond) else None

    def step_state(index, phase, probs_full, committed):
        best_p, best = probs_full.max(-1)
        conf = torch.where(masked, best_p, conf_map)
        return SampleStep(index, total, phase, x, best, conf, committed)

    def predict(x_in, sc_in, frac):
        ratio = (x_in == M).float().mean(1)
        with autocast_ctx(device, amp_dtype):
            if use_cfg:
                sc2 = torch.cat([sc_in, sc_in]) if sc_in is not None else None
                out = model(torch.cat([x_in, x_in]), ts2, tp2, torch.cat([ratio, ratio]), sc2, drop2).float()
                lc, lu = out.chunk(2)
                w = cfg_weight(cfg_scale, cfg_schedule, frac)
                return lu + w * (lc - lu)
            return model(x_in, text_states, text_pooled, ratio, sc_in, None).float()

    for k in range(steps):
        if not masked.any():
            break
        frac = (k + 1) / steps
        logits = predict(x, sc, frac)
        probs_full = logits.softmax(-1)

        T = temperature if temperature_end is None else temperature + (temperature_end - temperature) * (k / max(1, steps - 1))
        if T <= 0:
            sampled = logits.argmax(-1)
            p_sel = probs_full.gather(-1, sampled.unsqueeze(-1)).squeeze(-1)
        else:
            probs = filter_logits(logits / T, top_k, top_p, min_p).softmax(-1)
            sampled = torch.multinomial(probs.view(-1, K), 1, generator=generator).view(B, N)
            p_sel = probs.gather(-1, sampled.unsqueeze(-1)).squeeze(-1)

        n_masked = masked.sum(1)
        remaining = torch.floor(n_start.float() * math.cos(math.pi / 2 * frac)).long()
        if k == steps - 1:
            remaining = torch.zeros_like(remaining)
        n_commit = torch.minimum((n_masked - remaining).clamp(min=1), n_masked)
        if commit_threshold > 0:
            n_commit = torch.maximum(n_commit, ((p_sel >= commit_threshold) & masked).sum(1))

        score = torch.log(p_sel.clamp(min=1e-12))
        if choice_temperature > 0:
            score = score + choice_temperature * (1.0 - frac) * _gumbel(score.shape, device, generator)
        priority = score
        if spatial_nms:
            elig = _nms_eligible(score, masked, p_sel >= nms_threshold, G)
            priority = score + elig.float() * 1e4
        priority = torch.where(masked, priority, torch.full_like(priority, -math.inf))
        ranks = priority.argsort(1, descending=True).argsort(1)
        commit = (ranks < n_commit.unsqueeze(1)) & masked

        x = torch.where(commit, sampled, x)
        conf_map = torch.where(commit, p_sel, conf_map)
        masked = masked & ~commit
        if sc is not None:
            sc = probs_full
        yield step_state(k, "decode", probs_full, commit)

    # ---- optional polish: re-mask the least confident generated pixels and re-predict ----
    n_re = max(1, int(round(polish_frac * N)))
    for j in range(polish_steps):
        low = torch.topk(-conf_map, n_re, dim=1).indices
        remask = torch.zeros(B, N, dtype=torch.bool, device=device).scatter_(1, low, True)
        remask &= torch.isfinite(conf_map)
        x_in = torch.where(remask, torch.full_like(x, M), x)
        logits = predict(x_in, sc, 1.0)
        probs_full = logits.softmax(-1)
        new = logits.argmax(-1)
        x = torch.where(remask, new, x)
        conf_map = torch.where(remask, probs_full.gather(-1, new.unsqueeze(-1)).squeeze(-1), conf_map)
        if sc is not None:
            sc = probs_full
        yield step_state(steps + j, "polish", probs_full, remask)
