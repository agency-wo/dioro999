#!/usr/bin/env python3
"""Draw the placeholder illustrations, one per product shape, in the house style.

WHY THIS EXISTS. 24 products shared 13 images, so a shopper could not tell a 640 EUR rope chain
from a 3000 EUR Cuban link, or a 110 EUR digital sports watch from a 3250 EUR moon phase. They
were all showing the same picture. That is the single most expensive thing wrong with the shop:
the item that costs five times more looked identical to the cheap one.

WHY DRAWINGS AND NOT PHOTOS. These are illustrations and are labelled as such on the page. They
are deliberately NOT photorealistic: the pieces are real stock at real prices, and an invented
photo of an item a customer then receives is a refund and a reputation problem. A drawing that
clearly reads as a drawing tells the truth while still showing what shape of thing is for sale.
Real photographs replace these one at a time; `placeholder` flips to false per item as they land.

WHY THE WATCHES ARE ARCHETYPES. Eight of the products are named-brand watches. These draw generic
TYPES - dive, digital, chronograph, dress, integrated bracelet, field, moon phase - and never a
particular manufacturer's design. Imitating a real watch's trade dress in a drawing sold as that
watch would be a worse problem than the one being fixed. Official press images from the
distributor are the right source for those eight.

usage:
    python _tools/make_placeholders.py            # write any that changed
    python _tools/make_placeholders.py --check    # report drift, write nothing
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "img" / "shop"

# Copied verbatim from the hand-made placeholders so every illustration shares one palette.
# m/r = gold sweeps, b = gold bead, sl = steel, st = dark strap, dl = dark dial,
# v = vignette, s = ground shadow, h = highlight blur.
DEFS = """<defs>
<radialGradient id="v" cx=".5" cy=".5" r=".72"><stop offset=".55" stop-color="#F4F0E8" stop-opacity="0"/><stop offset="1" stop-color="#F4F0E8"/></radialGradient>
<filter id="s" x="-40%" y="-100%" width="180%" height="300%"><feGaussianBlur stdDeviation="24"/></filter>
<filter id="h" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
<linearGradient id="m" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E3C98A"/><stop offset=".42" stop-color="#C9A15A"/><stop offset=".74" stop-color="#9A7A38"/><stop offset="1" stop-color="#C9A15A"/></linearGradient>
<linearGradient id="r" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9A7A38"/><stop offset=".4" stop-color="#C9A15A"/><stop offset=".78" stop-color="#E3C98A"/><stop offset="1" stop-color="#C9A15A"/></linearGradient>
<radialGradient id="b" cx=".35" cy=".32" r=".8"><stop offset="0" stop-color="#E3C98A"/><stop offset=".5" stop-color="#C9A15A"/><stop offset="1" stop-color="#9A7A38"/></radialGradient>
<linearGradient id="st" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#15151A"/><stop offset=".5" stop-color="#0B0B0D"/><stop offset="1" stop-color="#15151A"/></linearGradient>
<linearGradient id="sl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F2F2F0"/><stop offset=".45" stop-color="#C9C9C4"/><stop offset=".8" stop-color="#8F8F8A"/><stop offset="1" stop-color="#C9C9C4"/></linearGradient>
<radialGradient id="dl" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#1E1E24"/><stop offset="1" stop-color="#0B0B0D"/></radialGradient>
<radialGradient id="wh" cx=".38" cy=".3" r=".85"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".6" stop-color="#EDECE8"/><stop offset="1" stop-color="#D6D4CE"/></radialGradient>
<linearGradient id="gem" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset=".45" stop-color="#DCEAF2"/><stop offset="1" stop-color="#A9C3D2"/></linearGradient>
</defs>"""

FRAME = ('<rect width="1200" height="1200" fill="#FDFCF8"/>'
         '<rect width="1200" height="1200" fill="url(#v)"/>'
         '<rect x="40" y="40" width="1120" height="1120" fill="none" stroke="#E8D5A3" stroke-width="2"/>')
GLINT = ('<ellipse cx="470" cy="430" rx="140" ry="48" transform="rotate(-38 470 430)" fill="#FDFCF8" opacity=".07"/>'
         '<ellipse cx="430" cy="372" rx="38" ry="13" transform="rotate(-38 430 372)" fill="#FDFCF8" opacity=".33" filter="url(#h)"/>')


def shadow(cx=600, cy=912, rx=320, ry=44):
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#0B0B0D" opacity=".18" filter="url(#s)"/>'


def doc(label, body):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" '
            f'viewBox="0 0 1200 1200" role="img" aria-label="{label}, placeholder illustration">\n'
            f'<title>{label} (illustration)</title>\n{DEFS}\n{FRAME}\n{body}\n{GLINT}\n</svg>\n')


# ----------------------------------------------------------------- watch parts
def strap_dark():
    return ('<rect x="472" y="112" width="256" height="256" rx="36" fill="url(#st)"/>'
            '<path d="M494 132V348M706 132V348" stroke="#9A7A38" stroke-width="2" stroke-dasharray="10 8" opacity=".7"/>'
            '<rect x="472" y="832" width="256" height="256" rx="36" fill="url(#st)"/>'
            '<path d="M494 852V1068M706 852V1068" stroke="#9A7A38" stroke-width="2" stroke-dasharray="10 8" opacity=".7"/>')


def strap_bracelet():
    """Three-link steel, so it reads differently from leather at thumbnail size."""
    out = []
    for y in (112, 188, 264, 832, 908, 984):
        out.append(f'<rect x="474" y="{y}" width="252" height="64" rx="16" fill="url(#sl)" stroke="#8F8F8A" stroke-width="3"/>')
        out.append(f'<rect x="556" y="{y + 8}" width="88" height="48" rx="10" fill="#E4E3DF" opacity=".55"/>')
    return "".join(out)


def crown(x=886):
    return (f'<rect x="{x}" y="578" width="46" height="44" rx="8" fill="url(#sl)"/>'
            f'<path d="M{x + 14} 586V614M{x + 26} 586V614M{x + 38} 586V614" stroke="#8F8F8A" stroke-width="2"/>')


def pushers():
    return ('<rect x="880" y="500" width="38" height="34" rx="7" fill="url(#sl)"/>'
            '<rect x="880" y="666" width="38" height="34" rx="7" fill="url(#sl)"/>')


def case_round(r=300):
    return f'<circle cx="600" cy="600" r="{r}" fill="url(#sl)"/>'


def case_cushion():
    return '<rect x="300" y="300" width="600" height="600" rx="150" fill="#22242A" stroke="#3A3D45" stroke-width="8"/>'


def case_tonneau():
    return ('<path d="M600 296c118 0 190 22 214 46s46 96 46 258-22 234-46 258-96 46-214 46'
            '-190-22-214-46-46-96-46-258 22-234 46-258 96-46 214-46z" fill="url(#sl)" '
            'stroke="#8F8F8A" stroke-width="4"/>')


def bezel_plain(dial="dl"):
    return (f'<circle cx="600" cy="600" r="272" fill="none" stroke="#8F8F8A" stroke-width="5"/>'
            f'<circle cx="600" cy="600" r="258" fill="url(#{dial})" stroke="#15151A" stroke-width="6"/>')


def bezel_dive(dial="dl"):
    """A dive bezel only reads if it CONTRASTS with the dial. The first version drew a #14161C
    insert against a near-black dial and disappeared entirely: the rendered watch was
    indistinguishable from the plain one, which was the whole bug being fixed."""
    ticks = "".join(
        f'<rect x="-5" y="-288" width="10" height="30" rx="2" transform="rotate({a})" fill="#E3C98A"/>'
        for a in range(0, 360, 30))
    fine = "".join(
        f'<rect x="-2" y="-286" width="4" height="16" transform="rotate({a})" fill="#8FA6C4" opacity=".75"/>'
        for a in range(0, 360, 6) if a % 30)
    return ('<circle cx="600" cy="600" r="300" fill="#1F3A5F" stroke="#C9C9C4" stroke-width="7"/>'
            f'<g transform="translate(600 600)">{fine}{ticks}'
            '<polygon points="0,-306 16,-274 -16,-274" fill="#E3C98A"/></g>'
            '<circle cx="600" cy="600" r="256" fill="none" stroke="#C9C9C4" stroke-width="5"/>'
            f'<circle cx="600" cy="600" r="250" fill="url(#{dial})"/>')


def bezel_coin(dial="wh"):
    teeth = "".join(
        f'<rect x="-3" y="-296" width="6" height="22" transform="rotate({a})" fill="#8F8F8A"/>'
        for a in range(0, 360, 6))
    return (f'<circle cx="600" cy="600" r="286" fill="url(#sl)"/><g transform="translate(600 600)">{teeth}</g>'
            f'<circle cx="600" cy="600" r="256" fill="url(#{dial})" stroke="#B4B2AC" stroke-width="5"/>')


def markers(fill="#C9A15A", r=236):
    out = []
    for a in range(0, 360, 30):
        long_ = a % 90 == 0
        out.append(f'<rect x="-5" y="-{r}" width="10" height="{46 if long_ else 32}" rx="2" '
                   f'transform="rotate({a})" fill="{fill}"/>')
    return f'<g transform="translate(600 600)">{"".join(out)}</g>'


def numerals(fill="#E8E6E0"):
    """Field-watch style: an outer 1-12 and an inner 13-24, drawn as ticks plus text."""
    out = []
    for i in range(12):
        a = i * 30
        out.append(f'<text x="0" y="-196" transform="rotate({a}) rotate({-a} 0 -196)" fill="{fill}" '
                   f'font-family="Helvetica,Arial,sans-serif" font-size="42" font-weight="600" '
                   f'text-anchor="middle">{12 if i == 0 else i}</text>')
        out.append(f'<text x="0" y="-142" transform="rotate({a}) rotate({-a} 0 -142)" fill="#C9A15A" '
                   f'font-family="Helvetica,Arial,sans-serif" font-size="26" text-anchor="middle" '
                   f'opacity=".8">{24 if i == 0 else 12 + i}</text>')
    return f'<g transform="translate(600 600)">{"".join(out)}</g>'


def hands(gold=True):
    c = "url(#m)" if gold else "#E8E6E0"
    return (f'<g transform="translate(600 600)">'
            f'<polygon points="0,-158 13,-22 0,22 -13,-22" transform="rotate(-60)" fill="{c}"/>'
            f'<polygon points="0,-226 10,-22 0,22 -10,-22" transform="rotate(60)" fill="{c}"/>'
            f'<path d="M0 40V-222" stroke="#E3C98A" stroke-width="3" transform="rotate(210)" stroke-linecap="round"/>'
            f'<circle r="13" fill="url(#b)"/></g>')


def subdial(cx, cy, r=64, fill="#15181E"):
    return (f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}" stroke="#8F8F8A" stroke-width="3"/>'
            f'<circle cx="{cx}" cy="{cy}" r="4" fill="#C9A15A"/>'
            f'<path d="M{cx} {cy}L{cx + int(r * .55)} {cy - int(r * .45)}" stroke="#C9A15A" stroke-width="4" stroke-linecap="round"/>')


def date_window(cx=790, cy=600):
    return (f'<rect x="{cx - 34}" y="{cy - 26}" width="68" height="52" rx="6" fill="#F2F2F0" stroke="#8F8F8A" stroke-width="3"/>'
            f'<text x="{cx}" y="{cy + 16}" fill="#15151A" font-family="Helvetica,Arial,sans-serif" '
            f'font-size="40" font-weight="600" text-anchor="middle">8</text>')


def moon_aperture(cx=600, cy=738):
    return (f'<path d="M{cx - 96} {cy}a96 62 0 0 1 192 0z" fill="#0E1730" stroke="#8F8F8A" stroke-width="3"/>'
            f'<circle cx="{cx - 34}" cy="{cy - 20}" r="30" fill="#E9E4CF"/>'
            f'<circle cx="{cx - 44}" cy="{cy - 28}" r="6" fill="#CFC7AC" opacity=".8"/>'
            f'<circle cx="{cx - 24}" cy="{cy - 12}" r="4" fill="#CFC7AC" opacity=".7"/>'
            f'<circle cx="{cx + 52}" cy="{cy - 26}" r="7" fill="#E9E4CF" opacity=".9"/>'
            f'<circle cx="{cx + 22}" cy="{cy - 34}" r="4" fill="#E9E4CF" opacity=".7"/>')


def lcd():
    return ('<rect x="392" y="480" width="416" height="240" rx="18" fill="#0F1A16" stroke="#2A3A33" stroke-width="6"/>'
            '<rect x="416" y="504" width="368" height="90" rx="8" fill="#243A31" opacity=".55"/>'
            '<text x="600" y="668" fill="#9EE8C8" font-family="Helvetica,Arial,sans-serif" font-size="96" '
            'font-weight="700" letter-spacing="6" text-anchor="middle">10:58</text>'
            '<text x="600" y="566" fill="#7FCFB0" font-family="Helvetica,Arial,sans-serif" font-size="40" '
            'letter-spacing="4" text-anchor="middle">MON 8</text>')


# ------------------------------------------------------------- jewellery parts
def rope_chain():
    """A twisted rope strand: reads clearly different from flat interlocking links."""
    seg = []
    for i in range(13):
        x = 236 + i * 61
        y = 600 + (26 if i % 2 else -26)
        seg.append(f'<ellipse cx="{x}" cy="{y}" rx="46" ry="30" transform="rotate({38 if i % 2 else -38} {x} {y})" '
                   f'fill="none" stroke="url(#m)" stroke-width="30"/>')
        seg.append(f'<ellipse cx="{x}" cy="{y}" rx="46" ry="30" transform="rotate({38 if i % 2 else -38} {x} {y})" '
                   f'fill="none" stroke="#E3C98A" stroke-width="6" opacity=".55"/>')
    return shadow(600, 760, 380, 34) + '<g transform="rotate(-6 600 600)">' + "".join(seg) + "</g>"


def solitaire():
    return (shadow(600, 880, 250, 34) +
            '<ellipse cx="600" cy="720" rx="216" ry="200" fill="none" stroke="url(#m)" stroke-width="52"/>'
            '<ellipse cx="600" cy="720" rx="216" ry="200" fill="none" stroke="#E3C98A" stroke-width="9" opacity=".45"/>'
            '<path d="M498 486h204M516 452h168" stroke="url(#m)" stroke-width="16" stroke-linecap="round"/>'
            '<path d="M486 486l58-70h112l58 70-114 118z" fill="url(#gem)" stroke="#7FA3BA" stroke-width="4" stroke-linejoin="round"/>'
            '<path d="M544 416h112M486 486h228M544 416l-58 70M656 416l58 70" stroke="#FFFFFF" stroke-width="3" opacity=".8"/>'
            '<path d="M486 486l114 118 114-118M544 486l56 118M656 486l-56 118" stroke="#FFFFFF" stroke-width="2.5" opacity=".55"/>'
            '<path d="M520 470l40-40" stroke="#FFFFFF" stroke-width="6" opacity=".9" stroke-linecap="round"/>'
            '<path d="M494 500c-8 26 6 52 24 62M706 500c8 26-6 52-24 62" stroke="url(#m)" stroke-width="15" fill="none" stroke-linecap="round"/>')


def signet():
    return (shadow(600, 880, 240, 34) +
            '<ellipse cx="600" cy="700" rx="212" ry="196" fill="none" stroke="url(#sl)" stroke-width="54"/>'
            '<ellipse cx="600" cy="700" rx="212" ry="196" fill="none" stroke="#F2F2F0" stroke-width="8" opacity=".5"/>'
            '<ellipse cx="600" cy="462" rx="150" ry="118" fill="url(#sl)" stroke="#8F8F8A" stroke-width="6"/>'
            '<ellipse cx="600" cy="462" rx="112" ry="86" fill="#4A4A48" opacity=".55"/>'
            '<ellipse cx="562" cy="428" rx="44" ry="24" transform="rotate(-28 562 428)" fill="#FDFCF8" opacity=".28"/>')


def coin():
    teeth = "".join(f'<rect x="-4" y="-286" width="8" height="26" transform="rotate({a})" fill="#9A7A38"/>'
                    for a in range(0, 360, 5))
    return (shadow(600, 900, 280, 40) +
            f'<circle cx="600" cy="600" r="286" fill="url(#b)"/>'
            f'<g transform="translate(600 600)">{teeth}</g>'
            '<circle cx="600" cy="600" r="252" fill="url(#m)" stroke="#9A7A38" stroke-width="5"/>'
            '<circle cx="600" cy="600" r="212" fill="none" stroke="#E3C98A" stroke-width="4" opacity=".7"/>'
            '<text x="600" y="580" fill="#7A5E28" font-family="Helvetica,Arial,sans-serif" font-size="86" '
            'font-weight="700" text-anchor="middle" opacity=".85">999.9</text>'
            '<text x="600" y="668" fill="#7A5E28" font-family="Helvetica,Arial,sans-serif" font-size="44" '
            'letter-spacing="8" text-anchor="middle" opacity=".7">FINE GOLD</text>')


# --------------------------------------------------------------------- catalogue
def band_side():
    """A second view of the plain band, seen edge on, so the wedding band has a real two-photo
    gallery. It needs two: smoke.mjs clicks the second thumbnail and asserts the main image
    changes, and its stand-in second image was the generic fallback blob."""
    return (shadow(600, 800, 250, 34) +
            '<ellipse cx="600" cy="600" rx="330" ry="112" fill="url(#r)"/>'
            '<ellipse cx="600" cy="600" rx="330" ry="112" fill="none" stroke="#9A7A38" stroke-width="3"/>'
            '<path d="M270 600a330 112 0 0 0 660 0v-96a330 112 0 0 1-660 0z" fill="url(#m)" stroke="#9A7A38" stroke-width="3"/>'
            '<ellipse cx="600" cy="504" rx="330" ry="112" fill="url(#b)" stroke="#9A7A38" stroke-width="3"/>'
            '<ellipse cx="600" cy="504" rx="238" ry="66" fill="#EFE9DC"/>'
            '<ellipse cx="600" cy="504" rx="238" ry="66" fill="none" stroke="#9A7A38" stroke-width="3"/>'
            '<path d="M406 456a238 66 0 0 1 120-34" stroke="#FDFCF8" stroke-width="9" fill="none" opacity=".6" stroke-linecap="round"/>')


def hoops(metal="m", edge="#9A7A38"):
    """Tube hoops: a pair of open rings seen slightly turned, so the tube reads as round stock
    rather than a flat circle. The drawing they replaced showed teardrop DROPS, which is a
    different product from the hoops the listing sells."""
    def one(cx):
        return (f'<ellipse cx="{cx}" cy="600" rx="180" ry="196" fill="none" stroke="url(#{metal})" stroke-width="46"/>'
                f'<ellipse cx="{cx}" cy="600" rx="180" ry="196" fill="none" stroke="{edge}" stroke-width="2" opacity=".55"/>'
                f'<ellipse cx="{cx}" cy="404" rx="30" ry="13" fill="url(#b)" stroke="{edge}" stroke-width="2"/>'
                f'<path d="M{cx - 118} 500a180 196 0 0 1 62-72" stroke="#FDFCF8" stroke-width="13" '
                'fill="none" opacity=".55" stroke-linecap="round"/>')
    return shadow(600, 838, 300, 34) + one(378) + one(822)


def studs(metal="m", edge="#9A7A38"):
    """Studs: two small set stones on posts. 6 mm pieces, so they are drawn small on the canvas
    on purpose - shown at hoop size they would read as something the buyer is not getting."""
    def one(cx):
        return (f'<circle cx="{cx}" cy="600" r="132" fill="url(#{metal})" stroke="{edge}" stroke-width="3"/>'
                f'<circle cx="{cx}" cy="600" r="96" fill="url(#gem)" stroke="#7FA3BA" stroke-width="3"/>'
                f'<path d="M{cx - 96} 600h192M{cx} 504v192M{cx - 68} 532l136 136M{cx + 68} 532l-136 136" '
                'stroke="#FFFFFF" stroke-width="2.5" opacity=".7"/>'
                f'<path d="M{cx - 52} 556l34-30" stroke="#FFFFFF" stroke-width="7" opacity=".9" stroke-linecap="round"/>'
                + "".join(f'<circle cx="{cx + dx}" cy="{600 + dy}" r="19" fill="url(#b)"/>'
                          for dx, dy in ((-104, 0), (104, 0), (0, -104), (0, 104))))
    return shadow(600, 782, 250, 30) + one(400) + one(800)


ITEMS = {
    # jewellery
    "placeholder-chain-rope-gold": ("Gold rope chain", rope_chain()),
    "placeholder-ring-solitaire-gold": ("Gold solitaire ring", solitaire()),
    "placeholder-coin-gold": ("Fine gold coin", coin()),
    "placeholder-ring-signet-silver": ("Silver signet ring", signet()),
    "placeholder-ring-gold-side": ("Gold wedding band, side view", band_side()),
    "placeholder-earring-hoop-gold": ("Gold tube hoop earrings", hoops()),
    "placeholder-earring-stud-silver": ("Silver stud earrings", studs("sl", "#8F8F8A")),
    # watches, drawn as generic types and never as a particular maker's design
    "placeholder-watch-digital": ("Digital sports watch", (
        shadow() + strap_dark() + case_cushion() +
        '<rect x="330" y="330" width="540" height="540" rx="120" fill="#14161C"/>' + lcd() +
        '<circle cx="352" cy="392" r="26" fill="#3A3D45"/><circle cx="848" cy="392" r="26" fill="#3A3D45"/>'
        '<circle cx="352" cy="808" r="26" fill="#3A3D45"/><circle cx="848" cy="808" r="26" fill="#3A3D45"/>')),
    "placeholder-watch-chrono": ("Chronograph watch", (
        shadow() + strap_bracelet() + crown() + pushers() + case_round() + bezel_plain() +
        markers() + subdial(600, 452) + subdial(452, 600) + subdial(748, 600) + hands())),
    "placeholder-watch-dress": ("Dress watch", (
        shadow() + strap_dark() + crown() + case_round(268) + bezel_plain("wh") +
        markers("#9A7A38", 224) + subdial(600, 748, 56, "#EDECE8") + hands())),
    "placeholder-watch-integrated": ("Integrated bracelet watch", (
        shadow() + strap_bracelet() + crown(862) + case_tonneau() + bezel_plain() +
        markers("#C9C9C4") + date_window() + hands(False))),
    "placeholder-watch-field": ("Field watch", (
        shadow() + strap_dark() + crown() + case_round(276) + bezel_plain() +
        numerals() + hands(False))),
    "placeholder-watch-moonphase": ("Moon phase watch", (
        shadow() + strap_dark() + crown() + case_round(288) + bezel_coin() +
        markers("#9A7A38", 224) + moon_aperture() + subdial(452, 560, 58, "#EDECE8") +
        subdial(748, 560, 58, "#EDECE8") + hands())),
    "placeholder-watch-sport": ("Sports dive watch", (
        shadow() + strap_bracelet() + crown() + case_round(300) + bezel_dive() +
        markers() + date_window(772) + hands())),
}


def main():
    check = "--check" in sys.argv
    changed = []
    for stem, (label, body) in ITEMS.items():
        p = OUT / f"{stem}.svg"
        new = doc(label, body)
        old = p.read_text(encoding="utf-8") if p.exists() else None
        if old == new:
            continue
        changed.append(stem)
        if not check:
            p.write_text(new, encoding="utf-8", newline="\n")
    verb = "would change" if check else "written"
    print(f"  {len(changed)} of {len(ITEMS)} {verb}" + (f": {', '.join(changed)}" if changed else ""))
    return 1 if (check and changed) else 0


if __name__ == "__main__":
    sys.exit(main())
