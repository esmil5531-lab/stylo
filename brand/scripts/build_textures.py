#!/usr/bin/env python3
"""
STYLO — navy fabric textures (brand/textures/), generated (no photos, no licences to track).

The reference boards use deep navy cloth with soft folds behind the logo. This draws the same
feel procedurally: a fine diagonal twill weave + low-frequency "drape" folds + a soft vignette,
all within the navy range (#071622 … #13324A) so white and silver text stay readable on top.

Requires numpy + Pillow.   Run: python brand/scripts/build_textures.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1] / "textures"
NAVY = np.array([0x0B, 0x1F, 0x2E], dtype=np.float32)
DEEP = np.array([0x07, 0x16, 0x22], dtype=np.float32)
LIGHT = np.array([0x2C, 0x4E, 0x69], dtype=np.float32)


def smooth_noise(w: int, h: int, scale: int, seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    small = rng.random((max(2, h // scale), max(2, w // scale))).astype(np.float32)
    img = Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    img = img.filter(ImageFilter.GaussianBlur(scale / 3))
    a = np.asarray(img, dtype=np.float32) / 255
    return (a - a.min()) / (a.max() - a.min() + 1e-6)


def fabric(w: int, h: int, seed: int) -> Image.Image:
    y, x = np.mgrid[0:h, 0:w].astype(np.float32)
    # Drape: long diagonal folds (light catching the ridges), plus slow variation.
    folds = np.sin((x * 0.55 + y) / (h / 5.5) * np.pi + smooth_noise(w, h, 220, seed) * 3.2)
    folds = (folds + 1) / 2
    drape = 0.7 * folds ** 3 + 0.35 * smooth_noise(w, h, 140, seed + 1)
    # Twill weave: fine 45° ribs + a little thread noise.
    twill = (np.sin((x + y) * (2 * np.pi / 6.0)) + 1) / 2
    thread = np.random.default_rng(seed + 2).random((h, w)).astype(np.float32)
    weave = 0.75 * twill + 0.25 * thread
    # Vignette: darker edges, so text in the middle stands out.
    cx, cy = w / 2, h * 0.45
    r = np.sqrt(((x - cx) / w) ** 2 + ((y - cy) / h) ** 2)
    vignette = np.clip(1 - r * 1.25, 0, 1)

    light = np.clip(0.85 * drape * (0.35 + 0.65 * vignette) + 0.07 * weave, 0, 1)[..., None]
    rgb = DEEP + (LIGHT - DEEP) * light
    rgb = rgb * 0.85 + NAVY * 0.15
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))


def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True)
    # Portrait: onboarding / full-screen backgrounds.
    fabric(1080, 1920, 7).save(ROOT / "navy-fabric-portrait.jpg", quality=80, optimize=True, progressive=True)
    # Wide: home hero without a banner photo, website sections.
    fabric(1600, 700, 11).save(ROOT / "navy-fabric-wide.jpg", quality=80, optimize=True, progressive=True)
    for f in sorted(ROOT.glob("*.jpg")):
        print("wrote", f.relative_to(ROOT.parent), f"{f.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
