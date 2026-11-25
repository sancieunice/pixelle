"""Tessera denoiser: a dual-resolution masked-diffusion transformer for palette pixel art.

Sequence layout fed to every block:   [ registers | text tokens | image tokens ]

    pixel level (16x16)  --2x2 merge-->  patch level (8x8)  --unmerge + skip-->  pixel level (16x16)
       depth_in blocks                    depth_core blocks                       depth_out blocks

Main ingredients
  * Color-grounded token embeddings: each palette token = learned vector + MLP(Fourier(OKLab)).
  * Joint (bidirectional) attention over text + image tokens with QK-RMSNorm.
  * 2D axial RoPE on image tokens; patch-level tokens use sub-pixel centre coordinates so the
    two resolutions share one positional frame. Text/register tokens are not rotated.
  * Conv-SwiGLU: depthwise 3x3 conv on the gate branch of image tokens (local pixel structure).
  * adaLN-single modulation from (pooled text + mask-ratio) with per-block learned offsets,
    zero-initialised gates (every block starts as identity).
  * Self-conditioning: the previous step's predicted color distribution is projected and added
    to masked positions.
"""

from __future__ import annotations

import math
from typing import Optional, Tuple

import torch
import torch.nn as nn
import torch.nn.functional as F

from .config import ModelConfig


# --------------------------------------------------------------------------------------
# small building blocks
# --------------------------------------------------------------------------------------

class RMSNorm(nn.Module):
    def __init__(self, dim: int, eps: float = 1e-6, affine: bool = True):
        super().__init__()
        self.eps = eps
        self.weight = nn.Parameter(torch.ones(dim)) if affine else None

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        dtype = x.dtype
        x32 = x.float()
        y = x32 * torch.rsqrt(x32.pow(2).mean(-1, keepdim=True) + self.eps)
        if self.weight is not None:
            y = y * self.weight.float()
        return y.to(dtype)


def _rope_freqs(head_dim: int, theta: float) -> torch.Tensor:
    n = head_dim // 4  # rotation pairs per axis
    return 1.0 / (theta ** (torch.arange(n, dtype=torch.float64) / n))


def build_rope(n_prefix: int, grid: int, head_dim: int, theta: float, stride: int = 1) -> Tuple[torch.Tensor, torch.Tensor]:
    """cos/sin tables (n_prefix + grid^2, head_dim/2) for 2D axial RoPE.

    Image token (i, j) at a level with `stride` pixels per token sits at pixel-space centre
    (i*stride + (stride-1)/2, j*stride + (stride-1)/2). Prefix tokens get angle 0.
    """
    f = _rope_freqs(head_dim, theta)
    ii, jj = torch.meshgrid(torch.arange(grid, dtype=torch.float64), torch.arange(grid, dtype=torch.float64), indexing="ij")
    off = (stride - 1) / 2.0
    rows = (ii.reshape(-1) * stride + off)[:, None] * f[None]
    cols = (jj.reshape(-1) * stride + off)[:, None] * f[None]
    ang = torch.cat([rows, cols], 1)                                   # (grid^2, head_dim/2)
    ang = torch.cat([torch.zeros(n_prefix, ang.shape[1], dtype=ang.dtype), ang], 0)
    return ang.cos().float(), ang.sin().float()


def apply_rope(x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
    # x: (B, H, N, hd); cos/sin: (N, hd/2)
    x1, x2 = x.float().chunk(2, dim=-1)
    out = torch.cat([x1 * cos - x2 * sin, x1 * sin + x2 * cos], dim=-1)
    return out.to(x.dtype)


def fourier_features(x: torch.Tensor, n_freqs: int) -> torch.Tensor:
    """x: (..., C) roughly in [-1, 1] -> (..., C * 2 * n_freqs) sin/cos features."""
    freqs = (2.0 ** torch.arange(n_freqs, device=x.device, dtype=torch.float32)) * math.pi
    ang = x.float().unsqueeze(-1) * freqs
    return torch.cat([ang.sin(), ang.cos()], dim=-1).flatten(-2)


# --------------------------------------------------------------------------------------
# transformer block
# --------------------------------------------------------------------------------------

class Attention(nn.Module):
    def __init__(self, dim: int, n_heads: int):
        super().__init__()
        self.n_heads = n_heads
        self.head_dim = dim // n_heads
        self.qkv = nn.Linear(dim, 3 * dim, bias=False)
        self.proj = nn.Linear(dim, dim, bias=False)
        self.q_norm = RMSNorm(self.head_dim)
        self.k_norm = RMSNorm(self.head_dim)

    def forward(self, x: torch.Tensor, cos: torch.Tensor, sin: torch.Tensor) -> torch.Tensor:
        B, N, D = x.shape
        qkv = self.qkv(x).view(B, N, 3, self.n_heads, self.head_dim).permute(2, 0, 3, 1, 4)
        q, k, v = qkv.unbind(0)
        q = apply_rope(self.q_norm(q), cos, sin)
        k = apply_rope(self.k_norm(k), cos, sin)
        o = F.scaled_dot_product_attention(q, k, v)
        return self.proj(o.transpose(1, 2).reshape(B, N, D))


class ConvSwiGLU(nn.Module):
    """SwiGLU whose gate branch gets a residual depthwise 3x3 conv over the image grid."""

    def __init__(self, dim: int, hidden: int, conv: bool = True):
        super().__init__()
        self.w12 = nn.Linear(dim, 2 * hidden, bias=False)
        self.w3 = nn.Linear(hidden, dim, bias=False)
        self.dw = nn.Conv2d(hidden, hidden, 3, padding=1, groups=hidden, bias=True) if conv else None

    def forward(self, x: torch.Tensor, n_prefix: int, hw: Tuple[int, int]) -> torch.Tensor:
        a, g = self.w12(x).chunk(2, dim=-1)
        if self.dw is not None:
            B, _, C = g.shape
            H, W = hw
            g_pre, g_img = g[:, :n_prefix], g[:, n_prefix:]
            conv = self.dw(g_img.transpose(1, 2).reshape(B, C, H, W)).flatten(2).transpose(1, 2)
            g = torch.cat([g_pre, g_img + conv.to(g_img.dtype)], dim=1)
        return self.w3(a * F.silu(g))


class Block(nn.Module):
    def __init__(self, cfg: ModelConfig):
        super().__init__()
        self.norm1 = RMSNorm(cfg.dim, affine=False)
        self.attn = Attention(cfg.dim, cfg.n_heads)
        self.norm2 = RMSNorm(cfg.dim, affine=False)
        self.mlp = ConvSwiGLU(cfg.dim, cfg.mlp_hidden, conv=cfg.conv_ffn)
        # per-block offsets added to the shared adaLN-single modulation (shift/scale/gate x2)
        self.mod_bias = nn.Parameter(torch.zeros(6, cfg.dim))

    def forward(self, x, mod, cos, sin, n_prefix: int, hw: Tuple[int, int]):
        m = (mod + self.mod_bias).unsqueeze(2)                       # (B, 6, 1, D)
        sh1, sc1, g1, sh2, sc2, g2 = m.unbind(1)
        h = self.norm1(x) * (1 + sc1) + sh1
        x = x + g1 * self.attn(h, cos, sin)
        h = self.norm2(x) * (1 + sc2) + sh2
        x = x + g2 * self.mlp(h, n_prefix, hw)
        return x


# --------------------------------------------------------------------------------------
# the model
# --------------------------------------------------------------------------------------

class Tessera(nn.Module):
    def __init__(self, cfg: ModelConfig, palette_lab: Optional[torch.Tensor] = None,
                 palette_rgb: Optional[torch.Tensor] = None):
        super().__init__()
        cfg.validate()
        self.cfg = cfg
        K, D, G = cfg.vocab_size, cfg.dim, cfg.grid_size
        self.mask_id = cfg.mask_id

        if palette_lab is None:
            palette_lab = torch.zeros(K, 3)
        if palette_rgb is None:
            palette_rgb = torch.zeros(K, 3, dtype=torch.uint8)
        assert palette_lab.shape == (K, 3), f"palette has {palette_lab.shape[0]} colors, config says {K}"
        # the palette travels with the checkpoint
        self.register_buffer("palette_lab", palette_lab.float().clone())
        self.register_buffer("palette_rgb", palette_rgb.to(torch.uint8).clone())

        # ---- token embeddings (color-grounded) ----
        self.tok_emb = nn.Embedding(K + 1, D)                          # +1 for [MASK]
        n_feat = 3 + 3 * 2 * cfg.color_freqs + 1
        self.color_mlp = nn.Sequential(nn.Linear(n_feat, D), nn.SiLU(), nn.Linear(D, D))
        self.pos_emb = nn.Parameter(torch.zeros(1, G * G, D))
        self.sc_proj = nn.Linear(K, D, bias=False) if cfg.self_cond else None

        # ---- text conditioning ----
        self.text_norm = RMSNorm(cfg.text_dim)
        self.text_proj = nn.Linear(cfg.text_dim, D)
        self.null_text = nn.Parameter(torch.zeros(1, cfg.text_len, D))
        self.pool_mlp = nn.Sequential(RMSNorm(cfg.text_dim), nn.Linear(cfg.text_dim, D), nn.SiLU(), nn.Linear(D, D))
        self.null_cond = nn.Parameter(torch.zeros(1, D))
        self.ratio_mlp = nn.Sequential(nn.Linear(2 * 8, D), nn.SiLU(), nn.Linear(D, D))
        self.registers = nn.Parameter(torch.zeros(1, cfg.n_registers, D))
        self.t_block = nn.Sequential(nn.SiLU(), nn.Linear(D, 6 * D))

        # ---- backbone ----
        if cfg.hourglass:
            p = cfg.patch
            self.blocks_in = nn.ModuleList([Block(cfg) for _ in range(cfg.depth_in)])
            self.down = nn.Sequential(RMSNorm(p * p * D), nn.Linear(p * p * D, D))
            self.blocks_core = nn.ModuleList([Block(cfg) for _ in range(cfg.depth_core)])
            self.up = nn.Linear(D, p * p * D)
            self.blocks_out = nn.ModuleList([Block(cfg) for _ in range(cfg.depth_out)])
        else:
            self.blocks_in = nn.ModuleList([Block(cfg) for _ in range(cfg.depth_in + cfg.depth_core + cfg.depth_out)])
            self.down = self.up = None
            self.blocks_core = nn.ModuleList()
            self.blocks_out = nn.ModuleList()

        self.norm_out = RMSNorm(D, affine=False)
        self.final_mod = nn.Sequential(nn.SiLU(), nn.Linear(D, 2 * D))
        self.head = nn.Linear(D, K)

        # ---- fixed tables ----
        n_pre = cfg.n_registers + cfg.text_len
        self.n_prefix = n_pre
        cf, sf = build_rope(n_pre, G, cfg.head_dim, cfg.rope_theta, stride=1)
        self.register_buffer("rope_cos", cf, persistent=False)
        self.register_buffer("rope_sin", sf, persistent=False)
        if cfg.hourglass:
            cc, sc = build_rope(n_pre, G // cfg.patch, cfg.head_dim, cfg.rope_theta, stride=cfg.patch)
        else:
            cc, sc = cf[:1], sf[:1]
        self.register_buffer("rope_cos_core", cc, persistent=False)
        self.register_buffer("rope_sin_core", sc, persistent=False)
        self.register_buffer("color_feats", self._color_features(self.palette_lab), persistent=False)
        self.grad_checkpointing = False

        self._init_weights()

    # ---------------------------------------------------------------------------------
    def _color_features(self, lab: torch.Tensor) -> torch.Tensor:
        x = torch.stack([lab[:, 0] * 2 - 1, lab[:, 1] / 0.4, lab[:, 2] / 0.4], -1)
        alpha = torch.ones(lab.shape[0], 1)
        alpha[0] = 0.0                                                 # token 0 = transparent
        x = x * alpha
        return torch.cat([x, fourier_features(x, self.cfg.color_freqs), alpha], -1)

    def set_palette(self, palette_lab: torch.Tensor, palette_rgb: torch.Tensor) -> None:
        self.palette_lab.copy_(palette_lab.float())
        self.palette_rgb.copy_(palette_rgb.to(torch.uint8))
        self.color_feats = self._color_features(self.palette_lab.cpu()).to(self.palette_lab.device)

    def _load_from_state_dict(self, state_dict, prefix, *args, **kwargs):
        super()._load_from_state_dict(state_dict, prefix, *args, **kwargs)
        # palette buffers just changed -> refresh derived color features
        self.color_feats = self._color_features(self.palette_lab.detach().cpu()).to(self.palette_lab.device)

    def _init_weights(self) -> None:
        def init(m):
            if isinstance(m, nn.Linear):
                nn.init.trunc_normal_(m.weight, std=0.02)
                if m.bias is not None:
                    nn.init.zeros_(m.bias)
            elif isinstance(m, nn.Embedding):
                nn.init.normal_(m.weight, std=0.02)
        self.apply(init)
        nn.init.trunc_normal_(self.pos_emb, std=0.02)
        nn.init.normal_(self.null_text, std=0.02)
        nn.init.normal_(self.null_cond, std=0.02)
        nn.init.normal_(self.registers, std=0.02)
        # zero-init: conditioning projections, gates, output head, self-cond, hourglass up path
        for m in [self.t_block[-1], self.final_mod[-1], self.head]:
            nn.init.zeros_(m.weight)
            nn.init.zeros_(m.bias)
        if self.sc_proj is not None:
            nn.init.zeros_(self.sc_proj.weight)
        if self.up is not None:
            nn.init.zeros_(self.up.weight)
            nn.init.zeros_(self.up.bias)
        for blk in list(self.blocks_in) + list(self.blocks_core) + list(self.blocks_out):
            if blk.mlp.dw is not None:
                nn.init.zeros_(blk.mlp.dw.weight)
                nn.init.zeros_(blk.mlp.dw.bias)

    # ---------------------------------------------------------------------------------
    def _merge(self, h: torch.Tensor) -> torch.Tensor:
        B, N, D = h.shape
        G, p = self.cfg.grid_size, self.cfg.patch
        g = G // p
        h = h.view(B, g, p, g, p, D).permute(0, 1, 3, 2, 4, 5).reshape(B, g * g, p * p * D)
        return self.down(h)

    def _split(self, h: torch.Tensor) -> torch.Tensor:
        B = h.shape[0]
        G, p, D = self.cfg.grid_size, self.cfg.patch, self.cfg.dim
        g = G // p
        h = self.up(h).view(B, g, g, p, p, D).permute(0, 1, 3, 2, 4, 5).reshape(B, G * G, D)
        return h

    def _run(self, blk: Block, xs, mod, cos, sin, n_pre: int, hw: Tuple[int, int]):
        if self.grad_checkpointing and self.training and torch.is_grad_enabled():
            return torch.utils.checkpoint.checkpoint(blk, xs, mod, cos, sin, n_pre, hw, use_reentrant=False)
        return blk(xs, mod, cos, sin, n_pre, hw)

    def embed_table(self) -> torch.Tensor:
        K = self.cfg.vocab_size
        w = self.tok_emb.weight
        colors = w[:K] + self.color_mlp(self.color_feats).to(w.dtype)
        return torch.cat([colors, w[K:]], 0)

    def forward(self, x: torch.Tensor, text_states: torch.Tensor, text_pooled: torch.Tensor,
                mask_ratio: Optional[torch.Tensor] = None, sc_probs: Optional[torch.Tensor] = None,
                drop_text: Optional[torch.Tensor] = None) -> torch.Tensor:
        """
        x:           (B, N) long, palette ids or mask_id
        text_states: (B, L, text_dim) frozen text-encoder token states
        text_pooled: (B, text_dim) pooled text embedding
        mask_ratio:  (B,) fraction of masked tokens (computed from x if None)
        sc_probs:    (B, N, K) previous-step predicted distribution (self-conditioning) or None
        drop_text:   (B,) bool, replace the text with the learned null condition (CFG)
        returns logits (B, N, K) in float32
        """
        cfg = self.cfg
        B, N = x.shape
        D, G = cfg.dim, cfg.grid_size
        is_mask = x == self.mask_id
        if mask_ratio is None:
            mask_ratio = is_mask.float().mean(1)

        # ---- image tokens ----
        h = F.embedding(x, self.embed_table()).float() + self.pos_emb
        if self.sc_proj is not None and sc_probs is not None:
            h = h + self.sc_proj(sc_probs.to(self.sc_proj.weight.dtype)).float() * is_mask.unsqueeze(-1)

        # ---- text tokens + global conditioning ----
        t = self.text_proj(self.text_norm(text_states.float())).float()
        c = self.pool_mlp(text_pooled.float()).float()
        if drop_text is not None:
            t = torch.where(drop_text.view(B, 1, 1), self.null_text, t)
            c = torch.where(drop_text.view(B, 1), self.null_cond, c)
        r = mask_ratio.float().view(B, 1) * 2 - 1
        g = c + self.ratio_mlp(fourier_features(r, 8).view(B, -1)).float()
        mod = self.t_block(g).float().view(B, 6, D)

        prefix = torch.cat([self.registers.expand(B, -1, -1), t], 1)
        n_pre = prefix.shape[1]
        xs = torch.cat([prefix, h], 1)

        # ---- pixel level (in) ----
        for blk in self.blocks_in:
            xs = self._run(blk, xs, mod, self.rope_cos, self.rope_sin, n_pre, (G, G))

        # ---- patch level (core) ----
        if cfg.hourglass:
            pre, img = xs[:, :n_pre], xs[:, n_pre:]
            skip = img
            xs = torch.cat([pre, self._merge(img).float()], 1)
            gc = G // cfg.patch
            for blk in self.blocks_core:
                xs = self._run(blk, xs, mod, self.rope_cos_core, self.rope_sin_core, n_pre, (gc, gc))
            pre, core = xs[:, :n_pre], xs[:, n_pre:]
            xs = torch.cat([pre, skip + self._split(core).float()], 1)

            # ---- pixel level (out) ----
            for blk in self.blocks_out:
                xs = self._run(blk, xs, mod, self.rope_cos, self.rope_sin, n_pre, (G, G))

        img = xs[:, n_pre:]
        shift, scale = self.final_mod(g).float().unsqueeze(1).chunk(2, dim=-1)
        img = self.norm_out(img) * (1 + scale) + shift
        return self.head(img).float()

    # ---------------------------------------------------------------------------------
    def num_params(self, trainable_only: bool = True) -> int:
        return sum(p.numel() for p in self.parameters() if p.requires_grad or not trainable_only)

    def flops_per_sample(self) -> float:
        """Rough forward FLOPs per image (matmuls + attention), for MFU-style reporting."""
        cfg = self.cfg
        D, Hd = cfg.dim, cfg.mlp_hidden
        n_pre = self.n_prefix
        per_tok = 2 * (4 * D * D + 3 * D * Hd)
        def stage(n_img, depth):
            n = n_pre + n_img
            return depth * (n * per_tok + 4 * n * n * D)
        G = cfg.grid_size
        if cfg.hourglass:
            f = stage(G * G, cfg.depth_in + cfg.depth_out) + stage((G // cfg.patch) ** 2, cfg.depth_core)
        else:
            f = stage(G * G, cfg.depth_in + cfg.depth_core + cfg.depth_out)
        f += 2 * G * G * D * cfg.vocab_size * (2 if cfg.self_cond else 1)
        return float(f)
