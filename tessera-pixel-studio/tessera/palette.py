"""Palette construction, perceptual color math (OKLab) and RGBA <-> token conversion.

Token 0 is always "transparent". Tokens 1..K-1 are opaque sRGB colors.
The default palette is built with weighted k-means in OKLab space over the colors that
actually occur in the dataset, then every centroid is snapped to the nearest real
dataset color so that common exact colors (pure black outlines, pure white, ...) survive.
"""

from __future__ import annotations

import json
import math
from typing import Optional, Sequence

import numpy as np
import torch

TRANSPARENT = 0


# --------------------------------------------------------------------------------------
# OKLab conversions (Björn Ottosson, 2020). Work on numpy or torch, values in [0, 255].
# --------------------------------------------------------------------------------------

def _srgb_to_linear(c):
    if isinstance(c, torch.Tensor):
        return torch.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(c):
    if isinstance(c, torch.Tensor):
        c = c.clamp(0, 1)
        return torch.where(c <= 0.0031308, 12.92 * c, 1.055 * c.clamp(min=1e-12) ** (1 / 2.4) - 0.055)
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, 12.92 * c, 1.055 * np.maximum(c, 1e-12) ** (1 / 2.4) - 0.055)


def srgb_to_oklab(rgb):
    """rgb: (..., 3) in [0, 255] (uint8 or float). Returns float32 (..., 3) OKLab."""
    is_t = isinstance(rgb, torch.Tensor)
    x = rgb.float() / 255.0 if is_t else np.asarray(rgb, dtype=np.float64) / 255.0
    lin = _srgb_to_linear(x)
    r, g, b = lin[..., 0], lin[..., 1], lin[..., 2]
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    if is_t:
        l_, m_, s_ = torch.pow(l.clamp(min=0), 1 / 3), torch.pow(m.clamp(min=0), 1 / 3), torch.pow(s.clamp(min=0), 1 / 3)
    else:
        l_, m_, s_ = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    A = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    if is_t:
        return torch.stack([L, A, B], -1).float()
    return np.stack([L, A, B], -1).astype(np.float32)


def oklab_to_srgb(lab):
    """lab: (..., 3) OKLab. Returns float sRGB in [0, 255]."""
    is_t = isinstance(lab, torch.Tensor)
    L, A, B = lab[..., 0], lab[..., 1], lab[..., 2]
    l_ = L + 0.3963377774 * A + 0.2158037573 * B
    m_ = L - 0.1055613458 * A - 0.0638541728 * B
    s_ = L - 0.0894841775 * A - 1.2914855480 * B
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
    g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
    b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
    out = torch.stack([r, g, b], -1) if is_t else np.stack([r, g, b], -1)
    return _linear_to_srgb(out) * 255.0


def rgb_to_key(rgb: np.ndarray) -> np.ndarray:
    rgb = rgb.astype(np.int64)
    return (rgb[..., 0] << 16) | (rgb[..., 1] << 8) | rgb[..., 2]


def key_to_rgb(key: np.ndarray) -> np.ndarray:
    key = np.asarray(key, dtype=np.int64)
    return np.stack([(key >> 16) & 255, (key >> 8) & 255, key & 255], -1).astype(np.uint8)


# --------------------------------------------------------------------------------------
# Nearest-neighbour + k-means helpers (torch, chunked, CPU or GPU)
# --------------------------------------------------------------------------------------

def _nearest(points: torch.Tensor, centers: torch.Tensor, chunk: int = 1 << 18):
    """Return (index, squared distance) of the nearest center for every point."""
    idx = torch.empty(points.shape[0], dtype=torch.long, device=points.device)
    dist = torch.empty(points.shape[0], dtype=points.dtype, device=points.device)
    c2 = (centers * centers).sum(1)
    for s in range(0, points.shape[0], chunk):
        p = points[s:s + chunk]
        d = (p * p).sum(1, keepdim=True) - 2 * p @ centers.T + c2[None]
        dv, di = d.min(1)
        idx[s:s + chunk] = di
        dist[s:s + chunk] = dv.clamp(min=0)
    return idx, dist


def weighted_kmeans(x: torch.Tensor, w: torch.Tensor, k: int, iters: int = 100, seed: int = 0):
    """Weighted k-means with k-means++ init. x: (U, 3), w: (U,). Returns centers (k, 3)."""
    g = torch.Generator(device="cpu").manual_seed(seed)
    U = x.shape[0]
    w = w.float()
    # k-means++ seeding (weighted)
    first = torch.multinomial(w.cpu(), 1, generator=g).item()
    centers = [x[first]]
    d2 = ((x - x[first]) ** 2).sum(1)
    for _ in range(1, k):
        p = (w * d2).cpu().double()
        if p.sum() <= 0:
            j = torch.randint(U, (1,), generator=g).item()
        else:
            j = torch.multinomial(p, 1, generator=g).item()
        centers.append(x[j])
        d2 = torch.minimum(d2, ((x - x[j]) ** 2).sum(1))
    C = torch.stack(centers).clone()
    for _ in range(iters):
        assign, dist = _nearest(x, C)
        sums = torch.zeros_like(C).index_add_(0, assign, x * w[:, None])
        ws = torch.zeros(k, device=x.device, dtype=w.dtype).index_add_(0, assign, w)
        empty = ws <= 0
        newC = torch.where(empty[:, None], C, sums / ws.clamp(min=1e-12)[:, None])
        if empty.any():  # re-seed empty clusters at the worst-fit points
            worst = torch.topk(w * dist, int(empty.sum().item())).indices
            newC[empty] = x[worst]
        shift = (newC - C).norm(dim=1).max().item()
        C = newC
        if shift < 1e-7:
            break
    return C


# --------------------------------------------------------------------------------------
# Palette
# --------------------------------------------------------------------------------------

class Palette:
    """A fixed list of colors. Index 0 is transparent; 1..K-1 are opaque sRGB colors."""

    def __init__(self, colors: np.ndarray, name: str = "custom"):
        colors = np.asarray(colors, dtype=np.uint8).reshape(-1, 3).copy()
        colors[TRANSPARENT] = 0
        self.colors = colors
        self.name = name
        lab = srgb_to_oklab(colors).astype(np.float32)
        lab[TRANSPARENT] = 0.0
        self.lab = lab

    # ---- basic properties ----
    @property
    def size(self) -> int:
        return int(self.colors.shape[0])

    def __len__(self) -> int:
        return self.size

    def rgba_table(self) -> np.ndarray:
        t = np.concatenate([self.colors, np.full((self.size, 1), 255, np.uint8)], 1)
        t[TRANSPARENT] = 0
        return t

    # ---- conversion ----
    def tokens_to_rgba(self, tokens) -> np.ndarray:
        """tokens: int array (..., ) -> uint8 RGBA (..., 4). Out-of-range ids (MASK) render magenta."""
        if isinstance(tokens, torch.Tensor):
            tokens = tokens.detach().cpu().numpy()
        tokens = np.asarray(tokens).astype(np.int64)
        table = np.concatenate([self.rgba_table(), np.array([[255, 0, 255, 255]], np.uint8)], 0)
        return table[np.clip(tokens, 0, self.size)]

    def nearest_index(self, rgb: np.ndarray, device: str = "cpu") -> np.ndarray:
        """Nearest opaque palette entry (1..K-1) in OKLab for an (M, 3) uint8 array."""
        if rgb.shape[0] == 0:
            return np.zeros(0, np.int64)
        pts = torch.from_numpy(srgb_to_oklab(rgb)).to(device)
        cen = torch.from_numpy(self.lab[1:]).to(device)
        idx, _ = _nearest(pts, cen)
        return idx.cpu().numpy() + 1

    def build_lut(self, keys: np.ndarray, device: str = "cpu") -> dict:
        """Map 24-bit color keys -> palette index (dict-free sorted arrays for speed)."""
        keys = np.unique(np.asarray(keys, dtype=np.int64))
        idx = self.nearest_index(key_to_rgb(keys), device=device)
        return {"keys": keys, "idx": idx.astype(np.uint16)}

    def quantize_rgba(self, rgba: np.ndarray, alpha_threshold: int = 128, lut: Optional[dict] = None,
                      device: str = "cpu") -> np.ndarray:
        """uint8 RGBA (..., 4) -> uint16 tokens (...). Pixels with alpha < threshold become transparent."""
        rgba = np.asarray(rgba)
        shape = rgba.shape[:-1]
        flat = rgba.reshape(-1, 4)
        opaque = flat[:, 3] >= alpha_threshold
        out = np.zeros(flat.shape[0], np.uint16)
        if opaque.any():
            keys = rgb_to_key(flat[opaque, :3])
            if lut is None:
                lut = self.build_lut(keys, device=device)
            pos = np.searchsorted(lut["keys"], keys)
            pos = np.clip(pos, 0, len(lut["keys"]) - 1)
            hit = lut["keys"][pos] == keys
            vals = lut["idx"][pos]
            if not hit.all():  # colors missing from the LUT: compute directly
                miss = ~hit
                vals = vals.copy()
                vals[miss] = self.nearest_index(key_to_rgb(keys[miss]), device=device)
            out[opaque] = vals
        return out.reshape(shape)

    # ---- perceptual similarity ----
    def soft_targets(self, tau: float = 0.05) -> torch.Tensor:
        """(K, K) row-stochastic matrix: row c is a softmax over opaque colors of -dE(c, .)^2 / tau^2.

        Used for perceptual label smoothing: predicting a nearby shade costs less than a far one.
        Transparent maps only to itself and opaque colors never put mass on transparent.
        """
        lab = torch.from_numpy(self.lab).double()
        d2 = torch.cdist(lab, lab) ** 2
        logits = -d2 / (tau * tau)
        logits[:, TRANSPARENT] = -math.inf
        S = torch.softmax(logits, dim=1)
        S[TRANSPARENT] = 0.0
        S[TRANSPARENT, TRANSPARENT] = 1.0
        return S.float()

    # ---- persistence ----
    def to_dict(self) -> dict:
        return {"name": self.name, "colors": self.colors.tolist()}

    def save(self, path: str) -> None:
        with open(path, "w") as f:
            json.dump(self.to_dict(), f)

    @classmethod
    def from_dict(cls, d: dict) -> "Palette":
        return cls(np.array(d["colors"], dtype=np.uint8), name=d.get("name", "custom"))

    @classmethod
    def load(cls, path: str) -> "Palette":
        with open(path) as f:
            return cls.from_dict(json.load(f))

    def preview(self, cell: int = 12, cols: int = 32):
        """PIL image of the palette swatches (transparent shown as a checkerboard)."""
        from PIL import Image
        rows = math.ceil(self.size / cols)
        img = np.full((rows * cell, cols * cell, 3), 255, np.uint8)
        for i in range(self.size):
            r, c = divmod(i, cols)
            if i == TRANSPARENT:
                yy, xx = np.mgrid[0:cell, 0:cell]
                img[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = np.where(
                    (((yy // 3) + (xx // 3)) % 2 == 0)[..., None], 200, 140)
            else:
                img[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = self.colors[i]
        return Image.fromarray(img)

    # ---- builders ----
    @classmethod
    def build_kmeans(cls, keys: np.ndarray, counts: np.ndarray, size: int = 512,
                     weight_power: float = 0.5, iters: int = 100, seed: int = 0,
                     device: str = "cpu") -> "Palette":
        """Data-driven palette with `size` entries (1 transparent + size-1 opaque colors).

        keys/counts: unique 24-bit opaque colors in the data and how often each occurs.
        weight_power < 1 tempers frequency so rare-but-distinct hues still get a slot.
        """
        keys = np.asarray(keys, dtype=np.int64)
        counts = np.asarray(counts, dtype=np.float64)
        k = size - 1
        rgb = key_to_rgb(keys)
        if keys.shape[0] <= k:  # fewer colors than slots: exact palette
            colors = np.concatenate([np.zeros((1, 3), np.uint8), rgb], 0)
            return cls._sorted(colors, name=f"exact{len(colors)}")
        x = torch.from_numpy(srgb_to_oklab(rgb)).to(device)
        w = torch.from_numpy(counts ** weight_power).to(device)
        C = weighted_kmeans(x, w, k, iters=iters, seed=seed)
        # snap every centroid to the nearest real data color (keeps exact pure colors)
        snap_idx, _ = _nearest(C, x)
        snap_idx = snap_idx.cpu().numpy()
        chosen = list(dict.fromkeys(snap_idx.tolist()))  # dedupe, keep order
        if len(chosen) < k:  # fill duplicates with the worst-represented data colors
            cen = x[torch.as_tensor(chosen, device=x.device)]
            _, dist = _nearest(x, cen)
            order = torch.argsort(w * dist, descending=True).cpu().numpy()
            for j in order:
                if len(chosen) >= k:
                    break
                if j not in chosen:
                    chosen.append(int(j))
        colors = np.concatenate([np.zeros((1, 3), np.uint8), rgb[np.array(chosen[:k])]], 0)
        return cls._sorted(colors, name=f"kmeans{size}")

    @classmethod
    def build_uniform(cls, levels: int = 8) -> "Palette":
        """Classic uniform RGB cube (levels^3 colors) + transparent. levels=8 -> 513 tokens."""
        v = np.round(np.linspace(0, 255, levels)).astype(np.uint8)
        rgb = np.stack(np.meshgrid(v, v, v, indexing="ij"), -1).reshape(-1, 3)
        colors = np.concatenate([np.zeros((1, 3), np.uint8), rgb], 0)
        return cls._sorted(colors, name=f"uniform{levels}")

    @classmethod
    def _sorted(cls, colors: np.ndarray, name: str) -> "Palette":
        """Order opaque colors by hue bucket then lightness so the palette preview is readable."""
        opaque = colors[1:]
        lab = srgb_to_oklab(opaque)
        chroma = np.sqrt(lab[:, 1] ** 2 + lab[:, 2] ** 2)
        hue = np.arctan2(lab[:, 2], lab[:, 1])
        bucket = np.where(chroma < 0.03, -1, np.floor((hue + np.pi) / (2 * np.pi) * 12)).astype(np.int64)
        order = np.lexsort((lab[:, 0], bucket))
        return cls(np.concatenate([colors[:1], opaque[order]], 0), name=name)


def quantization_report(palette: Palette, rgba: np.ndarray, tokens: np.ndarray, max_pixels: int = 2_000_000) -> dict:
    """Mean / p95 OKLab error introduced by quantization on opaque pixels."""
    flat = rgba.reshape(-1, 4)
    tok = tokens.reshape(-1)
    if flat.shape[0] > max_pixels:
        sel = np.random.default_rng(0).integers(0, flat.shape[0], max_pixels)
        flat, tok = flat[sel], tok[sel]
    op = flat[:, 3] >= 128
    if not op.any():
        return {"mean_dE": 0.0, "p95_dE": 0.0, "exact_frac": 1.0}
    src = srgb_to_oklab(flat[op, :3])
    dst = palette.lab[tok[op].astype(np.int64)]
    d = np.linalg.norm(src - dst, axis=1)
    exact = (palette.colors[tok[op].astype(np.int64)] == flat[op, :3]).all(1)
    return {"mean_dE": float(d.mean()), "p95_dE": float(np.percentile(d, 95)),
            "max_dE": float(d.max()), "exact_frac": float(exact.mean())}
