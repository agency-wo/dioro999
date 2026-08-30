#!/usr/bin/env python3
"""Generate a photographic product image per item with Gemini, and wire it into the catalogue.

WHAT THIS PRODUCES, STATED PLAINLY. A photorealistic picture of a piece MATCHING each listing's
description. It is not a photograph of the item in the safe. A 50 cm 14K rope chain generated here
will look like a 50 cm 14K rope chain; the clasp, the link count and the hallmark will not be the
ones the buyer receives. That gap is the whole risk of this tool, and it is why `placeholder` is
left TRUE by default, which keeps the "Illustration" tag on the card and the note on the product
page. Pass --as-photo to clear it and present these as photographs of the stock.

BRANDED WATCHES ARE REFUSED. Seiko, Casio, Citizen, Orient, Tissot, Hamilton and Longines each
have a real, protected product design. A generated image sold as one of those models is fabricated
product photography of another company's goods, which is a different and larger problem than a
generic drawing. Those manufacturers supply retailers with official photographs of the exact
model, and that is the right source. --include-brands overrides this; it is not recommended.

THE KEY IS NEVER PRINTED and never stored by this script. It comes from GEMINI_API_KEY, or from
--env-file <path> pointing at any dotenv file, which is read only to pull that one variable.

usage:
    python _tools/make_ai_images.py --dry-run            # show every prompt, call nothing
    python _tools/make_ai_images.py --only rope-chain-14k-50
    python _tools/make_ai_images.py                      # every eligible placeholder item
    python _tools/make_ai_images.py --as-photo           # also clear the Illustration tag
    python _tools/make_ai_images.py --env-file ../Minafy/.env

After a run:  node _tools/prerender.mjs && python _tools/verify.py
"""
import argparse
import base64
import io
import json
import os
import pathlib
import re
import sys
import time
import urllib.error
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from make_product_images import CANVAS, OUT, square_on_white          # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "products.json"
ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/interactions"
MODEL = "gemini-3.1-flash-image"
TIMEOUT = 180
RETRIES = 3
WHITE_AT = 244        # a pixel this bright on every channel is backdrop, not the piece

# Watch brands whose product designs are their own. Matched against the record's brand field.
PROTECTED = {"seiko", "casio", "citizen", "orient", "tissot", "hamilton", "longines",
             "rolex", "omega", "cartier", "tag heuer", "breitling", "swatch"}

# One house style for all of them, so the finished grid looks like one shoot rather than
# twenty-four stock photos. Kept separate from the per-item description below.
STYLE = (
    "Professional e-commerce product photograph on a pure white seamless background. "
    "Centred, complete and fully in frame, shot slightly above eye level. "
    "Soft diffused studio lighting from a large softbox, gentle specular highlights on the metal, "
    "a soft contact shadow directly beneath the piece, no harsh reflections. "
    "Sharp focus across the whole object, high detail in the metal surface and texture. "
    "Colour accurate, neutral white balance. "
    "No watermark, no border, no collage, no hands, no model, no other objects in frame."
)

# What must NOT be in frame differs by what is being sold, and getting this wrong is not a small
# thing: "no text, no packaging" is right for a chain and wrong for a cast bar, which carries its
# weight and purity stamped into the metal and is sold sealed in an assay card. Telling the model
# to omit both produces a blank gold slab that looks like nothing anyone buys.
NEG_PIECE = ("No packaging, no gift box, no certificate, no display stand, "
             "and no text or lettering anywhere in the image.")
NEG_BULLION = ("The weight, purity and mint marks stamped into the metal should be crisp and "
               "legible. Add no text beyond what is physically struck into the piece itself.")

PURITY_WORDS = {
    "999.9": "999.9 fine, near pure",
    "18K": "18 karat", "14K": "14 karat", "9K": "9 karat",
    "925": "925 sterling", "999": "999 fine",
}

# Clauses that describe the SALE rather than the object. They have to go: "supplied in a gift box"
# and "certificate included" put a box and a sheet of paper in a photograph that the style block
# in the same prompt is asking to keep empty, and the two instructions then fight each other.
NON_VISUAL = re.compile(
    r"\b(supplied in a gift box|sold as a pair|sold individually|chain not included"
    r"|certificate included|price (?:is )?confirmed (?:at order|when you order)"
    r"|follows? the daily metal price)\b", re.I)

PAIR_RE = re.compile(r"\bearrings\b|\bstuds\b|\bhoops\b|\bsold as a pair\b", re.I)


def visual_only(text: str) -> str:
    """Keep the clauses that say what the piece LOOKS like, drop the ones about the transaction."""
    kept = [c.strip() for c in re.split(r"[.,](?![0-9])", text) if c.strip() and not NON_VISUAL.search(c)]
    return ", ".join(kept)


def describe(p: dict) -> str:
    """Turn one catalogue record into a precise noun phrase. Everything here is a fact already in
    products.json, so the picture cannot claim a detail the listing does not."""
    metal = "yellow gold" if p["category"] == "gold" else "sterling silver"
    low = p["name"].lower()
    if "white gold" in low:
        metal = "white gold"
    if "oxidised" in low or "oxidized" in low:
        metal = "oxidised, blackened sterling silver"

    bits = [p["name"].split(",")[0].strip().lower()]
    if p.get("purity"):
        bits.append("in " + PURITY_WORDS.get(p["purity"], p["purity"]) + " " + metal)
    else:
        bits.append("in " + metal)
    if p.get("weight_g"):
        bits.append(f"weighing {p['weight_g']} g")
    if p.get("size"):
        bits.append(f"size {p['size']}")
    desc = visual_only(p.get("description", ""))
    if desc:
        bits.append("- " + desc)
    return " ".join(bits)


def is_pair(p: dict) -> bool:
    return bool(PAIR_RE.search(p["name"] + " " + p.get("description", "")))


def prompt_for(p: dict) -> str:
    subject = (f"The subject is one matching pair of {describe(p)}. Show both pieces, side by "
               "side, and nothing else." if is_pair(p)
               else f"The subject is a single {describe(p)}, and nothing else.")
    negatives = NEG_BULLION if p.get("type") == "bars-coins" else NEG_PIECE
    return f"{STYLE} {subject} {negatives}"


def load_key(env_file: str | None) -> str:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key and env_file:
        path = pathlib.Path(env_file).expanduser()
        if not path.is_file():
            raise SystemExit(f"--env-file {path} does not exist.")
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            m = re.match(r"\s*(?:export\s+)?GEMINI_API_KEY\s*=\s*(.+)\s*$", line)
            if m:
                key = m.group(1).strip().strip('"').strip("'")
                break
        if not key:
            raise SystemExit(f"No GEMINI_API_KEY line in {path}.")
    if not key:
        raise SystemExit(
            "No API key. Set GEMINI_API_KEY, or pass --env-file pointing at a dotenv that has it.")
    return key


def generate(prompt: str, key: str) -> bytes:
    """One image, as raw bytes. Retries on the transient statuses only; a 400 or a 403 is a real
    problem with the request or the key and retrying it just burns quota."""
    body = json.dumps({
        "model": MODEL,
        "input": [{"type": "text", "text": prompt}],
        "response_format": {"type": "image", "mime_type": "image/png",
                            "aspect_ratio": "1:1", "image_size": "2K"},
    }).encode("utf-8")

    last = ""
    for attempt in range(1, RETRIES + 1):
        req = urllib.request.Request(ENDPOINT, data=body, method="POST", headers={
            "x-goog-api-key": key, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
                payload = json.loads(r.read().decode("utf-8"))
            return base64.b64decode(find_image(payload))
        except urllib.error.HTTPError as e:
            detail = e.read().decode("utf-8", "replace")[:400]
            # Never let a key reach the console through an echoed request URL or header.
            last = f"HTTP {e.code}: {mask(detail, key)}"
            if e.code not in (429, 500, 502, 503, 504):
                raise SystemExit(last)
        except (urllib.error.URLError, TimeoutError) as e:
            last = f"network: {e}"
        except (KeyError, ValueError) as e:
            last = f"unexpected response shape: {e}"
        if attempt < RETRIES:
            wait = 4 * attempt
            print(f"    {last} - retrying in {wait}s ({attempt}/{RETRIES - 1})")
            time.sleep(wait)
    raise SystemExit(f"Gave up after {RETRIES} attempts. Last error: {last}")


def find_image(payload: dict) -> str:
    """The docs give two shapes for where the bytes land, so accept either rather than assume:
    interaction.output_image.data, or a content block of type image inside steps[]."""
    out = payload.get("output_image")
    if isinstance(out, dict) and out.get("data"):
        return out["data"]
    for step in payload.get("steps", []):
        for block in step.get("content", []):
            if block.get("type") == "image" and block.get("data"):
                return block["data"]
    raise KeyError("no image in the response: " + json.dumps(payload)[:300])


def mask(text: str, key: str) -> str:
    return text.replace(key, "***") if key else text


def trim_to_subject(raw: bytes, slug: str):
    """Trim the generated backdrop and hand back an RGBA subject on a transparent ground, so it
    goes through exactly the same square-and-pad step as a real photograph. Without this the
    subject sits at whatever scale the model chose and the grid looks uneven."""
    import numpy as np
    from PIL import Image

    im = Image.open(io.BytesIO(raw)).convert("RGB")
    a = np.asarray(im)
    subject = (a < WHITE_AT).any(axis=2)
    if not subject.any():
        raise SystemExit(f"{slug}: the model returned a blank frame. Re-run it.")
    ys, xs = np.where(subject)
    # Keep the contact shadow: it is part of the look, and cropping it off leaves the piece
    # floating. Pad the measured box a little rather than cutting to it exactly.
    pad = max(4, int(0.01 * max(im.size)))
    box = (max(0, xs.min() - pad), max(0, ys.min() - pad),
           min(im.width, xs.max() + 1 + pad), min(im.height, ys.max() + 1 + pad))
    out = im.crop(box).convert("RGBA")
    if max(out.size) > CANVAS * 2:
        out.thumbnail((CANVAS * 2, CANVAS * 2), Image.LANCZOS)
    return out


def eligible(p: dict, include_brands: bool):
    if p["category"] == "watches" and not include_brands:
        if (p.get("brand") or "").strip().lower() in PROTECTED:
            return False, f"{p['brand']} is a protected watch design"
    return True, ""


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", action="append", default=[], metavar="SLUG",
                    help="one product; repeatable. Default: every eligible placeholder item")
    ap.add_argument("--dry-run", action="store_true", help="print the prompts, call nothing")
    ap.add_argument("--as-photo", action="store_true",
                    help="clear `placeholder`, removing the Illustration tag and the note")
    ap.add_argument("--include-brands", action="store_true",
                    help="also generate the branded watches. Not recommended, see the header")
    ap.add_argument("--force", action="store_true", help="regenerate even if an image exists")
    ap.add_argument("--env-file", metavar="PATH", help="dotenv holding GEMINI_API_KEY")
    a = ap.parse_args()

    doc = json.loads(DATA.read_text(encoding="utf-8"))
    by_slug = {p["slug"]: p for p in doc["products"]}

    if a.only:
        missing = [s for s in a.only if s not in by_slug]
        if missing:
            raise SystemExit("not a product slug: " + ", ".join(missing))
        picked = [by_slug[s] for s in a.only]
    else:
        picked = [p for p in doc["products"] if p.get("placeholder") is True]

    todo, held = [], []
    for p in picked:
        ok, why = eligible(p, a.include_brands)
        (todo if ok else held).append((p, why))
    if held:
        print("Held back, official photographs are the right source for these:")
        for p, why in held:
            print(f"  {p['slug']:<32} {why}")
        print()

    if not todo:
        print("Nothing to generate.")
        return 0

    if a.dry_run:
        for p, _ in todo:
            print(f"--- {p['slug']} (${p['price']:,})\n{prompt_for(p)}\n")
        print(f"{len(todo)} prompt(s). Nothing was called and nothing was written.")
        return 0

    key = load_key(a.env_file)
    changed, done = [], 0
    for i, (p, _) in enumerate(todo, 1):
        stem = p["slug"]
        webp = OUT / f"{stem}.webp"
        if webp.exists() and not a.force:
            print(f"  {stem}: already generated, --force to redo")
            continue
        print(f"[{i}/{len(todo)}] {stem} (${p['price']:,})")
        raw = generate(prompt_for(p), key)
        w, j = square_on_white(trim_to_subject(raw, stem), stem)
        print(f"    {w.name} ({w.stat().st_size // 1024} KB), {j.name} "
              f"({j.stat().st_size // 1024} KB)")
        done += 1

        imgs = [f"assets/img/shop/{stem}.webp"]
        if p.get("images") != imgs or (a.as_photo and p.get("placeholder") is not False):
            p["images"] = imgs
            if a.as_photo:
                p["placeholder"] = False
            changed.append(stem)

    if changed:
        DATA.write_bytes((json.dumps(doc, indent=2, ensure_ascii=False) + "\n").encode("utf-8"))

    print(f"\n{done} image(s) generated, {len(changed)} product(s) rewired.")
    if not a.as_photo and done:
        print("These still carry the Illustration tag and the note, because they are pictures of\n"
              "a matching piece and not of your stock. Re-run with --as-photo to drop that.")
    if changed:
        print("Now run: node _tools/prerender.mjs && python _tools/verify.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
