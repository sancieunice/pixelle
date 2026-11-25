"""Tessera Pixel Studio: a Hugging Face Space for the Tessera text-to-pixel-art diffusion model.

The whole interface is one custom HTML component (ui/). The browser triggers a `submit` event
with a JSON payload; the server streams every decoding step back through a hidden component as
compact base64 frames, and the browser animates the unmasking.

Runs on ZeroGPU (preferred), any CUDA GPU, or CPU.
"""

from __future__ import annotations

import base64
import json
import os
import random
import re
import time
from pathlib import Path

try:  # must be imported before torch on ZeroGPU
    import spaces
except ImportError:  # local runs
    spaces = None

import numpy as np
import torch
import gradio as gr

from tessera.pipeline import load_model_from_checkpoint
from tessera.sampler import sample_iter
from tessera.text_encoder import FrozenTextEncoder

HERE = Path(__file__).parent

# The weights live in their own model repo (CC BY-NC 4.0) and are downloaded at startup; the Space
# itself does not store them. For local development a copy in ./model/ is used if present.
MODEL_REPO = os.environ.get("TESSERA_MODEL_REPO", "thejagstudio/tessera-small")
MODEL_FILE = "tessera-small-fp16.pt"


def _checkpoint_path() -> Path:
    local = HERE / "model" / MODEL_FILE
    if local.exists():
        return local
    from huggingface_hub import hf_hub_download
    return Path(hf_hub_download(MODEL_REPO, MODEL_FILE, token=os.environ.get("HF_TOKEN")))


CKPT = _checkpoint_path()

# ----------------------------------------------------------------------------------------------
# model (placed on cuda at import time, as ZeroGPU recommends)
# ----------------------------------------------------------------------------------------------
ON_ZERO_GPU = bool(os.environ.get("SPACES_ZERO_GPU"))
DEVICE = torch.device("cuda" if (ON_ZERO_GPU or torch.cuda.is_available()) else "cpu")
HAS_GPU = DEVICE.type == "cuda"
CPU = torch.device("cpu")
AMP = torch.bfloat16 if HAS_GPU else torch.float32
torch.set_num_threads(max(1, min(8, os.cpu_count() or 1)))

# A CPU copy is kept next to the GPU one, so visitors can also run on CPU (no ZeroGPU quota used).
MODEL_CPU, PALETTE, _ckpt = load_model_from_checkpoint(str(CKPT), "cpu", use_ema=True)
TEXT_CPU = FrozenTextEncoder(_ckpt["text_encoder"], MODEL_CPU.cfg.text_len, CPU, torch.float32)
if HAS_GPU:
    MODEL, _, _ = load_model_from_checkpoint(str(CKPT), "cpu", use_ema=True)
    MODEL.to(DEVICE)
    TEXT = FrozenTextEncoder(_ckpt["text_encoder"], MODEL.cfg.text_len, DEVICE, torch.float32)
else:
    MODEL, TEXT = MODEL_CPU, TEXT_CPU
TRAIN_STEP = _ckpt.get("step")
del _ckpt

M = MODEL.cfg.mask_id
N = MODEL.cfg.num_tokens
LIMITS = {"gpu": {"max_images": 16, "max_steps": 32}, "cpu": {"max_images": 4, "max_steps": 24}, "has_gpu": HAS_GPU}
print(f"[tessera] {MODEL.num_params(trainable_only=False) / 1e6:.2f}M params on {DEVICE} (zero-gpu={ON_ZERO_GPU}), "
      f"cpu copy ready ({torch.get_num_threads()} threads), checkpoint step {TRAIN_STEP}, limits {LIMITS}", flush=True)


def _b64(arr: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(arr).tobytes()).decode("ascii")


def _u16(t: torch.Tensor) -> str:
    return _b64(t.detach().cpu().numpy().astype("<u2"))


def _u8(t: torch.Tensor) -> str:
    return _b64(t.detach().cpu().numpy().astype(np.uint8))


def _decode(s: str, dtype, n: int) -> np.ndarray:
    a = np.frombuffer(base64.b64decode(s), dtype=dtype)
    if a.size != n:
        raise ValueError("bad canvas payload")
    return a


def _clamp(v, lo, hi, default, cast=float):
    try:
        return min(hi, max(lo, cast(v)))
    except (TypeError, ValueError):
        return default


def parse_params(raw: str) -> dict:
    p = json.loads(raw)
    prompt = str(p.get("prompt", "")).strip()[:240]
    if not prompt:
        raise ValueError("Please type a prompt first.")
    seed = p.get("seed")
    seed = random.randint(0, 2**31 - 1) if seed in (None, "", -1) else _clamp(seed, 0, 2**31 - 1, 0, int)
    device = "gpu" if (HAS_GPU and p.get("device") != "cpu") else "cpu"
    lim = LIMITS[device]
    out = {
        "job": str(p.get("job", ""))[:40],
        "device": device,
        "mode": "inpaint" if p.get("mode") == "inpaint" else "generate",
        "prompt": prompt,
        "n": _clamp(p.get("n", 4), 1, lim["max_images"], 4, int),
        "steps": _clamp(p.get("steps", 16), 2, lim["max_steps"], 16, int),
        "cfg": _clamp(p.get("cfg", 3.0), 1.0, 10.0, 3.0),
        "cfg_schedule": p.get("cfg_schedule") if p.get("cfg_schedule") in ("constant", "linear", "cosine") else "constant",
        "temperature": _clamp(p.get("temperature", 1.0), 0.05, 2.0, 1.0),
        "choice_temperature": _clamp(p.get("choice_temperature", 2.0), 0.0, 6.0, 2.0),
        "nms": bool(p.get("nms", True)),
        "polish": _clamp(p.get("polish", 0), 0, 4, 0, int),
        "seed": seed,
    }
    if out["mode"] == "inpaint":
        init = _decode(p["init"], "<u2", N).astype(np.int64)
        keep = _decode(p["keep"], np.uint8, N).astype(bool)
        if (init[keep] >= MODEL.cfg.vocab_size).any():
            raise ValueError("bad canvas payload")
        out["init"], out["keep"] = init, keep
    return out


def _gpu_duration(p: dict) -> int:
    return int(min(60, 10 + 0.02 * p["n"] * (p["steps"] + p["polish"])))


def _maybe_gpu(fn):
    if spaces is not None and ON_ZERO_GPU:
        return spaces.GPU(duration=_gpu_duration)(fn)
    return fn


def _device_label(device: torch.device) -> str:
    if device.type != "cuda":
        return "CPU"
    name = torch.cuda.get_device_name(0)
    name = re.sub(r"^NVIDIA\s+", "", name)
    name = re.sub(r"\s+(Blackwell|Server Edition|MIG\b.*)", "", name)
    return name.strip() + (" (ZeroGPU)" if ON_ZERO_GPU else "")


@_maybe_gpu
def run_job(p: dict):
    """GPU path (ZeroGPU allocates a GPU for the duration of this generator)."""
    yield from _generate(p, MODEL, TEXT, DEVICE, AMP)


def run_job_cpu(p: dict):
    """CPU path: same sampler on the CPU copy of the model, no GPU quota needed."""
    yield from _generate(p, MODEL_CPU, TEXT_CPU, CPU, torch.float32)


def _generate(p: dict, model, text, device: torch.device, amp: torch.dtype):
    """Generator of JSON messages: start, one frame per decoding step, done."""
    t0 = time.perf_counter()
    B = p["n"]
    device_name = _device_label(device)
    gen = torch.Generator(device=device).manual_seed(p["seed"])
    with torch.inference_mode():
        states, pooled = text.encode([p["prompt"]] * B)
        init = keep = None
        if p["mode"] == "inpaint":
            init = torch.from_numpy(p["init"]).to(device).view(1, N).repeat(B, 1)
            keep = torch.from_numpy(p["keep"]).to(device).view(1, N).repeat(B, 1)
        total = p["steps"] + p["polish"]
        yield json.dumps({"t": "start", "job": p["job"], "n": B, "steps": p["steps"], "total": total,
                          "seed": p["seed"], "device": device_name})
        x = None
        for st in sample_iter(model, states, pooled, steps=p["steps"], cfg_scale=p["cfg"],
                              cfg_schedule=p["cfg_schedule"], temperature=p["temperature"],
                              choice_temperature=p["choice_temperature"], spatial_nms=p["nms"],
                              polish_steps=p["polish"], init_tokens=init, keep_mask=keep,
                              generator=gen, amp_dtype=amp):
            x = st.tokens
            conf = (st.confidence.float().clamp(0, 1) * 255).round()
            yield json.dumps({"t": "frame", "job": p["job"], "k": st.index, "phase": st.phase,
                              "tok": _u16(st.tokens), "pre": _u16(st.preview), "conf": _u8(conf),
                              "ms": round((time.perf_counter() - t0) * 1000, 1)})
        if x is None:  # nothing was masked
            x = init if init is not None else torch.full((B, N), M, device=device)
        yield json.dumps({"t": "done", "job": p["job"], "tok": _u16(x),
                          "ms": round((time.perf_counter() - t0) * 1000, 1), "device": device_name})


def on_submit(evt: gr.EventData):
    job = ""
    try:
        raw = evt.payload
        job = str(json.loads(raw).get("job", ""))[:40]
        params = parse_params(raw)
    except Exception as e:  # noqa: BLE001 - report bad input to the UI
        yield json.dumps({"t": "error", "job": job, "msg": str(e) or "Invalid request."})
        return
    try:
        yield from (run_job(params) if params["device"] == "gpu" else run_job_cpu(params))
    except Exception as e:  # noqa: BLE001 - e.g. ZeroGPU quota errors
        msg = getattr(e, "message", None) or str(e) or e.__class__.__name__
        print(f"[tessera] job failed: {e!r}", flush=True)
        yield json.dumps({"t": "error", "job": job, "msg": msg})


# ----------------------------------------------------------------------------------------------
# UI
# ----------------------------------------------------------------------------------------------
UI = HERE / "ui"
ASSETS = HERE / "assets"
STUDIO_HTML = (UI / "studio.html").read_text().replace("<!--WRITEUP-->", (UI / "writeup.html").read_text())
STUDIO_JS = (UI / "studio.js").read_text()
STUDIO_CSS = (UI / "studio.css").read_text()
GALLERY = json.loads((ASSETS / "gallery.json").read_text())
METRICS = json.loads((ASSETS / "metrics.json").read_text())
INFO = {
    "params": MODEL.num_params(trainable_only=False),
    "gflops": round(MODEL.flops_per_sample() / 1e9, 2) if hasattr(MODEL, "flops_per_sample") else None,
    "train_step": TRAIN_STEP,
    "device": "GPU (ZeroGPU)" if ON_ZERO_GPU else ("GPU" if HAS_GPU else "CPU"),
    "limits": LIMITS,
    "text_encoder": TEXT.name,
}

BUS_JS = """
watch('value', () => {
  const v = props.value;
  if (v && window.__tesseraBus) window.__tesseraBus(v);
});
"""

HEAD = """
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Silkscreen&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<meta name="theme-color" content="#ffffff">
"""

with gr.Blocks(title="Tessera Pixel Studio", fill_width=True) as demo:
    studio = gr.HTML(
        value="",
        html_template=STUDIO_HTML,
        js_on_load=STUDIO_JS,
        apply_default_css=False,
        elem_id="tessera-studio",
        palette=PALETTE.colors.tolist(),
        gallery=GALLERY,
        metrics=METRICS,
        info=INFO,
    )
    bus = gr.HTML(value="", html_template="", js_on_load=BUS_JS, visible="hidden", elem_id="tessera-bus")
    studio.submit(on_submit, None, bus, show_progress="hidden",
                  concurrency_limit=4 if DEVICE.type == "cuda" else 1, api_name=False)

demo.queue(max_size=64)

if __name__ == "__main__":
    demo.launch(css=STUDIO_CSS, head=HEAD, footer_links=[], ssr_mode=False)
