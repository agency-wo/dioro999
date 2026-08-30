# DiOro999.9 (this repo)

Read `README.md` first. It explains the folder map, the publish model and the tools.

- Run `python _tools/verify.py` (and `node _tools/smoke.mjs` for behaviour changes) before claiming anything is done.
- After touching index.html's header or footer: `python _tools/sync_chrome.py --apply`. After touching `data/products.json`, `render.js` or the card markup: `node _tools/prerender.mjs`.
- Product pictures: `python _tools/make_placeholders.py` redraws the illustrations; `python _tools/make_product_images.py` turns `_source/photos/<slug>.jpg` into the real photo and clears that product's `placeholder` flag (add `--holes` for rings). Two items at different prices may never share a cover image; verify.py check 24 enforces it.
- Never write the admin password into any file. `admin.js` holds only a PBKDF2 hash; rotate with `_tools/hash.mjs` (password via env var).
- Relative paths only. No inline style or script (CSP). No em or en dashes. Bump `?v=` on every CSS/JS change.
- Owner data is rendered with `textContent`; anything that reaches `innerHTML` goes through `R.esc()`.
- Denied in the wider workspace (never open): any `admin.js` of butik Viktoria, Intimo Bruna, watch-repair-shop, victoria-boutique-starter; `Minafy/.env`; `Jur/config.js`; any `wrangler.toml`; `part tracker/inventory-watches.csv`.
