"""Token contrast gate: parses the :root tokens out of assets/css/styles.css and checks the pairs that
carry text (4.5:1) or UI boundaries (3:1). Exit 1 on any failure. Port of kun/_tools/contrast.py.

usage: python _tools/contrast.py
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSS = (ROOT / "assets" / "css" / "styles.css").read_text(encoding="utf-8")

m = re.search(r":root\s*\{(.*?)\}", CSS, re.S)
if not m: raise SystemExit("no :root block in styles.css")
TOKENS = {k.strip(): v.strip() for k, v in re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", m.group(1))}


def hex_rgb(h):
    h = h.strip().lstrip("#")
    if len(h) == 3: h = "".join(c * 2 for c in h)
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def lum(rgb):
    def ch(c): return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(hex_rgb(TOKENS[a])), lum(hex_rgb(TOKENS[b]))
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


PAIRS = [
    ("--text", "--black", 4.5), ("--text-muted", "--black", 4.5), ("--gold", "--black", 4.5),
    ("--text", "--surface", 4.5), ("--text-muted", "--surface", 4.5),
    ("--ink", "--cream", 4.5), ("--ink", "--white", 4.5), ("--ink", "--cream-2", 4.5),
    ("--ink-muted", "--cream", 4.5), ("--ink-muted", "--white", 4.5), ("--ink-muted", "--cream-2", 4.5),
    ("--gold-text", "--cream", 4.5), ("--gold-text", "--white", 4.5), ("--gold-text", "--cream-2", 4.5),
    ("--ink", "--gold", 4.5), ("--cream", "--ink", 4.5), ("--wa-ink", "--wa", 4.5),
    ("--err", "--white", 4.5), ("--err", "--cream", 4.5), ("--ok", "--white", 4.5),
    ("--gold-line", "--cream", 3.0), ("--gold-line", "--white", 3.0),
]

fails = 0
for fg, bg, need in PAIRS:
    if fg not in TOKENS or bg not in TOKENS:
        print(f"MISSING token {fg} or {bg}"); fails += 1; continue
    r = ratio(fg, bg)
    ok = r >= need
    print(f"{'ok  ' if ok else 'FAIL'} {fg:14} on {bg:10} {r:5.2f}:1 (need {need})")
    if not ok: fails += 1
print("CONTRAST PASS" if not fails else f"CONTRAST FAIL: {fails}")
sys.exit(1 if fails else 0)
