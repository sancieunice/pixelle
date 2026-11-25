"""
Standalone model verification script for Pixelle.
Generates pixel art sprites using the Tessera model on the local GPU.
"""

import os
import sys
import time
from pathlib import Path

# Add tessera-pixel-studio to python path
ROOT_DIR = Path(__file__).resolve().parent.parent
TESSERA_DIR = ROOT_DIR / "tessera-pixel-studio"
sys.path.insert(0, str(TESSERA_DIR))

import torch
from PIL import Image
from huggingface_hub import hf_hub_download

from tessera.pipeline import TesseraPipeline


def get_checkpoint_path() -> Path:
    """Download or locate the Tessera fp16 checkpoint."""
    local_path = TESSERA_DIR / "model" / "tessera-small-fp16.pt"
    if local_path.exists():
        print(f"[Check] Found local checkpoint: {local_path}")
        return local_path
    
    repo_id = os.environ.get("TESSERA_MODEL_REPO", "thejagstudio/tessera-small")
    filename = "tessera-small-fp16.pt"
    print(f"[Download] Fetching {filename} from Hugging Face ({repo_id})...")
    cached_file = hf_hub_download(repo_id=repo_id, filename=filename)
    print(f"[Download] Checkpoint ready: {cached_file}")
    return Path(cached_file)


def run_test_generation(prompt: str = "baby pink cute cat", num_images: int = 4, scale_factor: int = 16):
    print("=" * 60)
    print(f"PIXELLE — Standalone Model Test")
    print(f"Prompt: '{prompt}'")
    print("=" * 60)

    # 1. Device detection
    has_cuda = torch.cuda.is_available()
    device = "cuda" if has_cuda else "cpu"
    print(f"Device: {device.upper()}")
    if has_cuda:
        print(f"GPU Name: {torch.cuda.get_device_name(0)}")
        print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / (1024**3):.2f} GB")

    # 2. Checkpoint loading
    ckpt_path = get_checkpoint_path()
    print("\n[Loading] Initializing TesseraPipeline...")
    t0 = time.perf_counter()
    pipeline = TesseraPipeline.from_checkpoint(
        str(ckpt_path),
        device=device,
        use_ema=True,
        dtype="bf16" if has_cuda else "fp32"
    )
    t_load = time.perf_counter() - t0
    print(f"[Loaded] Model ready in {t_load:.2f}s (step {getattr(pipeline, 'step', 'unknown')})")

    # 3. Output directories
    output_dir = ROOT_DIR / "data" / "characters" / "test_cat"
    output_dir.mkdir(parents=True, exist_ok=True)

    # 4. Inference
    print(f"\n[Inference] Generating {num_images} sprite(s) for '{prompt}'...")
    t1 = time.perf_counter()
    images = pipeline(
        prompts=[prompt],
        num_per_prompt=num_images,
        steps=16,
        cfg_scale=3.0,
        seed=42
    )
    t_gen = time.perf_counter() - t1
    print(f"[Done] Generated {len(images)} sprite(s) in {t_gen:.2f}s ({t_gen/len(images):.2f}s per sprite)!")

    # 5. Image Processing & Saving
    print("\n[Saving] Processing and exporting images:")
    for idx, img in enumerate(images):
        raw_filename = f"cat_{idx + 1}_raw16x16.png"
        scaled_filename = f"cat_{idx + 1}_scaled256x256.png"

        raw_path = output_dir / raw_filename
        scaled_path = output_dir / scaled_filename

        # Save raw 16x16
        img.save(raw_path, format="PNG")

        # Nearest-neighbor upscale to preserve pixel sharpness
        target_size = (img.width * scale_factor, img.height * scale_factor)
        scaled_img = img.resize(target_size, resample=Image.Resampling.NEAREST)
        scaled_img.save(scaled_path, format="PNG")

        print(f"  [{idx + 1}] Raw: {raw_path.name} | Scaled: {scaled_path.name} ({target_size[0]}x{target_size[1]})")

    print(f"\nAll generated sprites saved to:\n  {output_dir}")
    print("=" * 60)
    return images, output_dir


if __name__ == "__main__":
    prompt = sys.argv[1] if len(sys.argv) > 1 else "baby pink cute cat"
    run_test_generation(prompt=prompt)
