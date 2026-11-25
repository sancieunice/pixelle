"""Configuration dataclasses and model-size presets."""

from __future__ import annotations

import dataclasses
from dataclasses import dataclass, field, asdict
from typing import Any, Dict, List, Optional


@dataclass
class ModelConfig:
    """Architecture hyper-parameters for the Tessera denoiser."""

    vocab_size: int = 512        # palette entries incl. transparent (index 0). MASK id == vocab_size
    grid_size: int = 16          # image is grid_size x grid_size tokens
    dim: int = 512               # residual width
    n_heads: int = 8
    depth_in: int = 2            # pixel-level blocks before the 2x2 merge
    depth_core: int = 8          # patch-level blocks on the merged (grid/patch)^2 tokens
    depth_out: int = 2           # pixel-level blocks after the unmerge
    patch: int = 2               # merge factor of the hourglass core (1 = flat model)
    mlp_ratio: float = 3.0       # SwiGLU hidden = mlp_ratio * dim (rounded to 64)
    n_registers: int = 4         # learnable register tokens in the prefix
    text_dim: int = 512          # hidden size of the frozen text encoder
    text_len: int = 24           # number of text tokens fed to the denoiser
    rope_theta: float = 100.0    # base of the 2D axial RoPE frequencies
    conv_ffn: bool = True        # depthwise 3x3 conv on the gate branch of image tokens
    color_freqs: int = 6         # Fourier frequencies for OKLab color embeddings
    self_cond: bool = True       # feed previous-step predictions back as input

    @property
    def mask_id(self) -> int:
        return self.vocab_size

    @property
    def num_tokens(self) -> int:
        return self.grid_size * self.grid_size

    @property
    def hourglass(self) -> bool:
        return self.patch > 1 and self.depth_core > 0

    @property
    def head_dim(self) -> int:
        return self.dim // self.n_heads

    @property
    def mlp_hidden(self) -> int:
        h = int(self.dim * self.mlp_ratio)
        return max(64, (h + 63) // 64 * 64)

    def validate(self) -> None:
        assert self.dim % self.n_heads == 0, "dim must be divisible by n_heads"
        assert self.head_dim % 4 == 0, "head_dim must be divisible by 4 for 2D axial RoPE"
        if self.hourglass:
            assert self.grid_size % self.patch == 0, "grid_size must be divisible by patch"

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "ModelConfig":
        names = {f.name for f in dataclasses.fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in names})


# Parameter counts (denoiser only, frozen CLIP excluded) and forward GFLOPs per image:
#   nano 7.2M / 1.8, tiny 23M / 6.9, small 48M / 13.1, base 152M / 42.9
PRESETS: Dict[str, Dict[str, Any]] = {
    "nano": dict(dim=256, n_heads=4, depth_in=1, depth_core=4, depth_out=1),
    "tiny": dict(dim=384, n_heads=6, depth_in=2, depth_core=6, depth_out=2),
    "small": dict(dim=512, n_heads=8, depth_in=2, depth_core=8, depth_out=2),
    "base": dict(dim=768, n_heads=12, depth_in=3, depth_core=12, depth_out=3),
}


def model_config_from_preset(preset: str, **overrides: Any) -> ModelConfig:
    if preset not in PRESETS:
        raise ValueError(f"unknown preset {preset!r}; choose from {list(PRESETS)}")
    kw = dict(PRESETS[preset])
    kw.update(overrides)
    cfg = ModelConfig(**kw)
    cfg.validate()
    return cfg


DEFAULT_SAMPLE_PROMPTS: List[str] = [
    "red health potion bottle",
    "golden crown with blue gems",
    "green slime monster",
    "iron sword with a leather hilt",
    "wooden treasure chest",
    "pink cherry blossom tree",
    "blue magic spellbook",
    "orange fox head",
    "glowing purple crystal",
    "cheeseburger",
    "skull with a candle",
    "rocket ship",
    "brown leather boots",
    "yellow rubber duck",
    "ice cream cone with strawberry scoop",
    "black cat",
]


@dataclass
class TrainConfig:
    """Everything the trainer needs. Unknown keys are rejected to catch typos."""

    # ---- paths ----
    data_dir: str = "data/tessera_cache"     # output of prepare_dataset()
    out_dir: str = "runs/tessera-small"      # checkpoints, logs, samples (put this on Drive)

    # ---- model ----
    preset: str = "small"
    model_overrides: Dict[str, Any] = field(default_factory=dict)
    text_encoder: Optional[str] = None       # None -> use the one recorded in the data cache

    # ---- optimisation ----
    batch_size: int = 512
    grad_accum: int = 1
    total_steps: int = 60_000
    lr: float = 6e-4
    min_lr_ratio: float = 0.0
    warmup_steps: int = 1_000
    decay_frac: float = 0.2                  # Warmup-Stable-Decay: last 20% of steps cool down
    weight_decay: float = 0.05
    beta1: float = 0.9
    beta2: float = 0.95
    grad_clip: float = 1.0
    optimizer: str = "muon"                  # "muon" (Muon for hidden matrices + AdamW) or "adamw"
    muon_momentum: float = 0.95
    ema_decay: float = 0.9995

    # ---- masked diffusion ----
    mask_schedule: str = "cosine"            # "cosine" (MaskGIT) or "linear" (MDLM/LLaDA)
    loss_weighting: str = "uniform"          # "uniform" (mean over masked tokens) or "elbo" (1/t)
    stratified_t: bool = True                # low-discrepancy mask ratios across the batch
    smooth_mask_prob: float = 0.25           # fraction of samples with spatially-correlated masks
    label_smoothing: float = 0.1             # perceptual (OKLab) label smoothing weight
    color_tau: float = 0.05                  # OKLab distance scale of the perceptual smoothing
    self_cond_prob: float = 0.5              # probability a step trains with self-conditioning
    self_cond_lookback: float = 0.3          # extra masking of the self-cond draft pass
    cond_drop_prob: float = 0.1              # classifier-free guidance dropout
    subject_prob: float = 0.05               # use the short "subject" field instead of the caption
    hflip_prob: float = 0.5                  # horizontal flips (skipped for captions with left/right)

    # ---- systems ----
    device: str = "auto"
    amp_dtype: str = "bf16"                  # "bf16", "fp16" or "fp32"
    compile: bool = True
    compile_mode: str = "default"            # "default", "max-autotune-no-cudagraphs", ...
    grad_checkpointing: bool = False         # recompute blocks in backward: ~-60% activation memory, ~+30% time
    seed: int = 1234
    data_on_gpu: bool = True

    # ---- logging / eval / checkpoints ----
    log_every: int = 50
    dashboard_every: int = 250
    eval_every: int = 2_500
    eval_batches: int = 4
    sample_every: int = 2_500
    clip_score_every: int = 10_000           # 0 disables CLIP-score evaluation
    clip_score_n: int = 256
    ckpt_every_minutes: float = 15.0
    ckpt_every_steps: int = 5_000
    milestone_every: int = 20_000            # keep a permanent EMA snapshot every N steps
    sample_steps: int = 16
    sample_cfg: float = 3.0
    sample_prompts: List[str] = field(default_factory=lambda: list(DEFAULT_SAMPLE_PROMPTS))
    use_tensorboard: bool = True
    resume: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: Dict[str, Any]) -> "TrainConfig":
        names = {f.name for f in dataclasses.fields(cls)}
        unknown = set(d) - names
        if unknown:
            raise ValueError(f"unknown TrainConfig keys: {sorted(unknown)}")
        return cls(**d)
