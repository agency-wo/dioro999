#!/usr/bin/env node
/* DiOro999.9 smoke test: serves the folder with python's http.server, drives headless Chromium with
   Playwright, and exits 1 on any failure. The GitHub and Web3Forms calls are mocked; nothing leaves the
   machine.

   usage (PowerShell, from the project root):
     $env:SMOKE_ADMIN_PW = "<the admin password>"; node _tools/smoke.mjs; Remove-Item Env:SMOKE_ADMIN_PW
   Without SMOKE_ADMIN_PW the positive admin login steps are skipped (reported as SKIP).
   PW_DIR overrides the Playwright install (default: the Minafy node_modules copy on this machine). */
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const PW_DIR = process.env.PW_DIR || "C:/Users/aceto/OneDrive/Desktop/web and apps/Minafy/node_modules/playwright";
const { chromium } = require(PW_DIR);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.SMOKE_PORT || 8131);
const BASE = process.env.SMOKE_BASE || `http://127.0.0.1:${PORT}`;
const ADMIN_PW = process.env.SMOKE_ADMIN_PW || "";
const products = JSON.parse(readFileSync(path.join(ROOT, "data/products.json"), "utf8")).products;

let pass = 0, failCount = 0, skip = 0;
const ok = (name) => { pass++; console.log("PASS  " + name); };
const bad = (name, why) => { failCount++; console.log("FAIL  " + name + (why ? "  :: " + why : "")); };
const skp = (name, why) => { skip++; console.log("SKIP  " + name + (why ? "  :: " + why : "")); };
async function step(name, fn) { try { await fn(); ok(name); } catch (e) { bad(name, e && e.message ? e.message : String(e)); } }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

/* ---- local server ---- */
let server = null;
if (!process.env.SMOKE_BASE) {
  server = spawn("python", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
  let up = false;
  for (let i = 0; i < 50 && !up; i++) {
    try { const r = await fetch(BASE + "/data/products.json"); up = r.ok; } catch (e) { await sleep(200); }
  }
  if (!up) { console.error("server did not start"); if (server) server.kill(); process.exit(1); }
}

const browser = await chromium.launch({ headless: true });
function newPage(ctx) {
  return ctx.newPage();
}
function watch(page) {
  const errors = [], failed = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  page.on("requestfailed", r => failed.push(r.url()));
  page.on("response", r => { if (r.status() >= 400 && !/favicon/.test(r.url())) failed.push(r.status() + " " + r.url()); });
  return { errors, failed };
}

try {
  /* ---- 1. every page loads cleanly at desktop and phone sizes ---- */
  const PAGES = ["/", "/shop/", "/product/?id=classic-band-18k", "/cart/", "/checkout/", "/about/", "/contact/", "/shipping-and-returns/", "/privacy/", "/terms/", "/blog/", "/blog/gold-purity-karats-hallmarks/", "/404.html", "/admin.html"];
  for (const size of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: size });
    for (const url of PAGES) {
      await step(`load ${url} @${size.width}`, async () => {
        const page = await newPage(ctx); const w = watch(page);
        const res = await page.goto(BASE + url, { waitUntil: "networkidle" });
        assert(res && (res.ok() || url === "/404.html"), "status " + (res && res.status()));
        await sleep(300);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        assert(overflow <= 1, "horizontal overflow " + overflow + "px");
        assert(w.errors.length === 0, "console errors: " + w.errors.slice(0, 3).join(" | "));
        assert(w.failed.length === 0, "failed requests: " + w.failed.slice(0, 3).join(" | "));
        await page.close();
      });
    }
    await ctx.close();
  }

  /* ---- 2. the shop ---- */
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  let page = await newPage(ctx);
  await page.goto(BASE + "/shop/", { waitUntil: "networkidle" });
  await page.waitForFunction(() => document.querySelectorAll("#shopGrid .product-card").length > 0);
  const inStock = products.filter(p => p.inStock);
  await step("shop: count says 24 pieces", async () => {
    await page.waitForFunction((n) => (document.getElementById("shopCount").textContent || "").indexOf(String(n)) > -1, inStock.length, { timeout: 5000 });
  });
  await step("shop: Gold chip narrows to the gold records", async () => {
    await page.click('#catChips [data-filter="gold"]');
    const want = products.filter(p => p.category === "gold").length;
    await page.waitForFunction((n) => document.querySelectorAll("#shopGrid .product-card").length === n, want, { timeout: 5000 });
    assert(page.url().indexOf("cat=gold") > -1, "url lacks cat=gold: " + page.url());
  });
  await step("shop: type chips derived and sorted by count", async () => {
    const labels = await page.$$eval("#typeChips [data-sub]", els => els.map(e => e.getAttribute("data-sub")));
    assert(labels[0] === "all", "first chip is not All");
    const counts = {}; products.filter(p => p.category === "gold").forEach(p => { counts[p.type] = (counts[p.type] || 0) + 1; });
    const want = Object.keys(counts).sort((a, b) => (counts[b] - counts[a]) || a.localeCompare(b));
    assert(JSON.stringify(labels.slice(1)) === JSON.stringify(want), "got " + labels.slice(1).join(",") + " want " + want.join(","));
  });
  await step("shop: search 'chain' narrows", async () => {
    await page.click('#catChips [data-filter="all"]');
    await page.fill("#shopSearch", "chain");
    const want = products.filter(p => /chain/i.test(p.name + " " + p.description + " " + p.type)).length;
    await page.waitForFunction((n) => document.querySelectorAll("#shopGrid .product-card").length === n, want, { timeout: 5000 });
    await page.fill("#shopSearch", "");
    await sleep(200);
  });
  await step("shop: price ascending sort", async () => {
    await page.selectOption("#shopSort", "price-asc");
    await sleep(300);
    const prices = await page.$$eval("#shopGrid .product-card .price", els => els.map(e => Number(e.textContent.replace(/[^0-9.]/g, ""))));
    for (let i = 1; i < prices.length; i++) assert(prices[i] >= prices[i - 1], "not ascending at " + i);
    await page.selectOption("#shopSort", "featured");
  });
  /* the slider must sit mid-viewport: near the bottom edge the WhatsApp FAB would be under the cursor */
  async function centerSlider() {
    await page.evaluate(() => document.getElementById("priceSliderWrap").scrollIntoView({ block: "center" }));
    await sleep(300);
  }
  await step("shop: drag max handle to the middle -> $0 - $1,500", async () => {
    await centerSlider();
    const wrap = await page.$("#priceSliderWrap"); const box = await wrap.boundingBox();
    const h = await page.$("#handleMax"); const hb = await h.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await sleep(300);
    const label = await page.textContent("#priceRangeDisplay");
    const m = label.match(/\$0 - \$([0-9,]+)$/); assert(m, "label " + label);
    const v = Number(m[1].replace(/,/g, "")); assert(v >= 1450 && v <= 1550, "max " + v);
    const n = await page.$$eval("#shopGrid .product-card", els => els.length);
    assert(n < products.length, "count did not drop: " + n);
  });
  await step("shop: ArrowRight on min handle -> $25 and ?min=", async () => {
    await page.focus("#handleMin");
    await page.keyboard.press("ArrowRight");
    await sleep(300);
    const label = await page.textContent("#priceRangeDisplay");
    assert(label.indexOf("$25 - ") === 0, "label " + label);
    assert(page.url().indexOf("min=25") > -1, "url " + page.url());
  });
  await step("shop: drag max to the far right -> $3,000+", async () => {
    await centerSlider();
    const wrap = await page.$("#priceSliderWrap"); const box = await wrap.boundingBox();
    const h = await page.$("#handleMax"); const hb = await h.boundingBox();
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 20, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
    await sleep(300);
    const label = await page.textContent("#priceRangeDisplay");
    assert(/\$3,000\+$/.test(label), "label " + label);
  });
  await step("shop: ?cat=watches&type=Seiko restores the chips", async () => {
    await page.goto(BASE + "/shop/?cat=watches&type=Seiko", { waitUntil: "networkidle" });
    await page.waitForSelector('#typeChips [data-sub="Seiko"]');
    assert((await page.getAttribute('#catChips [data-filter="watches"]', "aria-pressed")) === "true", "watches chip not pressed");
    assert((await page.getAttribute('#typeChips [data-sub="Seiko"]', "aria-pressed")) === "true", "Seiko chip not pressed");
    const n = await page.$$eval("#shopGrid .product-card", els => els.length);
    assert(n === products.filter(p => p.brand === "Seiko").length, "count " + n);
  });

  /* ---- 3. product, cart, checkout ---- */
  const p1 = products.find(p => p.slug === "classic-band-18k");
  await step("product: renders name, JSON-LD, thumbs, add to cart", async () => {
    await page.goto(BASE + "/product/?id=classic-band-18k", { waitUntil: "networkidle" });
    await page.waitForSelector("#pdp:not([hidden])");
    assert((await page.textContent("#pdpTitle")).trim() === p1.name, "h1");
    const ld = await page.$eval("#ld-product", e => JSON.parse(e.textContent));
    assert(ld[0]["@type"] === "Product", "ld type");
    const before = await page.getAttribute("#pdpImage", "src");
    await page.click(".pdp-thumb:nth-child(2) , #pdpThumbs li:nth-child(2) button");
    const after = await page.getAttribute("#pdpImage", "src");
    assert(before !== after, "thumb did not swap");
    await page.click("#pdpAdd");
    await page.waitForFunction(() => (document.querySelector(".cart-count") || {}).textContent === "1", null, { timeout: 3000 });
  });
  await step("cart: qty + doubles subtotal, remove empties", async () => {
    await page.goto(BASE + "/cart/", { waitUntil: "networkidle" });
    await page.waitForSelector("#cartLines .cart-line");
    const sub1 = await page.textContent("#cartSubtotal");
    await page.click('#cartLines [data-action="inc"]');
    await page.waitForFunction(() => document.querySelector('#cartLines [data-action="qty"]').value === "2", null, { timeout: 3000 });
    const sub2 = await page.textContent("#cartSubtotal");
    const n1 = Number(sub1.replace(/[^0-9.]/g, "")), n2 = Number(sub2.replace(/[^0-9.]/g, ""));
    assert(Math.abs(n2 - n1 * 2) < 0.01, `subtotal ${sub1} -> ${sub2}`);
    await page.click("#cartLines .cart-remove");
    await page.waitForSelector("#cartEmpty:not([hidden])");
  });
  await step("checkout: validation, success path, cart cleared", async () => {
    await page.evaluate(() => window.DIORO_CART.add("p-1787133600001", 1));
    await page.goto(BASE + "/checkout/", { waitUntil: "networkidle" });
    await page.waitForSelector("#checkoutGrid:not([hidden])");
    await page.click("#sendOrder");
    await sleep(200);
    const inv = await page.$$eval('[aria-invalid="true"]', els => els.length);
    assert(inv > 0, "no aria-invalid after empty submit");
    const focusedInvalid = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("aria-invalid") === "true");
    assert(focusedInvalid, "first invalid not focused");
    await page.route("**/api.web3forms.com/**", r => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) }));
    await page.fill("#coName", "Smoke Tester"); await page.fill("#coEmail", "smoke@example.com"); await page.fill("#coPhone", "+1 555 123 4567");
    await page.fill("#coAddress", "1 Test Street"); await page.fill("#coCity", "Testville"); await page.fill("#coPostal", "12345"); await page.check("#coPrivacy");
    await page.click("#sendOrder");
    await page.waitForSelector("#orderSent:not([hidden])", { timeout: 5000 });
    const wa = await page.getAttribute("#waAfter", "href");
    assert(wa.indexOf("DO-") > -1, "wa link lacks ref");
    const count = await page.evaluate(() => window.DIORO_CART.count());
    assert(count === 0, "cart not cleared: " + count);
    await page.unroute("**/api.web3forms.com/**");
  });
  await step("checkout: failure keeps the cart", async () => {
    await page.evaluate(() => window.DIORO_CART.add("p-1787133600001", 1));
    await page.goto(BASE + "/checkout/", { waitUntil: "networkidle" });
    await page.waitForSelector("#checkoutGrid:not([hidden])");
    await page.route("**/api.web3forms.com/**", r => r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false }) }));
    await page.fill("#coName", "Smoke Tester"); await page.fill("#coEmail", "smoke@example.com"); await page.fill("#coPhone", "+1 555 123 4567");
    await page.fill("#coAddress", "1 Test Street"); await page.fill("#coCity", "Testville"); await page.fill("#coPostal", "12345"); await page.check("#coPrivacy");
    await page.click("#sendOrder");
    await page.waitForFunction(() => document.getElementById("coSay").classList.contains("is-err"), null, { timeout: 5000 });
    const count = await page.evaluate(() => window.DIORO_CART.count());
    assert(count === 1, "cart was cleared on failure");
    await page.unroute("**/api.web3forms.com/**");
    await page.evaluate(() => window.DIORO_CART.clear());
  });

  /* ---- 4. blog ---- */
  await step("blog: chips and search filter the cards", async () => {
    await page.goto(BASE + "/blog/", { waitUntil: "networkidle" });
    await page.click('#blogCats [data-cat="silver"]');
    const goldHidden = await page.$eval('.post-card[data-cat="gold"]', e => e.hidden);
    const silverShown = await page.$eval('.post-card[data-cat="silver"]', e => !e.hidden);
    assert(goldHidden && silverShown, "chip filter");
    await page.click('#blogCats [data-cat="all"]');
    await page.fill("#blogSearch", "ring");
    const ringShown = await page.$eval('.post-card[href*="ring-size"]', e => !e.hidden);
    assert(ringShown, "search");
  });

  /* ---- 5. admin ---- */
  await step("admin: wrong password is refused", async () => {
    await page.goto(BASE + "/admin.html", { waitUntil: "networkidle" });
    await page.fill("#loginUser", "Olsi"); await page.fill("#loginPass", "definitely-wrong");
    await page.click("#loginBtn");
    await page.waitForFunction(() => document.getElementById("loginMsg").classList.contains("show"), null, { timeout: 15000 });
    assert(await page.$eval("#adminView", e => e.hidden), "admin view shown on a wrong password");
  });
  if (!ADMIN_PW) {
    skp("admin: login, token, add, remove", "SMOKE_ADMIN_PW not set");
  } else {
    const puts = [];
    let currentJson = readFileSync(path.join(ROOT, "data/products.json"), "utf8");
    let sha = 1;
    await page.route("https://api.github.com/**", async r => {
      const req = r.request(); const url = req.url();
      if (req.method() === "GET" && /\/repos\/agency-wo\/dioro999$/.test(url)) {
        return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ permissions: { push: true, pull: true } }) });
      }
      if (req.method() === "GET" && url.indexOf("/contents/data/products.json") > -1) {
        return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ sha: "sha" + sha, content: Buffer.from(currentJson, "utf8").toString("base64") }) });
      }
      if (req.method() === "PUT") {
        const body = JSON.parse(req.postData() || "{}");
        const pathPart = url.split("/contents/")[1];
        puts.push({ path: pathPart, sha: body.sha, content: body.content });
        if (pathPart === "data/products.json") { currentJson = Buffer.from(body.content, "base64").toString("utf8"); sha++; }
        return r.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ content: { sha: "new" + puts.length } }) });
      }
      return r.fulfill({ status: 404, body: "{}" });
    });
    await step("admin: correct login shows the dashboard", async () => {
      await page.fill("#loginUser", "Olsi"); await page.fill("#loginPass", ADMIN_PW);
      await page.click("#loginBtn");
      await page.waitForSelector("#adminView:not([hidden])", { timeout: 20000 });
      await page.waitForSelector("#itemList .admin-item", { timeout: 10000 });
    });
    await step("admin: save key after the GitHub check", async () => {
      await page.fill("#tokenInput", "github_pat_SMOKETEST0123456789abcdefghij");
      await page.click("#saveTokenBtn");
      await page.waitForFunction(() => document.getElementById("tokenMsg").classList.contains("ok"), null, { timeout: 15000 });
      assert((await page.textContent("#tokenState")).indexOf("saved") > -1, "token state");
    });
    await step("admin: add a piece with a photo -> 2 PUTs (photo, then JSON) and 25 products", async () => {
      await page.fill("#addName", "Smoke test ring");
      await page.selectOption("#addCategory", "gold");
      await page.selectOption("#addType", "rings");
      await page.selectOption("#addPurity", "18K");
      await page.fill("#addPrice", "123");
      await page.fill("#addWeight", "3.3");
      const png = await page.evaluate(() => {
        const c = document.createElement("canvas"); c.width = 1600; c.height = 1200;
        const x = c.getContext("2d"); x.fillStyle = "#C9A15A"; x.fillRect(0, 0, 1600, 1200); x.fillStyle = "#0B0B0D"; x.fillRect(200, 200, 1200, 800);
        return c.toDataURL("image/png").split(",")[1];
      });
      await page.setInputFiles("#addPhotos", { name: "smoke.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
      await page.waitForSelector("#photoList li");
      await page.click("#addBtn");
      await page.waitForFunction(() => document.getElementById("addMsg").classList.contains("ok"), null, { timeout: 30000 });
      assert(puts.length === 2, "PUT count " + puts.length);
      assert(puts[0].path.indexOf("assets/img/shop/") === 0 && /\.jpg$/.test(puts[0].path), "first PUT " + puts[0].path);
      assert(puts[1].path === "data/products.json" && puts[1].sha === "sha1", "second PUT " + puts[1].path + " sha " + puts[1].sha);
      const saved = JSON.parse(Buffer.from(puts[1].content, "base64").toString("utf8"));
      assert(saved.products.length === 25, "products " + saved.products.length);
      const added = saved.products.find(p => p.name === "Smoke test ring");
      assert(added && added.images.length === 1 && added.images[0] === puts[0].path, "added record images");
      assert(added.placeholder === false && added.purity === "18K" && added.price === 123, "added record fields");
    });
    await step("admin: remove the test piece -> 24 products", async () => {
      page.once("dialog", d => d.accept());
      const row = await page.$('#itemList .admin-item:has-text("Smoke test ring")');
      assert(row, "row not listed");
      const rm = await row.$('[data-act="remove"]');
      await rm.click();
      await page.waitForFunction(() => document.getElementById("listMsg").classList.contains("ok"), null, { timeout: 30000 });
      assert(puts.length === 3, "PUT count " + puts.length);
      const saved = JSON.parse(Buffer.from(puts[2].content, "base64").toString("utf8"));
      assert(saved.products.length === 24, "products " + saved.products.length);
    });
    await page.unroute("https://api.github.com/**");
  }
  await page.close();
  await ctx.close();
} finally {
  await browser.close();
  if (server) server.kill();
}
console.log(`\n${pass} passed, ${failCount} failed, ${skip} skipped`);
process.exit(failCount ? 1 : 0);
