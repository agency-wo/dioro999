"""Write sitemap.xml for the indexable pages. Idempotent (writes only when the content changes).

usage: python _tools/build_sitemap.py

Indexable = every */index.html and index.html except product/, cart/, checkout/, plus nothing flat
(404.html and admin.html are excluded). lastmod = last git commit date of the file when available,
else the file mtime. The host is SITE_URL from assets/js/config.js.
"""
import re, subprocess, sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXCLUDE_TOP = {"product", "cart", "checkout", "_tools", "assets", "data", "node_modules", ".git"}


def site_url():
    cfg = (ROOT / "assets" / "js" / "config.js").read_text(encoding="utf-8")
    m = re.search(r'SITE_URL:\s*"([^"]+)"', cfg)
    if not m: raise SystemExit("SITE_URL not found in config.js")
    return m.group(1).rstrip("/")


def lastmod(p: Path) -> str:
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cI", "--", str(p.relative_to(ROOT))], cwd=ROOT, capture_output=True, text=True, timeout=10)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()[:10]
    except Exception:
        pass
    return datetime.fromtimestamp(p.stat().st_mtime, tz=timezone.utc).strftime("%Y-%m-%d")


def url_of(p: Path, host: str) -> str:
    rel = p.relative_to(ROOT).as_posix()
    if rel == "index.html": return host + "/"
    return host + "/" + rel[: -len("index.html")]


def pages():
    out = []
    for p in sorted(ROOT.rglob("index.html")):
        parts = p.relative_to(ROOT).parts
        if len(parts) > 1 and parts[0] in EXCLUDE_TOP: continue
        src = p.read_text(encoding="utf-8", errors="replace")[:6000].lower()
        if 'name="robots"' in src and "noindex" in src: continue
        out.append(p)
    return out


def main():
    host = site_url()
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for p in pages():
        lines.append(f"  <url><loc>{url_of(p, host)}</loc><lastmod>{lastmod(p)}</lastmod></url>")
    lines.append("</urlset>")
    body = "\n".join(lines) + "\n"
    target = ROOT / "sitemap.xml"
    if target.exists() and target.read_text(encoding="utf-8") == body:
        print(f"sitemap.xml unchanged ({len(lines) - 3} urls)")
        return 0
    target.write_text(body, encoding="utf-8", newline="\n")
    print(f"sitemap.xml written ({len(lines) - 3} urls)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
