#!/usr/bin/env python3
"""Raw phone photo -> catalogue image, and the product wired to it.

WHAT IT IS FOR. Every one of the 24 products currently shows a drawing. This is how a drawing is
retired: photograph the piece, drop the file in _source/photos, run this. It cuts the background
out, squares the piece on white at 1200x1200, writes assets/img/shop/<slug>.webp and .jpg, points
the product at the photo and clears its `placeholder` flag, which is what removes the
"Illustration" tag from the card and the note from the product page.

ADAPTED FROM watch-repair-shop/scripts/process-new-watch-images.py [UTIL-006], which has done this
job for the watch.al catalogue for months. The cutout, the alpha hardening, the bbox trim and the
scale-to-fit are that script's, including the reasons its comments give for each. TWO THINGS ARE
DELIBERATELY DIFFERENT, and both are footguns that script's own header warns about:

  1. THERE IS NO JOBS LIST. Sources are found by filename in _source/photos, so a finished job
     cannot be left behind. The original says "CLEAR FINISHED JOBS BEFORE EVERY RUN" because a
     stale entry silently re-encodes an untouched product, and webp/jpeg encoding is not
     byte-reproducible, so it lands in the diff as a real change nobody made.
  2. IT DOES NOT OVERWRITE UNCONDITIONALLY. A photo whose output is already newer than its source
     is skipped. --force re-encodes anyway, which is what you want after changing a quality
     setting or a better crop.

NAMING IS THE INTERFACE. _source/photos/<slug>.jpg is the cover; <slug>-2.jpg, <slug>-3.jpg are
extra views, in that order, up to the four render.js keeps. The slug must be a product's slug in
data/products.json; an unknown one is an error, not a silent skip, because a typo would otherwise
look like a successful run that changed nothing.

1200x1200 IS NOT ADJUSTABLE. render.js writes width="1200" height="1200" on every product image,
so the browser reserves that box before the file loads. Any other shape either distorts or shifts
the layout as it arrives.

usage:
    python _tools/make_product_images.py              # process what is new
    python _tools/make_product_images.py --force      # re-encode everything present
    python _tools/make_product_images.py --dry-run    # say what would happen, write nothing
    python _tools/make_product_images.py --mask lum   # bright piece on a DARK backdrop
    python _tools/make_product_images.py --holes      # rings and hoops: keep the hole open

Needs Pillow, numpy and rembg (and scipy for --mask lum). rembg downloads its model on first use,
so the first run needs the network and is slow.
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "_source" / "photos"
OUT = ROOT / "assets" / "img" / "shop"
DATA = ROOT / "data" / "products.json"

CANVAS = 1200        # must match the width/height render.js writes on every product img
MARGIN = 90          # white padding around the piece, scaled from the 800/60 the watch tool uses
WEBP_Q = 82
JPG_Q = 88
ALPHA_CUT = 128      # alpha below this is a cutout smear, not the piece (see process)
MAX_IMAGES = 4       # render.js keeps the first four
LUM_AT = 60
LUM_CLOSE = 7

NAME_RE = re.compile(r"^(?P<slug>[a-z0-9]+(?:-[a-z0-9]+)*?)(?:-(?P<n>[2-9]))?$")


def lum_cutout(original):
    """Separate a bright piece from a dark backdrop by threshold rather than by salience. Closes
    small gaps so a chain reads as one object, keeps only the largest blob so a detached
    reflection is dropped, then fills interior holes so the gap between links is not punched
    through the piece. Worth reaching for on polished gold, which defeats salience models."""
    import numpy as np
    from PIL import Image, ImageFilter
    from scipy import ndimage                      # only this path needs it

    grey = np.asarray(original.convert("L"))
    mask = Image.fromarray(((grey >= LUM_AT) * 255).astype("uint8"), "L")
    mask = mask.filter(ImageFilter.MaxFilter(LUM_CLOSE)).filter(ImageFilter.MinFilter(LUM_CLOSE))
    arr = (np.asarray(mask) > 127).astype("uint8")

    labels, n = ndimage.label(arr)
    if not n:
        raise SystemExit("luminance mask found nothing; is the backdrop actually dark?")
    sizes = ndimage.sum(arr, labels, range(1, n + 1))
    arr = ndimage.binary_fill_holes(labels == (int(np.argmax(sizes)) + 1))

    out = original.copy()
    out.putalpha(Image.fromarray((arr * 255).astype("uint8"), "L"))
    return out


def punch_holes(cutout, original, min_frac=0.004):
    """Reopen the backdrop that a cutout model sealed inside the piece.

    FOUND BY TESTING, and it matters here more than it did for watches: rembg returns a filled
    silhouette, so a ring comes back as a DISC and the finished card shows the desk sitting in
    the middle of the band. Rings, hoops and open bangles are a large part of this catalogue.

    NO COLOUR TOLERANCE TO TUNE. A fixed "within N of the backdrop" test was tried first and got
    only the rim of the hole: what shows through a ring is the desk IN SHADOW, several shades
    darker than the desk around it, so any threshold tight enough to protect the piece is too
    tight to reach the middle of the hole. Instead each kept pixel is assigned to whichever it
    resembles more, the backdrop or the piece, which does not care how dark the shadow is.

    The piece's own colour is re-measured once with the first pass's candidates removed. Without
    that the ring's hole, being a large part of what the model kept, drags the piece's average
    towards the backdrop and the test collapses.

    A hole must also not touch the frame edge, which is what separates an enclosed hole from the
    backdrop around the piece, and must be bigger than min_frac of the piece, so a grey
    reflection on polished silver is not mistaken for a gap.

    Opt-in, because a genuinely backdrop-coloured piece - an oxidised silver signet on a grey
    cloth - is exactly the case it gets wrong. Look at the result.
    """
    import numpy as np
    from PIL import Image
    from scipy import ndimage

    # Colours come from the ORIGINAL: rembg zeroes the RGB of what it removes, so sampling the
    # cutout gives a backdrop colour of black and nothing ever matches.
    rgb = np.asarray(original.convert("RGB")).astype("float32")
    keep = np.asarray(cutout.getchannel("A")) > 0
    if keep.all() or not keep.any():
        return cutout, 0

    bg = np.median(rgb[~keep], axis=0)
    d_bg = np.linalg.norm(rgb - bg, axis=2)
    fg_pixels = keep
    for _ in range(2):
        if not fg_pixels.any():
            return cutout, 0
        fg = np.median(rgb[fg_pixels], axis=0)
        looks_bg = (d_bg < np.linalg.norm(rgb - fg, axis=2)) & keep
        fg_pixels = keep & ~looks_bg

    labels, n = ndimage.label(looks_bg)
    if not n:
        return cutout, 0
    edge = set(labels[0].tolist()) | set(labels[-1].tolist())         | set(labels[:, 0].tolist()) | set(labels[:, -1].tolist())
    floor = min_frac * keep.sum()
    holes = np.zeros_like(looks_bg)
    found = 0
    for i in range(1, n + 1):
        if i in edge:
            continue
        blob = labels == i
        if blob.sum() >= floor:
            holes |= blob
            found += 1
    if not found:
        return cutout, 0
    a = np.asarray(cutout.getchannel("A")).copy()
    a[holes] = 0
    out = cutout.copy()
    out.putalpha(Image.fromarray(a, "L"))
    return out, found


_SESSIONS = {}


def _session(model):
    if model not in _SESSIONS:
        from rembg import new_session
        _SESSIONS[model] = new_session(model)
    return _SESSIONS[model]


def process(src: Path, stem: str, mask: str = "auto", holes: bool = False) -> tuple:
    """Cut out, square on white, write both encodings. Returns (webp, jpg) paths."""
    from PIL import Image
    from rembg import remove

    original = Image.open(src).convert("RGBA")

    if mask == "lum":
        cutout = lum_cutout(original)
    elif mask == "isnet":
        # Segments on shape rather than salience, which is what separates a dark piece from a
        # dark backdrop when the other two modes cannot.
        cutout = remove(original, session=_session("isnet-general-use"))
    else:
        cutout = remove(original)

    # Harden the alpha BEFORE measuring. getbbox() counts any pixel with alpha above zero, so a
    # few hundred nearly-invisible ones are enough to move the box, and a translucent smear that
    # is invisible on white will still shrink the piece to a corner of the card.
    alpha = cutout.getchannel("A").point(lambda v: 255 if v >= ALPHA_CUT else 0)
    cutout.putalpha(alpha)

    if holes:
        cutout, n = punch_holes(cutout, original)
        if n:
            print(f"    reopened {n} enclosed hole(s)")

    bbox = cutout.getbbox()
    if not bbox:
        raise SystemExit(f"{src.name}: the cutout is empty. Try --mask lum or --mask isnet.")
    return square_on_white(cutout.crop(bbox), stem)


def square_on_white(subject, stem: str) -> tuple:
    """Scale a trimmed RGBA subject to fit the canvas less its margin, centre it on white and
    write both encodings. Shared so every product image, whatever produced it, lands at the same
    size with the same padding: a grid where one item is drawn larger than its neighbours reads
    as sloppier than either image is on its own."""
    from PIL import Image

    target = CANVAS - 2 * MARGIN
    w, h = subject.size
    scale = min(target / w, target / h)
    size = (max(1, round(w * scale)), max(1, round(h * scale)))
    subject = subject.resize(size, Image.LANCZOS)

    canvas = Image.new("RGBA", (CANVAS, CANVAS), (255, 255, 255, 255))
    canvas.paste(subject, ((CANVAS - size[0]) // 2, (CANVAS - size[1]) // 2), subject)
    rgb = canvas.convert("RGB")

    OUT.mkdir(parents=True, exist_ok=True)
    webp, jpg = OUT / f"{stem}.webp", OUT / f"{stem}.jpg"
    rgb.save(webp, "WEBP", quality=WEBP_Q, method=6)
    rgb.save(jpg, "JPEG", quality=JPG_Q, optimize=True)
    return webp, jpg


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--force", action="store_true", help="re-encode even when the output is newer")
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    ap.add_argument("--mask", choices=("auto", "lum", "isnet"), default="auto")
    ap.add_argument("--holes", action="store_true",
                    help="reopen backdrop sealed inside the piece: rings, hoops, open bangles")
    a = ap.parse_args()

    if not SRC.is_dir():
        print(f"No source folder. Put photos in {SRC.relative_to(ROOT)}/<slug>.jpg and run again.")
        return 0

    doc = json.loads(DATA.read_text(encoding="utf-8"))
    by_slug = {p["slug"]: p for p in doc["products"]}

    photos = sorted(p for p in SRC.iterdir()
                    if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp", ".heic"))
    if not photos:
        print(f"No photos in {SRC.relative_to(ROOT)}.")
        return 0

    # Resolve every filename to a product BEFORE encoding anything, so a typo fails the run
    # instead of half-processing it.
    jobs, bad = [], []
    for src in photos:
        # An exact slug wins over the -n split, so a product whose slug genuinely ends in a digit
        # is never mistaken for the extra view of a shorter one.
        if src.stem in by_slug:
            jobs.append((src, src.stem, src.stem, 1))
            continue
        m = NAME_RE.match(src.stem)
        slug = m.group("slug") if m else None
        if slug not in by_slug:
            bad.append(src.name)
            continue
        jobs.append((src, src.stem, slug, int(m.group("n") or 1)))
    if bad:
        print("These filenames do not name a product slug in products.json:")
        for n in bad:
            print("  " + n)
        print("\nRename them to <slug>.jpg, or <slug>-2.jpg for a second view. Nothing was written.")
        return 1

    done, skipped = {}, 0
    for src, stem, slug, n in sorted(jobs, key=lambda j: (j[2], j[3])):
        webp = OUT / f"{stem}.webp"
        if not a.force and webp.exists() and webp.stat().st_mtime >= src.stat().st_mtime:
            skipped += 1
            done.setdefault(slug, []).append((n, f"assets/img/shop/{stem}.webp"))
            continue
        if a.dry_run:
            print(f"  would write {stem}.webp and {stem}.jpg from {src.name}")
            done.setdefault(slug, []).append((n, f"assets/img/shop/{stem}.webp"))
            continue
        w, j = process(src, stem, a.mask, a.holes)
        print(f"  {slug}: {src.name} -> {w.name} ({w.stat().st_size // 1024} KB), "
              f"{j.name} ({j.stat().st_size // 1024} KB)")
        done.setdefault(slug, []).append((n, f"assets/img/shop/{stem}.webp"))

    # Point each product at its photos and clear the flag. The .jpg is written as a hand fallback
    # but not referenced: every browser in use reads webp, and a single <img> can only name one.
    changed = []
    for slug, entries in done.items():
        p = by_slug[slug]
        imgs = [path for _, path in sorted(entries)][:MAX_IMAGES]
        if p.get("images") != imgs or p.get("placeholder") is not False:
            p["images"] = imgs
            p["placeholder"] = False
            changed.append(slug)

    if changed and not a.dry_run:
        DATA.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    verb = "would point" if a.dry_run else "pointed"
    print(f"\n{len(photos)} photo(s), {skipped} already current. "
          f"{verb} {len(changed)} product(s) at real photos: {', '.join(sorted(changed)) or 'none'}")
    if changed:
        print("Now run: node _tools/prerender.mjs && python _tools/verify.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
