---
title: Text To Pixel Art
emoji: 👾
colorFrom: purple
colorTo: pink
sdk: gradio
sdk_version: 6.32.0
python_version: '3.12'
app_file: app.py
pinned: true
license: cc-by-nc-4.0
short_description: Text-to-pixel-art diffusion LLM with live unmasking
datasets:
- Angais/pixel-art-atlas-1.4m
models:
- thejagstudio/tessera-small
- openai/clip-vit-base-patch32
tags:
- pixel-art
- text-to-image
- masked-diffusion
- discrete-diffusion
- diffusion-llm
---

# Tessera Pixel Studio

**Tessera** is a 47.6M-parameter masked-diffusion language model that paints **16×16 pixel art from text**.
Every pixel is one token from a learned **512-color palette**. The model starts from a fully masked canvas and
unmasks all 256 pixels **in parallel in about 16 steps**. It has no VAE, no latent space and no autoregression.

This Space is a full studio built around the model:

- **Live unmasking**: every denoising step streams to the browser, so you watch the sprite appear.
  You can switch the view to *Ghost* (the model's current guess for masked pixels) or *Confidence* (a per-pixel heatmap).
- **Batches** of 1–16 sprites, with a seed lock and every sampler knob: steps, CFG and its schedule, temperature,
  Gumbel order randomness, spatial NMS and polish passes.
- **Explore** gallery: 56 curated sprites (the best of 4 by CLIP score) that replay their own denoising on hover.
- **Detail viewer** with a trajectory scrubber, palette breakdown, 512 px PNG export, variations and *Remix*.
- **Pixel Editor**: paint with the model's own 512 colors, then use the **Magic brush** to mark pixels for
  Tessera to repaint (inpainting). You can also sketch a few strokes on a blank canvas and let it complete the sprite.
- **Technical write-up** (the *How it works* button) covering the palette, the masked-diffusion objective, the hourglass
  transformer, the training recipe and the sampler, with charts drawn from the real training logs.

## Model at a glance

| | |
|---|---|
| Architecture | Joint text+pixel bidirectional transformer, hourglass 2 + 8 + 2 blocks, width 512, 2D axial RoPE, QK-norm, Conv-SwiGLU, adaLN-single |
| Text encoder | frozen CLIP ViT-B/32 text tower (24 tokens) |
| Vocabulary | 512 palette tokens (OKLab weighted k-means, token 0 = transparent) + `[MASK]` |
| Training | 82,342 steps × 512 sprites (30 epochs), Muon + AdamW, WSD schedule, EMA, bf16 + `torch.compile` on one RTX PRO 6000 (≈5.5 h) |
| Result | val NLL 0.859 nats/pixel; CLIP score of generations 25.24 vs 25.28 for real sprites |

## Credits & thanks

**Huge thanks to [Angais](https://huggingface.co/Angais)** for creating and openly releasing
[**Pixel Art Atlas 1.4M**](https://huggingface.co/datasets/Angais/pixel-art-atlas-1.4m). Tessera learned every pixel it paints
from this dataset and would not exist without it.

Text conditioning uses [OpenAI CLIP ViT-B/32](https://huggingface.co/openai/clip-vit-base-patch32).
Ideas build on LLaDA, Mercury, DiffusionGemma, PixelDiT, MaskGIT, MDLM, DiT and PixArt-α. The full reference list is in the write-up.

Model, training pipeline and studio by **Jagrat Patel** ([@TheJagStudio](https://huggingface.co/thejagstudio)).

## License

**[CC BY-NC 4.0](LICENSE): non-commercial use only. © 2026 Jagrat Patel (TheJagStudio).**
The weights are hosted at [thejagstudio/tessera-small](https://huggingface.co/thejagstudio/tessera-small) and this Space loads them from there.

- ✅ Free for education, teaching, research, personal projects and experiments, with credit ("Tessera by Jagrat Patel (TheJagStudio)").
- ❌ No commercial use of the model, code or generated images (paid products, apps, games, services, reselling) without a license.
- 💼 Commercial licensing: contact Jagrat Patel via [Hugging Face](https://huggingface.co/thejagstudio).