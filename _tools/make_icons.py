"""Raster brand icons for DiOro: the black square with "999.9" in gold Cormorant Garamond.

Writes favicon.ico (16, 32, 48), apple-touch-icon.png (180), assets/img/brand/icon-192.png and
icon-512.png. Pillow cannot read woff2 and has no OpenType layout here, so the variable font is
instanced to a static TTF with fontTools (digits remapped to the lining figures) and cached in
$DIORO_FONT_CACHE, or <tempdir>/dioro-fonts when that is unset. Idempotent: reruns overwrite.
usage: python _tools/make_icons.py      (from any working directory)
"""
import os
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / "assets" / "img" / "brand"
WOFF2 = ROOT / "assets" / "fonts" / "cormorant-var.woff2"
CACHE = Path(os.environ.get("DIORO_FONT_CACHE") or Path(tempfile.gettempdir()) / "dioro-fonts")
BLACK, GOLD = (11, 11, 13), (201, 161, 90)
TEXT = "999.9"


def static_font(woff2: Path, wght: int, lining: bool = True) -> Path:
    """Instance the variable woff2 at one weight and save a plain TTF Pillow can load."""
    CACHE.mkdir(parents=True, exist_ok=True)
    out = CACHE / f"{woff2.stem}-{wght}{'-lf' if lining else ''}.ttf"
    if out.exists():
        return out
    font = instantiateVariableFont(TTFont(woff2), {"wght": wght}, inplace=True)
    if lining:
        names = set(font.getGlyphOrder())
        for table in font["cmap"].tables:
            for code, name in list(table.cmap.items()):
                if chr(code).isdigit() and name + ".lf" in names:
                    table.cmap[code] = name + ".lf"
    font.flavor = None
    font.save(out)
    return out


def fitted_font(path: Path, target_w: float) -> ImageFont.FreeTypeFont:
    probe = ImageFont.truetype(str(path), 200)
    l, t, r, b = probe.getbbox(TEXT)
    size = max(1, round(200 * target_w / (r - l)))
    return ImageFont.truetype(str(path), size)


def mark(size: int, wght: int, ink_frac: float, hairline: bool, rounded: bool) -> Image.Image:
    """Render the mark supersampled, then downsample for clean edges."""
    ss = 4 if size <= 512 else 2
    S = size * ss
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle((0, 0, S - 1, S - 1), radius=round(S * 96 / 512), fill=BLACK + (255,))
    else:
        d.rectangle((0, 0, S - 1, S - 1), fill=BLACK + (255,))
    if hairline:
        inset = round(S * 28 / 512)
        d.rounded_rectangle((inset, inset, S - 1 - inset, S - 1 - inset), radius=round(S * 72 / 512),
                            outline=GOLD + (128,), width=max(1, round(S * 1.5 / 512)))
    font = fitted_font(static_font(WOFF2, wght), S * ink_frac)
    l, t, r, b = font.getbbox(TEXT)
    d.text(((S - (r - l)) / 2 - l, (S - (b - t)) / 2 - t), TEXT, font=font, fill=GOLD + (255,))
    return img.resize((size, size), Image.LANCZOS)


def main():
    BRAND.mkdir(parents=True, exist_ok=True)
    written = []

    # favicon.ico: rounded, transparent corners, bolder and larger text (the favicon.svg variant)
    frames = [mark(s, 700, 0.84, hairline=False, rounded=True) for s in (48, 32, 16)]
    ico = ROOT / "favicon.ico"
    frames[0].save(ico, format="ICO", sizes=[(48, 48), (32, 32), (16, 16)], append_images=frames[1:])
    written.append(ico)

    # PNG icons: full-bleed black square (iOS and Android apply their own masks), logo.svg variant
    for path, size in ((ROOT / "apple-touch-icon.png", 180), (BRAND / "icon-192.png", 192), (BRAND / "icon-512.png", 512)):
        mark(size, 600, 0.70, hairline=True, rounded=False).convert("RGB").save(path, optimize=True)
        written.append(path)

    for p in written:
        print(p.relative_to(ROOT).as_posix(), p.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
