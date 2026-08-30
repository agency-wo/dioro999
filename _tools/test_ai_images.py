"""Everything in make_ai_images that runs AFTER the API call, tested without calling the API.

The network call is one urlopen. What decides whether the finished card looks right is the rest:
finding the image in either documented response shape, trimming the model's backdrop, and landing
the subject at the same scale and padding as every other product image.
"""
import base64
import io
import json
import pathlib
import sys

sys.path.insert(0, r"c:\Users\aceto\OneDrive\Desktop\web and apps\DiOro\_tools")
sys.stdout.reconfigure(encoding="utf-8")
from PIL import Image, ImageDraw, ImageFilter                                   # noqa: E402
import make_ai_images as M                                                      # noqa: E402

OUT = pathlib.Path(r"c:\Users\aceto\OneDrive\Desktop\web and apps\DiOro\assets\img\shop")
passed = failed = 0


def check(name, cond, why=""):
    global passed, failed
    if cond:
        passed += 1
        print("PASS  " + name)
    else:
        failed += 1
        print("FAIL  " + name + ("  :: " + why if why else ""))


def fake_render(w=1024, h=1024, cx=512, cy=470, r=210, off=0):
    """Stand in for what the model returns: an object on a near-white studio sweep, off-centre,
    with a soft contact shadow, plus the faint vignette a real render carries."""
    im = Image.new("RGB", (w, h), (255, 255, 255))
    d = ImageDraw.Draw(im)
    # The contact shadow has to scale WITH the object. A fixed-height shadow makes a small object's
    # bounding box proportionally much taller, the fit then becomes height-limited, and the test
    # measures its own fixture rather than the code.
    d.ellipse([cx - r + off, cy + r - 0.19 * r, cx + r + off, cy + r + 0.11 * r],
              fill=(232, 232, 230))
    for i, c in enumerate([(150, 110, 44), (201, 161, 90), (227, 201, 138)]):
        k = i * 22
        d.ellipse([cx - r + k + off, cy - r + k, cx + r - k + off, cy + r - k], fill=c)
    return im.filter(ImageFilter.GaussianBlur(1.1))


def as_png(im):
    b = io.BytesIO()
    im.save(b, "PNG")
    return b.getvalue()


# --- 1. both documented response shapes yield the bytes -----------------------------------
data = base64.b64encode(as_png(fake_render())).decode()
check("finds the image at output_image.data",
      M.find_image({"output_image": {"data": data, "mime_type": "image/png"}}) == data)
check("finds the image inside steps[].content[]",
      M.find_image({"steps": [{"type": "model_output",
                               "content": [{"type": "text", "text": "here"},
                                           {"type": "image", "data": data}]}]}) == data)
try:
    M.find_image({"steps": [{"content": [{"type": "text", "text": "refused"}]}]})
    check("a response with no image raises", False, "it returned instead of raising")
except KeyError:
    check("a response with no image raises", True)

# --- 2. a blank frame is caught rather than published ---------------------------------------
try:
    M.trim_to_subject(as_png(Image.new("RGB", (600, 600), (255, 255, 255))), "blank")
    check("a blank frame is refused", False, "it accepted an empty image")
except SystemExit:
    check("a blank frame is refused", True)

# --- 3. the subject is trimmed off-centre and re-centred at a fixed scale --------------------
stems = []
for i, (off, r) in enumerate([(0, 210), (-260, 120), (240, 330)]):
    stem = "_test_ai_" + str(i)
    stems.append(stem)
    sub = M.trim_to_subject(as_png(fake_render(off=off, r=r)), stem)
    M.square_on_white(sub, stem)

sizes = [Image.open(OUT / (s + ".webp")).size for s in stems]
check("every output is exactly 1200x1200", all(s == (1200, 1200) for s in sizes), str(sizes))


def subject_box(stem):
    import numpy as np
    a = np.asarray(Image.open(OUT / (stem + ".jpg")).convert("RGB"))
    m = (a < 244).any(axis=2)
    ys, xs = np.where(m)
    return xs.min(), ys.min(), xs.max(), ys.max()


boxes = [subject_box(s) for s in stems]
widths = [b[2] - b[0] for b in boxes]
# The fit measures the bounding box of everything that is not backdrop, and that INCLUDES the
# contact shadow, so a render carrying a heavier shadow lands a few percent smaller than one with
# a light shadow. Measured spread across three deliberately different subjects is about 8%, which
# is not visible in a grid the way a 2x difference is. Tightening it would mean separating shadow
# from object, and the only honest way to judge whether that is worth doing is on real output.
check("subjects land at a consistent scale, within the shadow-fit tolerance",
      (max(widths) - min(widths)) / max(widths) <= 0.10,
      "spread " + str(round(100 * (max(widths) - min(widths)) / max(widths), 1)) + "% of "
      + str(widths))
centres = [((b[0] + b[2]) / 2, (b[1] + b[3]) / 2) for b in boxes]
check("subjects are centred despite being off-centre in the source",
      all(abs(cx - 600) <= 8 for cx, _ in centres), str(centres))
check("the margin is respected on every side",
      all(b[0] >= 80 and b[1] >= 80 and b[2] <= 1120 and b[3] <= 1120 for b in boxes), str(boxes))

# --- 4. the key never reaches the console ----------------------------------------------------
check("mask() removes the key from an error body",
      M.mask('{"error":"bad key AIzaSyFAKE123"}', "AIzaSyFAKE123") == '{"error":"bad key ***"}')

# --- 5. branded watches are held back, jewellery is not --------------------------------------
prods = json.loads((pathlib.Path(M.ROOT) / "data/products.json").read_text(encoding="utf-8"))["products"]
held = [p["slug"] for p in prods if not M.eligible(p, False)[0]]
check("all 8 branded watches are refused by default", len(held) == 8, str(held))
check("--include-brands lifts it", all(M.eligible(p, True)[0] for p in prods))
check("no jewellery piece is caught by the brand filter",
      all(M.eligible(p, False)[0] for p in prods if p["category"] != "watches"))

# --- 6. the prompt never carries sales copy or the wrong plurality ---------------------------
bad = [p["slug"] for p in prods
       if M.NON_VISUAL.search(M.prompt_for(p).split(" - ", 1)[-1].split(". Show")[0].split(", and nothing")[0])]
check("no prompt still contains a sales clause", not bad, str(bad))
pairs = [p["slug"] for p in prods if M.is_pair(p)]
check("both earring products are treated as pairs",
      sorted(pairs) == ["hoops-14k-18mm", "stud-earrings-925-6mm"], str(pairs))
check("a pair prompt does not say 'a single'",
      all("a single" not in M.prompt_for(p) for p in prods if M.is_pair(p)))
check("bullion keeps its stamped markings",
      "stamped into the metal" in M.prompt_for(next(p for p in prods if p["type"] == "bars-coins")))
check("jewellery forbids text and packaging",
      "no text or lettering" in M.prompt_for(next(p for p in prods if p["type"] == "rings")))

for s in stems:
    (OUT / (s + ".webp")).unlink(missing_ok=True)
    (OUT / (s + ".jpg")).unlink(missing_ok=True)

print("\n" + str(passed) + " passed, " + str(failed) + " failed")
sys.exit(1 if failed else 0)
