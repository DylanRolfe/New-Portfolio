#!/usr/bin/env python
"""Build the About-page mountain plates from the attached reference.

The existing campsite painting is the base and source of truth. Only the
distant landscape band changes; the sky, tent, foreground, and the main tree
silhouettes stay as original pixels. The resulting transparent plate is
revealed at runtime by the existing PaintReveal brush engine, so the shared
WebGL renderer and its animated sky are never touched.

Run: python tools/build-mountain-art.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets" / "cinematic"
DESKTOP_BASE = ASSETS / "Images" / "painting-desktop.webp"
MOBILE_BASE = ASSETS / "Images" / "painting-mobile.webp"
REFERENCE = ASSETS / "about-mountain-reference.png"


def smoothstep(edge0, edge1, x):
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def foliage_mask(image):
    """Find stationary dark/green foreground so mountains stay behind it."""
    pixels = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
    r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    maximum = pixels.max(axis=2)
    minimum = pixels.min(axis=2)
    delta = maximum - minimum
    saturation = np.divide(delta, maximum, out=np.zeros_like(delta), where=maximum > 0)

    hue = np.zeros_like(maximum)
    active = delta > 0
    red = active & (maximum == r)
    green = active & (maximum == g)
    blue = active & (maximum == b)
    hue[red] = ((g - b)[red] / delta[red]) % 6
    hue[green] = ((b - r)[green] / delta[green]) + 2
    hue[blue] = ((r - g)[blue] / delta[blue]) + 4
    hue /= 6.0

    foliage = (hue > 0.15) & (hue < 0.46) & (saturation > 0.13) & (maximum < 0.84)
    dark = maximum < 0.27
    mask = foliage | dark
    y = np.arange(mask.shape[0])[:, None]
    mask &= (y > 315) & (y < 780)

    mask_image = Image.fromarray((mask * 255).astype("uint8"))
    # Consolidate needle clusters, then feather the exclusion slightly so the
    # mountain plate tucks behind branch edges instead of creating a hard matte.
    mask_image = (
        mask_image.filter(ImageFilter.MaxFilter(7))
        .filter(ImageFilter.MinFilter(7))
        .filter(ImageFilter.MaxFilter(9))
        .filter(ImageFilter.GaussianBlur(2.5))
    )
    return np.asarray(mask_image, dtype=np.float32) / 255.0


def grade_mountain(image):
    """Nudge the independently generated range into the campsite's night key."""
    pixels = np.asarray(image.convert("RGB"), dtype=np.float32)
    matrix = np.array(
        [
            [0.93, 0.00, 0.00],
            [0.00, 0.96, 0.00],
            [0.00, 0.02, 1.05],
        ],
        dtype=np.float32,
    )
    graded = pixels @ matrix.T
    graded = np.clip(graded * 0.94 + np.array([1.5, 4.5, 10.0]), 0, 255)
    return graded


def build_plate(
    *,
    base_path,
    reference_crop,
    ridge_points,
    transform,
    bottom,
    output,
    preview,
    size,
):
    base = Image.open(base_path).convert("RGB").resize(size, Image.LANCZOS)
    reference = Image.open(REFERENCE).convert("RGB").crop(reference_crop)
    width, height = size

    # Ridge traced in crop coordinates; fill the mountain mass below it.
    ridge = Image.new("L", reference.size, 0)
    draw = ImageDraw.Draw(ridge)
    points = [(0, reference.height), (0, ridge_points[0][1])]
    points.extend(ridge_points)
    points.append((reference.width, reference.height))
    draw.polygon(points, fill=255)
    # Erode before feathering so the edge only samples mountain pixels, never
    # the reference's independently generated sky.
    ridge = ridge.filter(ImageFilter.MinFilter(9)).filter(ImageFilter.GaussianBlur(6))

    x_scale, y_scale, x_offset, y_offset = transform
    scaled_size = (
        max(1, round(reference.width * x_scale)),
        max(1, round(reference.height * y_scale)),
    )
    scaled_ref = reference.resize(scaled_size, Image.LANCZOS)
    scaled_ridge = ridge.resize(scaled_size, Image.LANCZOS)

    mountain = Image.new("RGB", size, (0, 0, 0))
    alpha = Image.new("L", size, 0)
    paste_box = (x_offset, y_offset, x_offset + scaled_size[0], y_offset + scaled_size[1])
    mountain.paste(scaled_ref, paste_box)
    alpha.paste(scaled_ridge, paste_box)

    mountain_np = grade_mountain(mountain)
    alpha_np = np.asarray(alpha, dtype=np.float32) / 255.0

    # The plate fades into the original cloud sea before it reaches the tent.
    y = np.arange(height)[:, None] * np.ones((1, width), dtype=np.float32)
    alpha_np *= 1.0 - smoothstep(bottom - 90, bottom, y)

    # Keep the existing foreground foliage, tent, tent platform, and rocks.
    alpha_np *= 1.0 - foliage_mask(base)

    # Feather the cut at the reference plate's trailing edge so it can never
    # read as a pasted rectangle, even beyond the information-panel scrim.
    x = np.arange(width)[None, :] * np.ones((height, 1), dtype=np.float32)
    content_end = min(width, x_offset + scaled_size[0])
    alpha_np *= 1.0 - smoothstep(content_end - 190, content_end - 10, x)
    alpha_np *= 1.0 - smoothstep(width - 25, width, x)
    alpha_np = np.clip(alpha_np, 0.0, 1.0)

    # Carry a little of the original atmosphere into the feathered seam.
    base_np = np.asarray(base, dtype=np.float32)
    haze = np.asarray(
        Image.fromarray(base_np.astype("uint8")).filter(ImageFilter.GaussianBlur(18)),
        dtype=np.float32,
    )
    edge = np.clip(1.0 - alpha_np * 1.8, 0.0, 1.0)[:, :, None]
    mountain_np = mountain_np * (1.0 - edge * 0.20) + haze * (edge * 0.20)

    composited = base_np * (1.0 - alpha_np[:, :, None]) + mountain_np * alpha_np[:, :, None]
    Image.fromarray(np.clip(composited, 0, 255).astype("uint8")).save(preview, quality=92)

    overlay = Image.fromarray(
        np.dstack([np.clip(mountain_np, 0, 255).astype("uint8"), (alpha_np * 255).astype("uint8")]),
        mode="RGBA",
    )
    overlay.save(output, "WEBP", quality=90, method=6)
    print(f"wrote {output.relative_to(ROOT)} ({overlay.size[0]}x{overlay.size[1]}, {output.stat().st_size // 1024} KiB)")
    print(f"wrote {preview.relative_to(ROOT)}")


DESKTOP_RIDGE = [
    (0, 455), (90, 448), (180, 438), (270, 452), (360, 458), (450, 452),
    (520, 438), (575, 420), (625, 430), (700, 448), (780, 452), (850, 438),
    (920, 410), (990, 378), (1060, 348), (1120, 320), (1175, 292), (1228, 282),
    (1272, 304), (1315, 332), (1360, 345), (1410, 342), (1470, 356), (1535, 368),
    (1600, 392), (1672, 410),
]

# Portrait reference is a crop of the same painting, from low ridge to the
# snow line, excluding the reference's own tent and foreground.
MOBILE_REFERENCE_CROP = (650, 240, 1672, 660)
MOBILE_RIDGE = [
    (0, 205), (70, 198), (140, 190), (210, 196), (280, 200), (340, 187),
    (410, 168), (470, 128), (520, 92), (565, 48), (600, 40), (635, 58),
    (680, 95), (720, 120), (770, 128), (820, 120), (870, 140), (920, 152),
    (970, 164), (1022, 178),
]


if __name__ == "__main__":
    build_plate(
        base_path=DESKTOP_BASE,
        reference_crop=(0, 0, 1672, 941),
        ridge_points=DESKTOP_RIDGE,
        transform=(0.82, 1.0, -180, 55),
        bottom=640,
        output=ASSETS / "Images" / "mountain-about-desktop.webp",
        preview=ROOT / "tests" / "artifacts" / "mountain-composite-desktop.jpg",
        size=(1672, 941),
    )

    build_plate(
        base_path=MOBILE_BASE,
        reference_crop=MOBILE_REFERENCE_CROP,
        ridge_points=MOBILE_RIDGE,
        # Crop is 1022x420. Scale it just under portrait width and drop it into
        # the cloud band, with its summit below the live-sky horizon.
        transform=(941 / 1022, (941 / 1022), 0, 545),
        bottom=900,
        output=ASSETS / "Images" / "mountain-about-mobile.webp",
        preview=ROOT / "tests" / "artifacts" / "mountain-composite-mobile.jpg",
        size=(941, 1672),
    )
