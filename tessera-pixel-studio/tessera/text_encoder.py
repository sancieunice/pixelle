"""Frozen CLIP text encoder + the tokenization routine shared by data prep and inference."""

from __future__ import annotations

from typing import List, Sequence, Tuple

import numpy as np
import torch

DEFAULT_TEXT_ENCODER = "openai/clip-vit-base-patch32"


def load_tokenizer(name: str):
    from transformers import AutoTokenizer
    return AutoTokenizer.from_pretrained(name)


def tokenize_texts(tokenizer, texts: Sequence[str], text_len: int, batch: int = 65536) -> Tuple[np.ndarray, np.ndarray]:
    """Tokenize to a fixed length. Padding uses the pad id (CLIP: <|endoftext|>), and
    over-long prompts are truncated while keeping the final EOS token.

    Returns (ids int32 (n, text_len), true_lengths int32 (n,)).
    """
    eos = tokenizer.eos_token_id
    pad = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else eos
    n = len(texts)
    out = np.full((n, text_len), pad, dtype=np.int32)
    lengths = np.zeros(n, dtype=np.int32)
    for s in range(0, n, batch):
        chunk = [t if isinstance(t, str) else "" for t in texts[s:s + batch]]
        enc = tokenizer(chunk, add_special_tokens=True, truncation=False)["input_ids"]
        for i, ids in enumerate(enc):
            lengths[s + i] = len(ids)
            if len(ids) > text_len:
                ids = list(ids[:text_len - 1]) + [eos]
            out[s + i, :len(ids)] = ids
    return out, lengths


class FrozenTextEncoder:
    """Wraps a Hugging Face CLIP text tower. Not an nn.Module on purpose, so its weights never
    end up in the trainable model, optimizer or checkpoints."""

    def __init__(self, name: str = DEFAULT_TEXT_ENCODER, text_len: int = 24,
                 device="cpu", dtype: torch.dtype = torch.float32):
        from transformers import CLIPTextModel
        from transformers.utils import logging as hf_logging
        self.name = name
        self.text_len = text_len
        self.device = torch.device(device)
        self.dtype = dtype
        self.tokenizer = load_tokenizer(name)
        prev = hf_logging.get_verbosity()
        hf_logging.set_verbosity_error()   # the full CLIP checkpoint has vision weights we skip on purpose
        try:
            model = CLIPTextModel.from_pretrained(name)
        finally:
            hf_logging.set_verbosity(prev)
        self.model = model.to(device=self.device, dtype=dtype).eval().requires_grad_(False)
        self.dim = int(model.config.hidden_size)

    def tokenize(self, texts: Sequence[str]) -> torch.Tensor:
        ids, _ = tokenize_texts(self.tokenizer, list(texts), self.text_len)
        return torch.from_numpy(ids).long().to(self.device)

    @torch.no_grad()
    def __call__(self, ids: torch.Tensor) -> Tuple[torch.Tensor, torch.Tensor]:
        out = self.model(input_ids=ids.long().to(self.device))
        return out.last_hidden_state, out.pooler_output

    @torch.no_grad()
    def encode(self, texts: Sequence[str]) -> Tuple[torch.Tensor, torch.Tensor]:
        return self(self.tokenize(texts))
