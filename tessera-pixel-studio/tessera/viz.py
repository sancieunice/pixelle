"""Turning palette tokens into images and grids."""

from __future__ import annotations

from typing import List, Optional, Sequence, Tuple

import numpy as np
import torch
from PIL import Image

from .palette import Palette


def tokens_to_images(tokens, palette: Palette, grid: int = 16) -> List[Image.Image]:
    if isinstance(tokens, torch.Tensor):
        tokens = tokens.detach().cpu().numpy()
    tokens = np.asarray(tokens).reshape(-1, grid, grid)
    rgba = palette.tokens_to_rgba(tokens)
    return [Image.fromarray(a, "RGBA") for a in rgba]


def checkerboard(size: int, cell: int = 4, c1=(70, 70, 70), c2=(56, 56, 56)) -> Image.Image:
    yy, xx = np.mgrid[0:size, 0:size]
    board = ((yy // cell + xx // cell) % 2 == 0)[..., None]
    arr = np.where(board, np.array(c1, np.uint8), np.array(c2, np.uint8)).astype(np.uint8)
    return Image.fromarray(arr, "RGB").convert("RGBA")


def upscale(img: Image.Image, scale: int = 8, background: Optional[Tuple[int, int, int]] = None,
            checker: bool = False) -> Image.Image:
    big = img.convert("RGBA").resize((img.width * scale, img.height * scale), Image.NEAREST)
    if checker:
        bg = checkerboard(big.width, cell=max(2, scale))
    elif background is not None:
        bg = Image.new("RGBA", big.size, tuple(background) + (255,))
    else:
        return big
    bg.alpha_composite(big)
    return bg


def make_grid(images: Sequence[Image.Image], ncols: int = 8, scale: int = 6, pad: int = 4,
              background=(32, 32, 34), checker: bool = True) -> Image.Image:
    if not images:
        return Image.new("RGB", (1, 1))
    w = images[0].width * scale
    h = images[0].height * scale
    nrows = (len(images) + ncols - 1) // ncols
    canvas = Image.new("RGBA", (ncols * (w + pad) + pad, nrows * (h + pad) + pad), tuple(background) + (255,))
    for i, im in enumerate(images):
        r, c = divmod(i, ncols)
        canvas.alpha_composite(upscale(im, scale, checker=checker, background=None if checker else background),
                               (pad + c * (w + pad), pad + r * (h + pad)))
    return canvas.convert("RGB")


def stack_vertical(images: Sequence[Image.Image], pad: int = 8, background=(32, 32, 34)) -> Image.Image:
    w = max(im.width for im in images)
    h = sum(im.height for im in images) + pad * (len(images) - 1)
    out = Image.new("RGB", (w, h), background)
    y = 0
    for im in images:
        out.paste(im.convert("RGB"), (0, y))
        y += im.height + pad
    return out
