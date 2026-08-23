"""Default Open Graph share image for DiOro (1200x630): black panel, soft gold glow, hairline frame,
the "DiOro" wordmark in Cormorant Garamond with a "999.9" hallmark stamp beside it, and one line in Inter.

Ported from kun/_tools/make_og.py. Pillow cannot read woff2, so the variable fonts are instanced to
static TTFs with fontTools (digits remapped to lining figures) and cached in $DIORO_FONT_CACHE, or
<tempdir>/dioro-fonts when that is unset. Idempotent: reruns overwrite.
usage: python _tools/make_og.py      (from any working directory) -> assets/img/brand/og-default.jpg
"""
import os
import tempfile
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img" / "brand" / "og-default.jpg"
FONTS = ROOT / "assets" / "fonts"
CACHE = Path(os.environ.get("DIORO_FONT_CACHE") or Path(tempfile.gettempdir()) / "dioro-fonts")
W, H = 1200, 630
BG, GOLD, TEXT, MUTED = (11, 11, 13), (201, 161, 90), (237, 232, 223), (181, 176, 166)
TAGLINE = "Gold, silver and watches, sold online in US dollars"


def static_font(woff2: Path, wght: int, lining: bool = False) -> Path:
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


def compose() -> Image.Image:
    canvas = Image.new("RGB", (W, H), BG)

    # soft gold glow, top right
    R = 660
    grad = ImageOps.invert(Image.radial_gradient("L")).resize((2 * R, 2 * R), Image.BILINEAR)
    grad = grad.point(lambda v: int(v * 0.12))
    mask = Image.new("L", (W, H), 0)
    mask.paste(grad, (1040 - R, 40 - R))
    canvas = Image.composite(Image.new("RGB", (W, H), GOLD), canvas, mask)

    # hairline frame
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rectangle((28, 28, W - 29, H - 29), outline=GOLD + (92,), width=2)
    canvas = Image.alpha_composite(canvas.convert("RGBA"), overlay)

    serif = static_font(FONTS / "cormorant-var.woff2", 600, lining=True)
    sans = static_font(FONTS / "inter-var.woff2", 500)
    f_word = ImageFont.truetype(str(serif), 176)
    f_mark = ImageFont.truetype(str(serif), 58)
    f_tag = ImageFont.truetype(str(sans), 28)
    d = ImageDraw.Draw(canvas)

    # layout: measure, then centre the block vertically
    x0 = 96
    wl, wt, wr, wb = f_word.getbbox("DiOro")
    ml, mt, mr, mb = f_mark.getbbox("999.9")
    tl, tt, tr, tb = f_tag.getbbox(TAGLINE)
    word_h, tag_h = wb - wt, tb - tt
    gap_rule, rule_gap, tag_gap = 30, 24, 0
    block_h = word_h + gap_rule + 2 + rule_gap + tag_h
    y0 = (H - block_h) // 2

    # wordmark
    d.text((x0 - wl, y0 - wt), "DiOro", font=f_word, fill=TEXT)
    # hallmark stamp: 999.9 in a thin gold rounded rectangle, centred on the wordmark's cap height
    pad_x, pad_y = 22, 12
    sw, sh = (mr - ml) + 2 * pad_x, (mb - mt) + 2 * pad_y
    sx = x0 + (wr - wl) + 40
    sy = y0 + word_h / 2 - sh / 2
    d.rounded_rectangle((sx, sy, sx + sw, sy + sh), radius=10, outline=GOLD, width=2)
    d.text((sx + pad_x - ml, sy + pad_y - mt), "999.9", font=f_mark, fill=GOLD)
    # short gold rule and the tagline
    ry = y0 + word_h + gap_rule
    d.line([x0, ry, x0 + 260, ry], fill=GOLD, width=2)
    d.text((x0 - tl, ry + 2 + rule_gap - tt), TAGLINE, font=f_tag, fill=MUTED)
    return canvas.convert("RGB")


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    compose().save(OUT, quality=88, optimize=True, progressive=True)
    print(OUT.relative_to(ROOT).as_posix(), OUT.stat().st_size, "bytes")


if __name__ == "__main__":
    main()
