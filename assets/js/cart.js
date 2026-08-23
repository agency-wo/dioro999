/* DiOro999.9 cart.
   Part 1: the shared cart store, window.DIORO_CART. Loaded by the chrome on EVERY page, so it never
   assumes a page element exists. Only ids and quantities are stored; prices always come from the
   live catalogue (data/products.json) at render time.
   Storage: localStorage[C.CART_KEY] = {"v":1,"items":[{"id":"p-...","qty":2}],"updatedAt":<ms>}.
   Every change dispatches window "dioro:cart" with {detail:{count}} (site.js updates the badge).
   One delegated click handler serves every ".js-add[data-id]" button (shop, home, PDP related, blog),
   so pages only have to call DIORO_CART.setProducts(list) after loading the catalogue.
   Part 2: the cart page (only when #cartLines exists).
   Needs config.js (window.DIORO) and render.js (window.DIORO_RENDER). site.js is optional (toast). */
(function () {
  "use strict";
  var C = window.DIORO, R = window.DIORO_RENDER, ROOT = window.DIORO_ROOT || "./";
  if (!C) return;
  var KEY = C.CART_KEY || "dioro_cart_v1";
  var MAX_QTY = C.CART_MAX_QTY || 10;
  var MAX_LINES = C.CART_MAX_LINES || 20;
  var REASON_SOLD = "This piece is sold out.";
  var REASON_FULL = "The cart is full.";

  var catalogue = [], byId = {};

  /* ---------- store ---------- */
  function clampQty(q) {
    q = Math.floor(Number(q));
    if (!isFinite(q)) return 1;
    return Math.max(1, Math.min(MAX_QTY, q));
  }
  function empty() { return { v: 1, items: [], updatedAt: Date.now() }; }
  function sanitize(data) {
    var cart = empty();
    if (!data || typeof data !== "object" || data.v !== 1 || !Array.isArray(data.items)) return cart;
    var seen = {};
    for (var i = 0; i < data.items.length && cart.items.length < MAX_LINES; i++) {
      var it = data.items[i];
      if (!it || typeof it.id !== "string" || !it.id) continue;
      var q = Math.floor(Number(it.qty));
      if (!isFinite(q) || q < 1) continue;
      if (seen[it.id] != null) { cart.items[seen[it.id]].qty = Math.min(MAX_QTY, cart.items[seen[it.id]].qty + q); continue; }
      seen[it.id] = cart.items.length;
      cart.items.push({ id: it.id, qty: Math.min(MAX_QTY, q) });
    }
    cart.updatedAt = Number(data.updatedAt) || Date.now();
    return cart;
  }
  function read() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = null; }
    if (!raw) return empty();
    try { return sanitize(JSON.parse(raw)); } catch (e) { return empty(); }
  }
  function countOf(cart) {
    var n = 0;
    for (var i = 0; i < cart.items.length; i++) n += cart.items[i].qty;
    return n;
  }
  function set(cart) {
    cart = sanitize(cart);
    cart.updatedAt = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch (e) { /* private mode or quota: the page still works for this view */ }
    var n = countOf(cart);
    try { window.dispatchEvent(new CustomEvent("dioro:cart", { detail: { count: n } })); } catch (e) { /* very old browsers */ }
    return cart;
  }
  function get() { return read(); }
  function count() { return countOf(read()); }
  function findLine(cart, id) {
    for (var i = 0; i < cart.items.length; i++) if (cart.items[i].id === id) return cart.items[i];
    return null;
  }
  function add(id, qty, product) {
    id = String(id == null ? "" : id);
    var cart = read();
    if (!id) return { ok: false, reason: "Unknown piece.", count: countOf(cart) };
    var p = product || byId[id] || null;
    if (p && p.inStock === false) return { ok: false, reason: REASON_SOLD, count: countOf(cart) };
    var q = clampQty(qty == null ? 1 : qty);
    var line = findLine(cart, id);
    if (line) {
      line.qty = Math.min(MAX_QTY, line.qty + q);
    } else {
      if (cart.items.length >= MAX_LINES) return { ok: false, reason: REASON_FULL, count: countOf(cart) };
      cart.items.push({ id: id, qty: q });
    }
    cart = set(cart);
    return { ok: true, reason: "", count: countOf(cart) };
  }
  function setQty(id, qty) {
    var cart = read(), q = Math.floor(Number(qty));
    if (!isFinite(q) || q < 1) return remove(id);
    var line = findLine(cart, id);
    if (!line) return cart;
    line.qty = Math.min(MAX_QTY, q);
    return set(cart);
  }
  function remove(id) {
    var cart = read();
    cart.items = cart.items.filter(function (it) { return it.id !== id; });
    return set(cart);
  }
  function clear() { return set(empty()); }
  function setProducts(list) {
    catalogue = Array.isArray(list) ? list : [];
    byId = {};
    for (var i = 0; i < catalogue.length; i++) if (catalogue[i] && catalogue[i].id) byId[catalogue[i].id] = catalogue[i];
  }
  function hydrate(products) {
    var map = byId;
    if (Array.isArray(products)) {
      map = {};
      for (var i = 0; i < products.length; i++) if (products[i] && products[i].id) map[products[i].id] = products[i];
    }
    var cart = read(), lines = [];
    for (var j = 0; j < cart.items.length; j++) {
      var it = cart.items[j], p = map[it.id] || null;
      var available = !!(p && p.inStock && Number(p.price) > 0);
      lines.push({ id: it.id, qty: it.qty, product: p, available: available, lineTotal: available ? it.qty * Number(p.price) : 0 });
    }
    return lines;
  }
  function subtotal(lines) {
    var n = 0;
    for (var i = 0; i < lines.length; i++) if (lines[i].available) n += lines[i].lineTotal;
    return Math.round(n * 100) / 100;
  }
  function fmt(n) { return R ? R.fmtPrice(n) : "$" + n; }
  function summaryText(lines) {
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (!l.available) continue;
      out.push(l.qty + " x " + l.product.name + " (" + l.id + ") @ " + fmt(l.product.price) + " = " + fmt(l.lineTotal));
    }
    return out.join("\n");
  }

  window.DIORO_CART = {
    get: get, set: set, add: add, setQty: setQty, remove: remove, clear: clear, count: count,
    setProducts: setProducts, hydrate: hydrate, subtotal: subtotal, summaryText: summaryText
  };

  /* ---------- the one delegated "Add to cart" handler ---------- */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (!t || !t.closest) return;
    var btn = t.closest(".js-add[data-id]");
    if (!btn || btn.disabled) return;
    e.preventDefault();
    var id = btn.getAttribute("data-id");
    var res = add(id, 1, byId[id] || null);
    if (window.DIORO_SITE && window.DIORO_SITE.toast) {
      window.DIORO_SITE.toast(res.ok ? "Added to cart." : res.reason, res.ok ? ROOT + "cart/" : null, "View cart", !res.ok);
    }
  });

  /* ============================================================
     Part 2: the cart page
     ============================================================ */
  var linesEl = document.getElementById("cartLines");
  if (!linesEl || !R) return;

  var emptyEl = document.getElementById("cartEmpty");
  var layoutEl = document.querySelector(".cart-layout");
  var subtotalEl = document.getElementById("cartSubtotal");
  var checkoutEl = document.getElementById("toCheckout");
  var liveEl = document.getElementById("cart-live");
  var loaded = false, loadFailed = false;

  function announce(text) { if (liveEl) liveEl.textContent = text; }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function icon(id) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "#" + id);
    svg.appendChild(use);
    return svg;
  }
  function qtyButton(action, id, label, iconId) {
    var b = el("button", "qty__btn");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.setAttribute("data-action", action);
    b.setAttribute("data-id", id);
    b.appendChild(icon(iconId));
    return b;
  }
  function lineName(l) { return l.product ? l.product.name : "Item " + l.id; }

  function buildLine(l) {
    var li = el("li", "cart-line" + (l.available ? "" : " is-unavailable"));
    li.setAttribute("data-id", l.id);
    var p = l.product;

    var img = el("img", "cart-line__img");
    img.width = 88; img.height = 88; img.loading = "lazy"; img.decoding = "async";
    if (p) { img.src = R.coverImage(p, ROOT); img.alt = R.altText(p); }
    else { img.src = R.imgPath(C.PLACEHOLDER_IMG, ROOT); img.alt = ""; }
    li.appendChild(img);

    var info = el("div", "cart-line__info");
    if (p) {
      var a = el("a", "cart-line__name", p.name);
      a.href = R.productUrl(p, ROOT);
      info.appendChild(a);
      var meta = R.metaLine(p);
      if (meta) info.appendChild(el("p", "cart-line__meta", meta));
    } else {
      info.appendChild(el("p", "cart-line__name", lineName(l)));
    }
    if (l.available) info.appendChild(el("p", "cart-line__unit", R.fmtPrice(p.price) + " each"));
    else info.appendChild(el("p", "cart-line__unavail", "No longer available"));
    li.appendChild(info);

    if (l.available) {
      var qty = el("div", "qty");
      qty.appendChild(qtyButton("dec", l.id, "Decrease quantity", "i-minus"));
      var input = el("input", "qty__input");
      input.type = "number"; input.min = "1"; input.max = String(MAX_QTY); input.step = "1";
      input.value = String(l.qty); input.inputMode = "numeric";
      input.setAttribute("aria-label", "Quantity");
      input.setAttribute("data-id", l.id);
      input.setAttribute("data-action", "qty");
      qty.appendChild(input);
      qty.appendChild(qtyButton("inc", l.id, "Increase quantity", "i-plus"));
      li.appendChild(qty);
      li.appendChild(el("p", "price cart-line__total", R.fmtPrice(l.lineTotal)));
    } else {
      li.appendChild(el("span", "cart-line__spacer"));
      li.appendChild(el("p", "price cart-line__total cart-line__total--na", "-"));
    }

    var rm = el("button", "cart-remove", "Remove");
    rm.type = "button";
    rm.setAttribute("aria-label", "Remove " + lineName(l));
    rm.setAttribute("data-action", "remove");
    rm.setAttribute("data-id", l.id);
    li.appendChild(rm);
    return li;
  }

  function focusKey() {
    var a = document.activeElement;
    if (!a || !a.getAttribute || !linesEl.contains(a)) return null;
    return { action: a.getAttribute("data-action"), id: a.getAttribute("data-id") };
  }
  function restoreFocus(key) {
    if (!key || !key.action) return;
    var sel = '[data-action="' + key.action + '"][data-id="' + key.id.replace(/"/g, '\\"') + '"]';
    var n = linesEl.querySelector(sel);
    if (n) { n.focus({ preventScroll: true }); return; }
    /* the line went away: move focus to the next sensible control */
    var next = linesEl.querySelector(".cart-remove") || checkoutEl;
    if (next) next.focus({ preventScroll: true });
  }

  function render() {
    var lines = hydrate(), key = focusKey();
    while (linesEl.firstChild) linesEl.removeChild(linesEl.firstChild);
    var anyAvailable = false;
    for (var i = 0; i < lines.length; i++) {
      linesEl.appendChild(buildLine(lines[i]));
      if (lines[i].available) anyAvailable = true;
    }
    var isEmpty = lines.length === 0;
    if (emptyEl) emptyEl.hidden = !isEmpty;
    if (layoutEl) layoutEl.hidden = isEmpty;
    var sub = subtotal(lines);
    if (subtotalEl) subtotalEl.textContent = sub > 0 ? R.fmtPrice(sub) : "$0";
    if (checkoutEl) {
      if (anyAvailable) checkoutEl.removeAttribute("aria-disabled");
      else checkoutEl.setAttribute("aria-disabled", "true");
    }
    restoreFocus(key);
  }

  function showLoadError() {
    loadFailed = true;
    while (linesEl.firstChild) linesEl.removeChild(linesEl.firstChild);
    var li = el("li", "cart-err", "Could not load the catalogue. Please reload the page.");
    linesEl.appendChild(li);
    if (checkoutEl) checkoutEl.setAttribute("aria-disabled", "true");
    announce("Could not load the catalogue. Please reload the page.");
  }

  function nameOf(id) { return byId[id] ? byId[id].name : "Item"; }

  linesEl.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-action]") : null;
    if (!btn || btn.tagName !== "BUTTON") return;
    var id = btn.getAttribute("data-id"), action = btn.getAttribute("data-action");
    var cart = read(), line = findLine(cart, id);
    if (action === "remove") {
      remove(id);
      announce(nameOf(id) + " removed from the cart.");
    } else if (line) {
      var q = action === "inc" ? line.qty + 1 : line.qty - 1;
      if (q < 1) { remove(id); announce(nameOf(id) + " removed from the cart."); return; }
      q = Math.min(MAX_QTY, q);
      setQty(id, q);
      announce("Quantity of " + nameOf(id) + " set to " + q + ". Subtotal " + R.fmtPrice(subtotal(hydrate())) + ".");
    }
  });
  linesEl.addEventListener("change", function (e) {
    var input = e.target;
    if (!input || input.getAttribute("data-action") !== "qty") return;
    var id = input.getAttribute("data-id"), q = Math.floor(Number(input.value));
    if (!isFinite(q) || q < 1) { remove(id); announce(nameOf(id) + " removed from the cart."); return; }
    q = Math.min(MAX_QTY, q);
    setQty(id, q);
    announce("Quantity of " + nameOf(id) + " set to " + q + ". Subtotal " + R.fmtPrice(subtotal(hydrate())) + ".");
  });
  if (checkoutEl) {
    checkoutEl.addEventListener("click", function (e) {
      if (checkoutEl.getAttribute("aria-disabled") === "true") e.preventDefault();
    });
  }

  function rerender() { if (loaded && !loadFailed) render(); }
  window.addEventListener("dioro:cart", rerender);
  window.addEventListener("storage", function (e) { if (!e.key || e.key === KEY) rerender(); });

  R.loadProducts(ROOT).then(function (list) {
    setProducts(list);
    loaded = true;
    render();
  }).catch(showLoadError);
})();
