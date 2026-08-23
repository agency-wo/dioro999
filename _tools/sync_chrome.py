"""Keep the shared header/footer (the "chrome") identical on every page.

The chrome lives in every page between <!-- chrome:top --> ... <!-- /chrome:top --> and
<!-- chrome:bottom --> ... <!-- /chrome:bottom -->. index.html is the master copy and uses the
"./" prefix on every href/src; deeper pages get "../" or "../../" (the site is served under a
project path, so links are relative, never site-absolute).

usage:
  python _tools/sync_chrome.py           report which pages differ from index.html (exit 1 if any)
  python _tools/sync_chrome.py --apply   write the index.html chrome into every other page, with
                                         the page's own prefix and aria-current on its own nav link

Also asserts that every page's <html data-root> equals its depth prefix (reported, never rewritten).
verify.py imports expected_blocks() for check 16, so keep this module import-safe.
"""
import re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKIP = {"_tools", "node_modules", ".git"}
CHROME_EXEMPT = {"admin.html"}          # no public chrome on the admin page

# nav item -> the href it carries in the template (relative to the site root, without the prefix)
NAV_HREF = {"home": "", "shop": "shop/", "blog": "blog/", "about": "about/", "contact": "contact/"}
# top-level folder -> nav item that is "current" on those pages
NAV_FOR_TOP = {"shop": "shop", "product": "shop", "cart": "shop", "checkout": "shop",
               "blog": "blog", "about": "about", "contact": "contact"}


def pages(root=ROOT):
    return sorted(p for p in root.rglob("*.html") if not (set(p.relative_to(root).parts) & SKIP))


def prefix_of(p, root=ROOT):
    """index.html and 404.html -> "./", x/index.html -> "../", x/y/index.html -> "../../"."""
    depth = len(p.relative_to(root).parts) - 1
    return "./" if depth <= 0 else "../" * depth


def nav_key_of(p, root=ROOT):
    rel = p.relative_to(root).as_posix()
    if rel == "index.html": return "home"
    return NAV_FOR_TOP.get(rel.split("/")[0])


def block(src, name):
    return re.search(rf"(<!-- chrome:{name} -->)(.*?)(<!-- /chrome:{name} -->)", src, re.S)


def strip_current(s):
    return re.sub(r' aria-current="page"', "", s)


def rewrite_prefix(s, prefix):
    """The template is written with "./"; move it to the page's depth."""
    if prefix == "./": return s
    return s.replace('href="./', 'href="' + prefix).replace('src="./', 'src="' + prefix)


def mark_current(top, prefix, key):
    if not key: return top
    href = prefix + NAV_HREF[key]
    start = top.find('class="nav-menu"')
    if start < 0: start = 0
    needle = f'<a href="{href}">'
    i = top.find(needle, start)
    if i < 0: return top
    return top[:i] + f'<a href="{href}" aria-current="page">' + top[i + len(needle):]


def data_root_of(src):
    m = re.search(r'<html\b[^>]*\bdata-root="([^"]*)"', src)
    return m.group(1) if m else None


def load_master(root=ROOT):
    master = (root / "index.html").read_text(encoding="utf-8")
    mt, mb = block(master, "top"), block(master, "bottom")
    if not mt or not mb: raise SystemExit("index.html has no chrome markers")
    return strip_current(mt.group(2)), mb.group(2)


def expected_blocks(p, master=None, root=ROOT):
    """(top, bottom) exactly as page p should carry them."""
    top_master, bottom_master = master or load_master(root)
    prefix, key = prefix_of(p, root), nav_key_of(p, root)
    top = mark_current(rewrite_prefix(top_master, prefix), prefix, key)
    return top, rewrite_prefix(bottom_master, prefix)


def main(argv):
    apply = "--apply" in argv
    master = load_master()
    changed = mismatched = 0
    for p in pages():
        rel = p.relative_to(ROOT).as_posix()
        src = p.read_text(encoding="utf-8")
        want_root = prefix_of(p)
        have_root = data_root_of(src)
        if have_root != want_root:
            mismatched += 1
            print(f'DATA-ROOT  {rel}: data-root={have_root!r}, want {want_root!r}')
        if rel == "index.html" or p.name in CHROME_EXEMPT: continue
        t, b = block(src, "top"), block(src, "bottom")
        if not t or not b:
            print("NO MARKERS", rel); changed += 1; continue
        top, bottom = expected_blocks(p, master)
        if t.group(2) == top and b.group(2) == bottom: continue
        changed += 1
        if not apply:
            print("DIFFERS   ", rel); continue
        src = src[:t.start(2)] + top + src[t.end(2):]
        b = block(src, "bottom")
        src = src[:b.start(2)] + bottom + src[b.end(2):]
        p.write_text(src, encoding="utf-8", newline="\n")
        print("UPDATED   ", rel)
    n = len(pages())
    print(f"{changed} page(s) {'updated' if apply else 'differ'}, {mismatched} data-root mismatch(es); {n} pages scanned")
    return 1 if (mismatched or (changed and not apply)) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
