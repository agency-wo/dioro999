# DiOro999.9

Static shop for gold, silver and watches, priced in US dollars. Home, shop, blog, cart, checkout (order request), and an owner admin that publishes straight to GitHub. No framework, no build step for the pages, no server. Hosted on GitHub Pages from this repository (`agency-wo/dioro999`, branch `main`, root).

Live preview: https://agency-wo.github.io/dioro999/ until a custom domain is attached.

## Folder map

```
index.html                    home (featured pieces are pre-rendered between <!-- featured:start/end -->)
shop/index.html               the shop (grid pre-rendered between <!-- products:start/end -->, repainted live)
product/index.html            product page, client-rendered from ?id=<slug> (noindex until Phase 2)
cart/  checkout/              cart and the order request
about/ contact/ shipping-and-returns/ privacy/ terms/  content pages
blog/index.html + blog/<slug>/index.html             six guides
admin.html                    owner admin (noindex; see "Admin")
404.html  robots.txt  sitemap.xml  llms.txt  favicon.*  apple-touch-icon.png
assets/css/                   styles.css (design system), shop.css, pdp.css, pages.css, blog.css, admin.css
assets/js/                    config.js (ALL site constants), render.js (shared renderer), site.js, shop.js,
                              home.js, product.js, cart.js, checkout.js, contact.js, blog.js, post.js, admin.js
assets/fonts/                 Cormorant Garamond and Inter (self-hosted variable woff2)
assets/img/shop/              placeholder SVGs and the owner's uploaded photos (never deleted)
assets/img/blog/ brand/       post hero art, logo, favicon source, og-default.jpg
data/products.json            THE catalogue (the only data file the shop reads)
_tools/                       verify.py, sync_chrome.py, contrast.py, prerender.mjs, build_sitemap.py,
                              smoke.mjs, hash.mjs, make_icons.py, make_og.py
```

## Preview locally

```
python -m http.server 8131
```
then open http://127.0.0.1:8131/ . The admin works on localhost too (the Web Crypto API needs https or localhost).

## Verify before claiming anything is done

```
python _tools/sync_chrome.py --apply    # stamps index.html's header/footer into every page (with the page's prefix)
node   _tools/prerender.mjs             # rewrites the shop grid, the ItemList JSON-LD and the home featured block from products.json
python _tools/build_sitemap.py          # sitemap.xml from the indexable pages
python _tools/contrast.py               # token contrast (WCAG)
python _tools/verify.py [--strict]      # the 24-check static gate; GATE PASS / GATE FAIL
$env:SMOKE_ADMIN_PW = "<password>"; node _tools/smoke.mjs; Remove-Item Env:SMOKE_ADMIN_PW   # Playwright end-to-end (GitHub and Web3Forms mocked)
```
The smoke test uses the Playwright install at `Minafy/node_modules/playwright` on this machine (`PW_DIR` overrides it).

## Admin: how publishing works

The admin page runs entirely in the owner's browser. After login it reads `data/products.json` and, when the owner adds, edits, marks sold out or removes a piece, it **commits to this repository through the GitHub Contents API** with a fine-grained personal access token. Photos are resized in the browser (longest edge 1200 px, JPEG) and committed under `assets/img/shop/` before the JSON is written. The JSON is re-read from GitHub right before every write and a sha conflict is retried once, so two devices cannot overwrite each other. GitHub Pages redeploys in 1 to 2 minutes.

- Login: username `olsi` (case-insensitive), password as agreed. The password is NOT in the repo; `assets/js/admin.js` holds a PBKDF2-SHA256 hash (`SALT`, `LOGIN_HASH`). To rotate it: `$env:DIORO_PW = "<new password>"; node _tools/hash.mjs Olsi; Remove-Item Env:DIORO_PW` and paste the two printed lines into admin.js, then bump `?v=`.
- Publish key (the token): created once, pasted into the admin once per device, stored only in that browser's localStorage, encrypted with an AES-GCM key derived from the login password. It is never in the repo.
- The login hash is public by design; the token is the real protection. Without a token the admin can be browsed but cannot publish.

### Setting up the owner's phone (Olsi)

1. Create the key, logged in to GitHub as the account that owns this repo (agency-wo), in a browser: https://github.com/settings/personal-access-tokens/new . Name it (e.g. "DiOro admin, Olsi phone"), longest expiry, Repository access: Only select repositories -> `dioro999`, Permissions -> Repository permissions -> Contents: Read and write. Generate, copy. (Alternative: invite Olsi as a collaborator with write access and let him create the token from his own account.)
2. On his phone, open https://agency-wo.github.io/dioro999/admin.html in Chrome or Safari (not inside another app), log in, paste the key in "Publish key", Save key. It answers "Key saved on this device" after checking it with GitHub.
3. On an iPhone: Share -> Add to Home Screen and open the admin from there. Safari deletes site data after 7 days without a visit, which would make the admin ask for the key again; the Home Screen app is exempt. Keep the key in a password manager so it can be pasted again.
4. Add a test piece, see it in the shop after 1 to 2 minutes, then remove it.
5. Note the token expiry date; a new one is needed after it.

## Placeholders to replace before launch

| Where | What |
|---|---|
| `assets/js/config.js` | `SITE_URL` (the domain), `PHONE_DISPLAY`, `PHONE_E164`, `WHATSAPP`, `EMAIL`, `ADDRESS`, `HOURS`, `SOCIAL`, `WEB3FORMS_KEY` |
| every page's chrome and JSON-LD | the same phone / email / address values (written statically so they exist with JS off; `verify.py` check 10 compares them with config.js); `sync_chrome.py --apply` after editing index.html's chrome |
| `checkout/index.html`, `contact/index.html` | the hidden `access_key` value (Web3Forms) |
| `data/products.json` | all 24 seed records carry `"placeholder": true`; replace them from the admin (editing a piece clears the flag) |
| `_tools/verify.py`, `robots.txt`, canonicals, sitemap | `HOST` / `SITE_URL` when the domain changes; then add a `CNAME` file |
| `assets/img/brand/og-default.jpg` | regenerate with `_tools/make_og.py` if the wordmark changes |

## Hard rules

- Bump `?v=` on every CSS/JS change (`?v=1` today) on every page; `verify.py` check 17 fails on mixed values.
- Never delete product photos from `assets/img/shop/`; old listings may still reference them.
- Owner-typed text is rendered with `textContent`, never `innerHTML`. Every string that reaches `innerHTML` goes through `R.esc()`.
- No em dashes or en dashes anywhere (check 14). No inline `<style>`, `style=""` or inline `<script>` (the CSP meta forbids them; JSON-LD blocks are fine).
- Relative paths only (`./`, `../`, `../../`), never site-absolute `/...` (the site lives under `/dioro999/` until it has a domain). Every page carries `<html data-root="...">` equal to its depth.
- `data/products.json` must stay under about 800 KB (the admin warns) so the Contents API keeps returning it inline.

## Payments later

Checkout today sends an order request (email via Web3Forms plus a WhatsApp message) and takes no payment. `assets/js/checkout.js` has a `startPayment(order)` hook keyed by `PAYMENT_PROVIDER` in config.js:
- **PayPal**: client-side Smart Buttons with `PAYPAL_CLIENT_ID`; no server. Extend the checkout page CSP (script-src/connect-src/frame-src for paypal.com).
- **Stripe**: a small Cloudflare Worker that creates a Checkout Session with the secret key; `STRIPE_CHECKOUT_URL` points at it. Card data never touches this site.
Neither needs the GitHub token; that is only for the admin.

## Phase 2

`_tools/prerender.mjs --products` (to add) writes `/shop/<slug>/index.html` per product and a GitHub Action runs it whenever `data/products.json` changes, so product pages become crawlable and `PRETTY_PRODUCT_URLS` can be switched on in config.js.
