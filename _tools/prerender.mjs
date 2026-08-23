#!/usr/bin/env node
/* Pre-render the shop grid, the shop ItemList JSON-LD and the home featured block from data/products.json,
   using THE SAME renderer the browser uses (assets/js/render.js), so the static HTML and the live repaint
   can never drift. No dependencies.

   usage:  node _tools/prerender.mjs          write the blocks (only when something changed)
           node _tools/prerender.mjs --check  exit 1 if any block would change (used by verify.py)

   Markers (kept verbatim in the pages):
     shop/index.html   <!-- products:start --> ... <!-- products:end -->
                       <!-- itemlist:start --> ... <!-- itemlist:end -->
                       <p class="shop-count" id="shopCount" aria-live="polite">N pieces available</p>
     index.html        <!-- featured:start --> ... <!-- featured:end --> */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const C = require(path.join(ROOT, "assets", "js", "config.js"));
const R = require(path.join(ROOT, "assets", "js", "render.js"));
const CHECK = process.argv.includes("--check");
let failures = 0, changes = 0;

function read(rel) { return readFileSync(path.join(ROOT, rel), "utf8"); }
function replaceBetween(src, start, end, inner, label) {
  const a = src.indexOf(start), b = src.indexOf(end);
  if (a < 0 || b < 0 || b < a) { console.error(`MISSING markers ${start} / ${end} in ${label}`); failures++; return src; }
  return src.slice(0, a + start.length) + "\n" + inner + "\n" + src.slice(b);
}
function commit(rel, next) {
  const prev = read(rel);
  if (prev === next) { console.log(`unchanged  ${rel}`); return; }
  changes++;
  if (CHECK) { console.log(`WOULD CHANGE  ${rel}`); return; }
  writeFileSync(path.join(ROOT, rel), next.replace(/\r\n/g, "\n"), "utf8");
  console.log(`written    ${rel}`);
}

/* ---- load and validate the catalogue ---- */
const data = JSON.parse(read("data/products.json"));
const list = (data.products || []).map(R.normalizeProduct).filter(Boolean);
if (list.length !== (data.products || []).length) { console.error("some records could not be normalised"); failures++; }
for (const p of list) {
  const err = R.validateProduct(p, list);
  if (err) { console.error(`INVALID ${p.id} (${p.name}): ${err}`); failures++; }
  for (const img of p.images) {
    if (!existsSync(path.join(ROOT, img))) { console.error(`MISSING IMAGE ${p.id}: ${img}`); failures++; }
  }
}
if (failures) process.exit(1);
const sorted = R.sortFeatured(list);

/* ---- shop page ---- */
const shopRel = "shop/index.html";
if (existsSync(path.join(ROOT, shopRel))) {
  let shop = read(shopRel);
  const cards = sorted.map(p => R.productCard(p, { root: "../", heading: "h3" })).join("\n");
  shop = replaceBetween(shop, "<!-- products:start -->", "<!-- products:end -->", cards, shopRel);
  const ld = '  <script type="application/ld+json" id="ld-items">' + JSON.stringify(R.itemListLd(sorted, C.SITE_URL)) + "</script>";
  shop = replaceBetween(shop, "<!-- itemlist:start -->", "<!-- itemlist:end -->", ld, shopRel);
  const avail = list.filter(p => p.inStock).length;
  shop = shop.replace(/(<p class="shop-count" id="shopCount" aria-live="polite">)([^<]*)(<\/p>)/, `$1${avail} ${avail === 1 ? "piece" : "pieces"} available$3`);
  commit(shopRel, shop);
} else { console.error(`missing ${shopRel}`); failures++; }

/* ---- home featured ---- */
const homeRel = "index.html";
if (existsSync(path.join(ROOT, homeRel))) {
  let home = read(homeRel);
  const inStock = list.filter(p => p.inStock);
  let featured = R.sortFeatured(inStock.filter(p => p.featured));
  if (featured.length < 3) featured = inStock.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  featured = featured.slice(0, 6);
  const cards = featured.map(p => R.productCard(p, { root: "./", heading: "h3" })).join("\n");
  home = replaceBetween(home, "<!-- featured:start -->", "<!-- featured:end -->", cards, homeRel);
  commit(homeRel, home);
} else { console.error(`missing ${homeRel}`); failures++; }

if (failures) process.exit(1);
if (CHECK && changes) { console.log(`prerender --check: ${changes} file(s) out of date; run node _tools/prerender.mjs`); process.exit(1); }
console.log(CHECK ? "prerender --check: up to date" : `prerender: done (${changes} file(s) written)`);
