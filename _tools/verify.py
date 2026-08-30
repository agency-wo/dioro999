"""Site gate for DiOro999.9. Read-only. Exit 1 on any finding; warnings are listed but do not fail.

usage: python _tools/verify.py [--strict]     (--strict turns TODO/placeholder warnings into failures)

Modelled on kun/_tools/verify.py. Every check is numbered so a failure can be found here by its number.
Links are RELATIVE in this project (the site is served under a path prefix until it has its own domain),
so check 8 resolves them against the page's folder and check 8 also FAILS on any site-absolute href/src.
"""
import json, os, re, subprocess, sys, html
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "_tools"))
import sync_chrome  # noqa: E402  (expected_blocks, prefix_of)

HOST = "https://minarankstudio.com/dioro999"
STRICT = "--strict" in sys.argv
SKIP_DIRS = {"_tools", "node_modules", ".git", "__pycache__"}
CFG = (ROOT / "assets" / "js" / "config.js").read_text(encoding="utf-8")


def cfg(key):
    m = re.search(key + r':\s*"([^"]*)"', CFG)
    return m.group(1) if m else ""


PHONE_DISPLAY, PHONE_E164, WHATSAPP, EMAIL = cfg("PHONE_DISPLAY"), cfg("PHONE_E164"), cfg("WHATSAPP"), cfg("EMAIL")
KEY_PLACEHOLDER = "WEB3FORMS_ACCESS_KEY_PLACEHOLDER"
CSP_RE = re.compile(r'<meta http-equiv="Content-Security-Policy" content="([^"]+)"')

findings, warnings = [], []
def fail(page, msg): findings.append(f"{page}: {msg}")
def warn(page, msg): (findings if STRICT else warnings).append(f"{page}: {msg}")

pages = sorted(p for p in ROOT.rglob("*.html") if not (set(p.relative_to(ROOT).parts) & SKIP_DIRS))


def url_of(p: Path) -> str:
    rel = p.relative_to(ROOT).as_posix()
    if rel == "index.html": return "/"
    if rel.endswith("/index.html"): return "/" + rel[:-len("index.html")]
    return "/" + rel


class Collector(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags, self.text_parts, self.ids = [], [], set()
        self.stack, self.faq, self._faq_cur = [], [], None
        self.in_ld, self.ld, self.ld_cur = False, [], None
        self.h1, self._h1_buf = [], None
        self.inline_style_attr, self.inline_style_tag, self.inline_script = 0, 0, 0
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        self.tags.append((tag, a))
        self.stack.append(tag)
        if a.get("id"): self.ids.add(a["id"])
        if "style" in a: self.inline_style_attr += 1
        if tag == "style": self.inline_style_tag += 1
        if tag == "script":
            if a.get("type") == "application/ld+json": self.in_ld = True; self.ld_cur = []
            elif not a.get("src"): self.inline_script += 1
        if tag == "h1": self._h1_buf = []
        if tag == "details" and "faq-item" in (a.get("class") or ""):
            self._faq_cur = {"q": [], "a": [], "in_summary": False}
        if tag == "summary" and self._faq_cur is not None: self._faq_cur["in_summary"] = True
    def handle_startendtag(self, tag, attrs): self.handle_starttag(tag, attrs); self.handle_endtag(tag)
    def handle_endtag(self, tag):
        if tag == "script" and self.in_ld: self.in_ld = False; self.ld.append("".join(self.ld_cur)); self.ld_cur = None
        if tag == "h1" and self._h1_buf is not None:
            self.h1.append(" ".join("".join(self._h1_buf).split())); self._h1_buf = None
        if tag == "summary" and self._faq_cur is not None: self._faq_cur["in_summary"] = False
        if tag == "details" and self._faq_cur is not None:
            self.faq.append((" ".join("".join(self._faq_cur["q"]).split()), " ".join("".join(self._faq_cur["a"]).split())))
            self._faq_cur = None
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i] == tag: del self.stack[i:]; break
    def handle_data(self, data):
        if self.in_ld: self.ld_cur.append(data); return
        if self._h1_buf is not None: self._h1_buf.append(data)
        if self._faq_cur is not None:
            (self._faq_cur["q"] if self._faq_cur["in_summary"] else self._faq_cur["a"]).append(data)
        if self.stack and self.stack[-1] not in ("script", "style"): self.text_parts.append(data)


def strip_comments(s): return re.sub(r"<!--.*?-->", "", s, flags=re.S)


def resolve(page: Path, href: str):
    """Return ('ext'|'skip'|'abs'|Path, fragment)."""
    if not href: return "skip", ""
    frag = href.split("#", 1)[1] if "#" in href else ""
    path = href.split("#")[0].split("?")[0]
    if href.startswith(("http:", "https:", "mailto:", "tel:", "data:", "//", "javascript:")): return "ext", frag
    if href.startswith("/"): return "abs", frag
    if not path: return page if frag else "skip", frag
    target = (page.parent / path).resolve()
    if path.endswith("/"): target = target / "index.html"
    return target, frag


titles, descs, versions, csps = {}, {}, set(), set()
sitemap_urls = set(re.findall(r"<loc>(.*?)</loc>", (ROOT / "sitemap.xml").read_text(encoding="utf-8"))) if (ROOT / "sitemap.xml").exists() else set()
indexable_urls = set()
master_blocks = sync_chrome.load_master(ROOT)

for p in pages:
    rel = p.relative_to(ROOT).as_posix()
    raw = p.read_text(encoding="utf-8")
    src = strip_comments(raw)
    url = url_of(p)
    is_admin = rel == "admin.html"
    c = Collector(); c.feed(src)
    text = " ".join(" ".join(c.text_parts).split())
    head = raw[:8000]
    noindex = bool(re.search(r'<meta name="robots" content="noindex', head))
    if not noindex and not is_admin: indexable_urls.add(HOST + url)

    # 1 one h1
    if len(c.h1) != 1: fail(rel, f"check 1: expected one <h1>, found {len(c.h1)}")
    # 2 title
    m = re.search(r"<title>(.*?)</title>", src, re.S); title = html.unescape(m.group(1).strip()) if m else ""
    if not (20 <= len(title) <= 60): fail(rel, f"check 2: title length {len(title)} (want 20-60): {title!r}")
    if title in titles and rel not in ("404.html", "admin.html"): fail(rel, f"check 2: duplicate title also on {titles[title]}")
    titles.setdefault(title, rel)
    # 3 description
    m = re.search(r'<meta name="description" content="([^"]*)"', src); desc = html.unescape(m.group(1)) if m else ""
    if not (70 <= len(desc) <= 160): fail(rel, f"check 3: description length {len(desc)} (want 70-160)")
    if desc in descs: fail(rel, f"check 3: duplicate description also on {descs[desc]}")
    descs.setdefault(desc, rel)
    # 4 canonical
    m = re.search(r'<link rel="canonical" href="([^"]+)"', src)
    if not noindex and not is_admin:
        if not m: fail(rel, "check 4: no canonical")
        elif m.group(1) != HOST + url: fail(rel, f"check 4: canonical {m.group(1)} != {HOST + url}")
    # 5 OG
    if not noindex and not is_admin:
        for prop in ("og:type", "og:site_name", "og:title", "og:description", "og:url", "og:image", "og:image:alt"):
            if f'property="{prop}"' not in src: fail(rel, f"check 5: missing {prop}")
        if 'name="twitter:card"' not in src: fail(rel, "check 5: missing twitter:card")
    # 6 JSON-LD
    graph_types = []
    for block in c.ld:
        try: data = json.loads(block)
        except Exception as e: fail(rel, f"check 6: JSON-LD does not parse: {e}"); continue
        nodes = data.get("@graph", [data]) if isinstance(data, dict) else data
        for n in nodes:
            t = n.get("@type"); graph_types.extend(t if isinstance(t, list) else [t])
            if n.get("@type") == "FAQPage":
                visible = {q: a for q, a in c.faq}
                for qa in n.get("mainEntity", []):
                    q = " ".join(qa.get("name", "").split()); a = " ".join(qa.get("acceptedAnswer", {}).get("text", "").split())
                    if q not in visible: fail(rel, f"check 6: FAQPage question not visible: {q[:50]!r}")
                    elif visible[q] != a: fail(rel, f"check 6: FAQPage answer differs from the visible one for {q[:40]!r}")
    if not is_admin and not noindex:
        if "WebSite" not in graph_types: fail(rel, "check 6: no WebSite node")
        if "JewelryStore" not in graph_types: fail(rel, "check 6: no JewelryStore node")
        if rel != "index.html" and "BreadcrumbList" not in graph_types: fail(rel, "check 6: no BreadcrumbList")
        if rel.startswith("blog/") and rel != "blog/index.html" and "BlogPosting" not in graph_types: fail(rel, "check 6: blog post without BlogPosting")
    # 7 images
    first_img = True
    for tag, a in c.tags:
        if tag != "img": continue
        if "alt" not in a: fail(rel, f"check 7: img without alt: {a.get('src')}")
        if not a.get("width") or not a.get("height"): fail(rel, f"check 7: img without width/height: {a.get('src')}")
        if a.get("loading") != "lazy" and a.get("fetchpriority") != "high" and not first_img and "collage" not in (a.get("class") or "") and a.get("id") not in ("pdpImage",):
            pass  # lazy is recommended, not required, below the first image
        first_img = False
    # 8 links and assets
    for tag, a in c.tags:
        for attr in ("href", "src"):
            v = a.get(attr)
            if not v or tag == "use": continue
            if tag == "a" and a.get("rel") and "noopener" in a.get("rel") and v.startswith("http"): pass
            target, frag = resolve(p, v)
            if target == "abs": fail(rel, f"check 8: site-absolute {attr}={v} (must be relative)")
            elif isinstance(target, Path):
                if not target.exists(): fail(rel, f"check 8: {attr}={v} does not resolve ({target.relative_to(ROOT) if str(target).startswith(str(ROOT)) else target})")
                elif frag and target == p and frag not in c.ids and tag == "a": fail(rel, f"check 8: fragment #{frag} not on this page")
    # 9 third-party resources
    for tag, a in c.tags:
        v = a.get("src") if tag in ("script", "img", "iframe") else (a.get("href") if tag == "link" and a.get("rel") in ("stylesheet", "preload", "icon", "apple-touch-icon", "modulepreload") else None)
        if v and v.startswith(("http:", "https:", "//")): fail(rel, f"check 9: third-party resource {v}")
        if tag == "form" and a.get("action", "").startswith("http") and a.get("action") != "https://api.web3forms.com/submit": fail(rel, f"check 9: form action {a.get('action')}")
    # 10 NAP
    if not is_admin:
        for needle, label in ((PHONE_DISPLAY, "phone"), (PHONE_E164, "tel"), (WHATSAPP, "whatsapp"), (EMAIL, "email")):
            if needle and needle not in raw and rel not in ("404.html",) and not rel.startswith("blog/"):
                pass
        if "tel:" in raw and f"tel:{PHONE_E164}" not in raw: fail(rel, "check 10: a tel: link differs from config PHONE_E164")
        if "wa.me/" in raw and f"wa.me/{WHATSAPP}" not in raw: fail(rel, "check 10: a wa.me link differs from config WHATSAPP")
        if "mailto:" in raw and f"mailto:{EMAIL}" not in raw: fail(rel, "check 10: a mailto differs from config EMAIL")
        if re.search(r"\+1 \(\d{3}\) \d{3}-\d{4}", raw) and PHONE_DISPLAY not in raw: fail(rel, "check 10: a displayed phone differs from config PHONE_DISPLAY")
    # 11 forms
    for tag, a in c.tags:
        if tag == "form":
            if "novalidate" in a: fail(rel, "check 11: novalidate in markup (set it from JS)")
    form_count = sum(1 for t, a in c.tags if t == "form")
    w3_forms = sum(1 for t, a in c.tags if t == "form" and "web3forms" in (a.get("action") or ""))
    if w3_forms:
        if 'name="botcheck"' not in src: fail(rel, "check 11: Web3Forms form without honeypot")
        if 'name="access_key"' not in src: fail(rel, "check 11: Web3Forms form without access_key")
    if form_count:
        inputs = [(t, a) for t, a in c.tags if t in ("input", "select", "textarea") and a.get("type") not in ("hidden", "checkbox", "submit")]
        labels = {a.get("for") for t, a in c.tags if t == "label"}
        for t, a in inputs:
            if a.get("class", "").find("qf-hp") > -1: continue
            if a.get("id") not in labels and not a.get("aria-label"): fail(rel, f"check 11: control without label: {a.get('id') or a.get('name')}")
    # 13 placeholders
    if "TODO" in text: warn(rel, f"check 13: visible TODO in copy ({text.count('TODO')}x)")
    if KEY_PLACEHOLDER in raw: warn(rel, "check 13: Web3Forms access key placeholder")
    # 15 lang
    if '<html lang="en"' not in raw: fail(rel, 'check 15: <html lang="en"> missing')
    # 16 chrome identity
    if rel != "index.html" and not is_admin:
        t, b = sync_chrome.block(raw, "top"), sync_chrome.block(raw, "bottom")
        if not t or not b: fail(rel, "check 16: chrome markers missing")
        else:
            top, bottom = sync_chrome.expected_blocks(p, master_blocks, ROOT)
            if t.group(2) != top or b.group(2) != bottom: fail(rel, "check 16: chrome differs from index.html (run sync_chrome.py --apply)")
    # 17 ?v= on local assets
    for tag, a in c.tags:
        v = a.get("src") if tag == "script" else (a.get("href") if tag == "link" and a.get("rel") == "stylesheet" else None)
        if v and "assets/" in v:
            mv = re.search(r"\?v=(\w+)$", v)
            if not mv: fail(rel, f"check 17: no ?v= on {v}")
            else: versions.add(mv.group(1))
    # 18 CSP and inline code
    mc = CSP_RE.search(head)
    if not mc: fail(rel, "check 18: no CSP meta")
    else: csps.add(mc.group(1))
    if c.inline_style_attr: fail(rel, f"check 18: {c.inline_style_attr} inline style attribute(s)")
    if c.inline_style_tag: fail(rel, f"check 18: inline <style>")
    if c.inline_script: fail(rel, f"check 18: inline <script>")
    # 19 viewport, theme-color, noopener
    if 'name="viewport"' not in head: fail(rel, "check 19: no viewport")
    if 'name="theme-color"' not in head: fail(rel, "check 19: no theme-color")
    for tag, a in c.tags:
        if tag == "a" and a.get("target") == "_blank" and "noopener" not in (a.get("rel") or ""): fail(rel, f"check 19: _blank without noopener: {a.get('href')}")
    # 24 data-root
    m = re.search(r'<html\b[^>]*\bdata-root="([^"]*)"', raw)
    want = sync_chrome.prefix_of(p, ROOT)
    if not m or m.group(1) != want: fail(rel, f"check 24: data-root {m.group(1) if m else None!r} != {want!r}")
    # 25 dashes (HTML)
    for ch, name in (("—", "em dash"), ("–", "en dash")):
        if ch in raw: fail(rel, f"check 14: {name} in page")

# 12 sitemap, robots, required files
if sitemap_urls != indexable_urls:
    for u in sorted(sitemap_urls - indexable_urls): fail("sitemap.xml", f"check 12: lists {u} which is not an indexable page")
    for u in sorted(indexable_urls - sitemap_urls): fail("sitemap.xml", f"check 12: missing {u}")
robots = (ROOT / "robots.txt").read_text(encoding="utf-8") if (ROOT / "robots.txt").exists() else ""
if "Sitemap: " + HOST + "/sitemap.xml" not in robots: fail("robots.txt", "check 12: Sitemap line missing or wrong host")
if "Disallow: /admin.html" not in robots: fail("robots.txt", "check 12: admin.html not disallowed")
for req in (".nojekyll", "favicon.ico", "favicon.svg", "apple-touch-icon.png", "assets/img/brand/og-default.jpg", "llms.txt", "data/products.json", "sitemap.xml"):
    if not (ROOT / req).exists(): fail(req, "check 12: required file missing")
# 14 dashes in every text file
for p in ROOT.rglob("*"):
    if p.is_dir() or (set(p.relative_to(ROOT).parts) & SKIP_DIRS): continue
    if p.suffix.lower() not in (".html", ".css", ".js", ".mjs", ".json", ".md", ".svg", ".txt", ".py"): continue
    try: s = p.read_text(encoding="utf-8")
    except Exception: continue
    if "—" in s or "–" in s: fail(p.relative_to(ROOT).as_posix(), "check 14: em or en dash in file")
# 17 consistent versions
if len(versions) > 1: fail("site", f"check 17: mixed ?v= values across pages: {sorted(versions)}")
# 18 consistent CSP
if len(csps) > 1: fail("site", f"check 18: {len(csps)} different CSP metas across pages")
# 20 home weight
try:
    home = ROOT / "index.html"
    weight = home.stat().st_size
    for a in ("assets/css/styles.css", "assets/js/config.js", "assets/js/render.js", "assets/js/cart.js", "assets/js/site.js", "assets/js/home.js", "assets/fonts/cormorant-var.woff2", "assets/fonts/inter-var.woff2"):
        if (ROOT / a).exists(): weight += (ROOT / a).stat().st_size
    for img in re.findall(r'src="\./(assets/img/[^"]+)"', home.read_text(encoding="utf-8"))[:4]:
        if (ROOT / img).exists(): weight += (ROOT / img).stat().st_size
    if weight > 450 * 1024: fail("index.html", f"check 20: home weight {weight // 1024} KB > 450 KB")
except Exception as e:
    warn("index.html", f"check 20: could not measure ({e})")
# 21 products.json
try:
    data = json.loads((ROOT / "data" / "products.json").read_text(encoding="utf-8"))
    cats = re.findall(r'id:\s*"(gold|silver|watches)"', CFG)
    types = set(re.findall(r'"([a-z-]+)"', re.search(r"JEWEL_TYPES\s*=\s*\[(.*?)\]", CFG, re.S).group(1)))
    purities = {"gold": set(re.findall(r'"([0-9.K]+)"', re.search(r'gold:\s*\[(.*?)\]', CFG.split("PURITIES")[1]).group(1))),
                "silver": set(re.findall(r'"([0-9.K]+)"', re.search(r'silver:\s*\[(.*?)\]', CFG.split("PURITIES")[1]).group(1)))}
    ids, slugs = set(), set()
    placeholders = 0
    covers = {}
    for r in data.get("products", []):
        pid = r.get("id", "?")
        if not re.match(r"^p-\d{13}$", str(pid)): fail("products.json", f"check 21: bad id {pid}")
        if pid in ids: fail("products.json", f"check 21: duplicate id {pid}")
        if r.get("slug") in slugs: fail("products.json", f"check 21: duplicate slug {r.get('slug')}")
        ids.add(pid); slugs.add(r.get("slug"))
        if r.get("category") not in cats: fail("products.json", f"check 21: {pid} category {r.get('category')}")
        if r.get("category") == "watches":
            if r.get("type"): fail("products.json", f"check 21: {pid} watch with a type")
            if not r.get("brand"): fail("products.json", f"check 21: {pid} watch without brand")
        else:
            if r.get("type") not in types: fail("products.json", f"check 21: {pid} type {r.get('type')}")
            if r.get("purity") and r.get("purity") not in purities.get(r.get("category"), set()): fail("products.json", f"check 21: {pid} purity {r.get('purity')}")
        if not isinstance(r.get("price"), (int, float)) or not (1 <= r["price"] <= 1000000): fail("products.json", f"check 21: {pid} price {r.get('price')}")
        if len(r.get("description", "")) > 600: fail("products.json", f"check 21: {pid} description too long")
        if r.get("badge") not in ("", "New", "Sale"): fail("products.json", f"check 21: {pid} badge {r.get('badge')}")
        for img in r.get("images", []):
            if not (ROOT / img).exists(): fail("products.json", f"check 21: {pid} image missing {img}")
        if r.get("images"): covers.setdefault(r["images"][0], []).append(r)
        if r.get("placeholder") is True: placeholders += 1
    # 24 two items at different prices must never show the same cover picture.
    # This shipped once: 24 products shared 13 images, so the 640 rope chain and the 3000 Cuban
    # link were one drawing, and all eight watches from a 110 G-Shock to a 3250 moon phase were
    # another. A shopper cannot tell what the expensive one is, which is the whole job of the
    # picture. Same picture at the SAME price is fine - two 45 silver bands legitimately match.
    for img, rs in sorted(covers.items()):
        prices = sorted({r.get("price") for r in rs})
        if len(prices) > 1:
            who = ", ".join(f"{r.get('slug')} ({r.get('price')})" for r in rs)
            fail("products.json", f"check 24: {img} is the cover for differing prices: {who}")
    shop_dir = ROOT / "assets" / "img" / "shop"
    if shop_dir.is_dir():
        used = {i for rs in covers.values() for r in rs for i in r.get("images", [])}
        # placeholder-<type>-<metal>.svg is what render.js composes for an item with no picture,
        # so those are reachable even with nothing pointing at them today. Anything else that is
        # unused is either dead weight or an illustration somebody forgot to wire up.
        spare = sorted(f.name for f in shop_dir.glob("*.svg")
                       if f"assets/img/shop/{f.name}" not in used
                       and not re.match(r"^placeholder-[a-z]+-(gold|silver)\.svg$", f.name)
                       and f.name != "placeholder-generic.svg")
        if spare: warn("products.json", f"check 24: illustration(s) on disk that nothing uses: {', '.join(spare)}")
    if placeholders: warn("products.json", f"check 13: {placeholders} placeholder product(s) still in the catalogue")
except Exception as e:
    fail("products.json", f"check 21: {e}")
# 22 prerender --check
try:
    out = subprocess.run(["node", str(ROOT / "_tools" / "prerender.mjs"), "--check"], cwd=ROOT, capture_output=True, text=True, timeout=60)
    if out.returncode != 0: fail("prerender", "check 22: node _tools/prerender.mjs --check failed:\n" + (out.stdout + out.stderr).strip()[-600:])
except FileNotFoundError:
    warn("prerender", "check 22: node not found, prerender check skipped")
# 23 admin
adm = (ROOT / "assets" / "js" / "admin.js").read_text(encoding="utf-8") if (ROOT / "assets" / "js" / "admin.js").exists() else ""
if not adm: fail("admin.js", "check 23: missing")
else:
    if "PASTE-" in adm or "YOUR-" in adm: warn("admin.js", "check 23: placeholder constants remain")
    if re.search(r'\b(PASS|PASSWORD|PW)\s*=\s*["\']', adm): fail("admin.js", "check 23: a plaintext password assignment")
    if 'SALT = ""' in adm or 'LOGIN_HASH = ""' in adm: fail("admin.js", "check 23: empty SALT or LOGIN_HASH")
admh = (ROOT / "admin.html").read_text(encoding="utf-8") if (ROOT / "admin.html").exists() else ""
if 'content="noindex, nofollow"' not in admh: fail("admin.html", "check 23: noindex, nofollow missing")
admc = (ROOT / "assets" / "css" / "admin.css").read_text(encoding="utf-8") if (ROOT / "assets" / "css" / "admin.css").exists() else ""
if ".btn[hidden]" not in admc: fail("admin.css", "check 23: .btn[hidden] rule missing")

print(f"{len(pages)} pages scanned")
for w in warnings: print("WARN  " + w)
for f in findings: print("FAIL  " + f)
print("GATE PASS" if not findings else f"GATE FAIL: {len(findings)} finding(s)")
sys.exit(1 if findings else 0)
