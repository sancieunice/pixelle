"""Tessera: a tiny masked-diffusion language model that paints 16x16 pixel art from text.

Every pixel is one token drawn from a 512-entry palette (index 0 = transparent). A
bidirectional transformer denoises a fully masked 256-token canvas in parallel, in
roughly 12-24 steps, conditioned on a frozen CLIP text encoder.
"""

from .config import ModelConfig, TrainConfig, PRESETS, model_config_from_preset
from .palette import Palette
from .model import Tessera

__all__ = [
    "ModelConfig",
    "TrainConfig",
    "PRESETS",
    "model_config_from_preset",
    "Palette",
    "Tessera",
]

__version__ = "1.0.0"
