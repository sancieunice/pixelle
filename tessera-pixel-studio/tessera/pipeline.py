"""High-level inference: load a checkpoint, turn prompts into pixel art, inpaint, export."""

from __future__ import annotations

from typing import List, Optional, Sequence, Union

import numpy as np
import torch
from PIL import Image

from .config import ModelConfig
from .model import Tessera
from .palette import Palette
from .sampler import sample
from .text_encoder import FrozenTextEncoder
from .utils import resolve_device, resolve_dtype
from .viz import make_grid, tokens_to_images, upscale


def load_model_from_checkpoint(path: str, device="cpu", use_ema: bool = True):
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    mcfg = ModelConfig.from_dict(ckpt["model_config"])
    palette = Palette.from_dict(ckpt["palette"])
    model = Tessera(mcfg, torch.from_numpy(palette.lab), torch.from_numpy(palette.colors))
    key = "ema" if (use_ema and "ema" in ckpt) else "model"
    sd = {k: v.float() if v.is_floating_point() else v for k, v in ckpt[key].items()}
    model.load_state_dict(sd)
    model.to(device).eval().requires_grad_(False)
    return model, palette, ckpt


class TesseraPipeline:
    def __init__(self, model: Tessera, text_encoder: FrozenTextEncoder, palette: Palette,
                 device, amp_dtype: torch.dtype = torch.float32):
        self.model = model
        self.text_encoder = text_encoder
        self.palette = palette
        self.device = torch.device(device)
        self.amp_dtype = amp_dtype

    @classmethod
    def from_checkpoint(cls, path: str, device: str = "auto", use_ema: bool = True,
                        dtype: str = "bf16") -> "TesseraPipeline":
        dev = resolve_device(device)
        amp = resolve_dtype(dtype, dev) if dev.type == "cuda" else torch.float32
        model, palette, ckpt = load_model_from_checkpoint(path, dev, use_ema)
        te = FrozenTextEncoder(ckpt["text_encoder"], model.cfg.text_len, dev, amp)
        pipe = cls(model, te, palette, dev, amp)
        pipe.step = ckpt.get("step")
        return pipe

    # ---------------------------------------------------------------------------------
    @torch.no_grad()
    def generate_tokens(self, prompts: Sequence[str], steps: int = 16, cfg_scale: float = 3.0,
                        seed: Optional[int] = None, batch_size: int = 256, **kwargs) -> torch.Tensor:
        gen = torch.Generator(device=self.device).manual_seed(seed) if seed is not None else None
        outs = []
        for s in range(0, len(prompts), batch_size):
            chunk = list(prompts[s:s + batch_size])
            states, pooled = self.text_encoder.encode(chunk)
            outs.append(sample(self.model, states, pooled, steps=steps, cfg_scale=cfg_scale,
                               generator=gen, amp_dtype=self.amp_dtype, **kwargs).cpu())
        return torch.cat(outs)

    def __call__(self, prompts: Union[str, Sequence[str]], num_per_prompt: int = 1, steps: int = 16,
                 cfg_scale: float = 3.0, seed: Optional[int] = None, **kwargs) -> List[Image.Image]:
        if isinstance(prompts, str):
            prompts = [prompts]
        expanded = [p for p in prompts for _ in range(num_per_prompt)]
        tokens = self.generate_tokens(expanded, steps=steps, cfg_scale=cfg_scale, seed=seed, **kwargs)
        return tokens_to_images(tokens, self.palette, self.model.cfg.grid_size)

    # ---------------------------------------------------------------------------------
    def image_to_tokens(self, image: Image.Image) -> torch.Tensor:
        g = self.model.cfg.grid_size
        im = image.convert("RGBA")
        if im.size != (g, g):
            im = im.resize((g, g), Image.NEAREST)
        tok = self.palette.quantize_rgba(np.asarray(im))
        return torch.from_numpy(tok.astype(np.int64)).view(1, -1)

    @torch.no_grad()
    def inpaint(self, prompt: str, image: Image.Image, regenerate_mask: np.ndarray, num: int = 4,
                steps: int = 12, cfg_scale: float = 3.0, seed: Optional[int] = None, **kwargs) -> List[Image.Image]:
        """Regenerate the pixels where `regenerate_mask` (grid x grid, bool) is True."""
        base = self.image_to_tokens(image).to(self.device).repeat(num, 1)
        keep = ~torch.from_numpy(np.asarray(regenerate_mask, dtype=bool).reshape(1, -1)).to(self.device)
        keep = keep.repeat(num, 1)
        states, pooled = self.text_encoder.encode([prompt] * num)
        gen = torch.Generator(device=self.device).manual_seed(seed) if seed is not None else None
        tok = sample(self.model, states, pooled, steps=steps, cfg_scale=cfg_scale, init_tokens=base,
                     keep_mask=keep, generator=gen, amp_dtype=self.amp_dtype, **kwargs)
        return tokens_to_images(tok, self.palette, self.model.cfg.grid_size)

    # ---------------------------------------------------------------------------------
    @staticmethod
    def grid(images: Sequence[Image.Image], ncols: int = 8, scale: int = 8, checker: bool = True) -> Image.Image:
        return make_grid(images, ncols=ncols, scale=scale, checker=checker)

    @staticmethod
    def upscale(image: Image.Image, scale: int = 16) -> Image.Image:
        return upscale(image, scale)

    def export(self, path: str, half: bool = True) -> None:
        """Small inference-only file (EMA weights, config, palette, text-encoder name)."""
        sd = {k: (v.half() if half and v.is_floating_point() else v).cpu() for k, v in self.model.state_dict().items()}
        torch.save({"ema": sd, "model_config": self.model.cfg.to_dict(), "palette": self.palette.to_dict(),
                    "text_encoder": self.text_encoder.name, "step": getattr(self, "step", None)}, path)
