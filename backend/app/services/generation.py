import os
import sys
import threading
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Optional
from PIL import Image

import torch
from huggingface_hub import hf_hub_download

from app.core import config

# Ensure tessera directory is on path
if str(config.TESSERA_DIR) not in sys.path:
    sys.path.insert(0, str(config.TESSERA_DIR))

from tessera.pipeline import TesseraPipeline


class CharacterGenerator(ABC):
    """Abstract interface for character generation adapters."""

    @abstractmethod
    def generate(
        self,
        prompt: str,
        steps: int = 16,
        cfg_scale: float = 3.0,
        seed: Optional[int] = None
    ) -> Image.Image:
        """Generate a single character sprite from prompt."""
        raise NotImplementedError


class TesseraGenerator(CharacterGenerator):
    """Tessera discrete masked-diffusion model generator."""

    _instance = None
    _lock = threading.Lock()

    def __init__(self):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.pipeline: Optional[TesseraPipeline] = None
        self._load_pipeline()

    @classmethod
    def get_instance(cls) -> "TesseraGenerator":
        with cls._lock:
            if cls._instance is None:
                cls._instance = cls()
            return cls._instance

    def _get_checkpoint_path(self) -> Path:
        local_path = config.TESSERA_DIR / "model" / config.MODEL_FILENAME
        if local_path.exists():
            return local_path
        
        cached_file = hf_hub_download(
            repo_id=config.DEFAULT_MODEL_REPO,
            filename=config.MODEL_FILENAME
        )
        return Path(cached_file)

    def _load_pipeline(self):
        ckpt_path = self._get_checkpoint_path()
        has_cuda = self.device == "cuda"
        self.pipeline = TesseraPipeline.from_checkpoint(
            str(ckpt_path),
            device=self.device,
            use_ema=True,
            dtype="bf16" if has_cuda else "fp32"
        )

    def generate(
        self,
        prompt: str,
        steps: int = 16,
        cfg_scale: float = 3.0,
        seed: Optional[int] = None
    ) -> Image.Image:
        if self.pipeline is None:
            self._load_pipeline()
        
        # Tessera returns list of PIL images
        images = self.pipeline(
            prompts=[prompt],
            num_per_prompt=1,
            steps=steps,
            cfg_scale=cfg_scale,
            seed=seed
        )
        return images[0]
