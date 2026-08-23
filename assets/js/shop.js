/* DiOro999.9 shop controller: filter state and the grid.
   Fetches data/products.json, then owns every piece of filter state (category chip, type or brand chip,
   search term, sort, price window) and repaints #shopGrid on each change. The second chip row is
   DERIVED from the catalogue, seeded from the URL and written back with replaceState, so a filtered
   grid is a link somebody can send. Port of the Iglisi shop mechanics (nearest-handle slider, strict
   AND filter order, relevance sort with a search term, full repaint) with Pointer Events.
   Add-to-cart clicks are handled by cart.js; this file only registers the catalogue. */
(function () {
  "use strict";
  var C = window.DIORO, R = window.DIORO_RENDER, ROOT = window.DIORO_ROOT || "./";
  var grid = document.getElementById("shopGrid");
  if (!grid || !C || !R) return;

  var countEl = document.getElementById("shopCount");
  var catWrap = document.getElementById("catChips");
  var subWrap = document.getElementById("typeChips");
  var searchEl = document.getElementById("shopSearch");
  var sortEl = document.getElementById("shopSort");
  var wrap = document.getElementById("priceSliderWrap");
  var fill = document.getElementById("priceSliderFill");
  var hMin = document.getElementById("handleMin");
  var hMax = document.getElementById("handleMax");
  var disp = document.getElementById("priceRangeDisplay");

  var MIN = C.PRICE_MIN, MAX = C.PRICE_MAX, STEP = C.PRICE_STEP;
  var SORTS = ["featured", "price-asc", "price-desc", "newest", "name"];
  var CATS = C.CATEGORIES.map(function (c) { return c.id; });
  var S = { cat: "all", sub: "all", q: "", sort: "featured", min: MIN, max: MAX };
  var PRODUCTS = [], rafId = 0, countTimer = 0, dragging = null;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function snap(v) { return clamp(Math.round(v / STEP) * STEP, MIN, MAX); }
  function pctOf(v) { return (v - MIN) / (MAX - MIN) * 100; }
  function money(v) { return "$" + R.group(v); }

  /* ---------- URL state ---------- */
  function readUrl() {
    var u;
    try { u = new URLSearchParams(window.location.search); } catch (e) { return; }
    var cat = (u.get("cat") || "").toLowerCase();
    if (CATS.indexOf(cat) > -1) S.cat = cat;
    var sub = u.get("type") || u.get("brand") || "";
    if (sub) S.sub = sub;
    S.q = R.norm((u.get("q") || "").trim());
    var sort = u.get("sort") || "";
    if (SORTS.indexOf(sort) > -1) S.sort = sort;
    var mn = parseInt(u.get("min"), 10), mx = parseInt(u.get("max"), 10);
    if (isFinite(mn)) S.min = snap(mn);
    if (isFinite(mx)) S.max = snap(mx);
    if (S.min > S.max) S.min = S.max;
  }
  function writeUrl() {
    try {
      var u = new URL(window.location.href);
      function setp(k, v, def) { if (v === def || v === "" || v == null) u.searchParams.delete(k); else u.searchParams.set(k, v); }
      setp("cat", S.cat, "all");
      setp("type", S.sub, "all");
      u.searchParams.delete("brand");
      setp("q", S.q, "");
      setp("sort", S.sort, "featured");
      setp("min", S.min === MIN ? "" : String(S.min), "");
      setp("max", S.max === MAX ? "" : String(S.max), "");
      history.replaceState(null, "", u.pathname + (u.search || "") + (u.hash || ""));
    } catch (e) { /* file:// or an old browser */ }
  }

  /* ---------- chips ---------- */
  function pressChip(wrapEl, attr, value) {
    if (!wrapEl) return;
    var chips = wrapEl.querySelectorAll("[" + attr + "]");
    for (var i = 0; i < chips.length; i++) {
      var on = chips[i].getAttribute(attr) === value;
      chips[i].classList.toggle("active", on);
      chips[i].setAttribute("aria-pressed", on ? "true" : "false");
    }
  }
  function catLabelWord(cat, n) {
    if (cat === "watches") return n === 1 ? "watch" : "watches";
    if (cat === "gold" || cat === "silver") return cat + (n === 1 ? " piece" : " pieces");
    return n === 1 ? "piece" : "pieces";
  }
  function buildSubChips() {
    if (!subWrap) return;
    var counts = {}, pool = PRODUCTS.filter(function (p) { return S.cat === "all" || p.category === S.cat; });
    pool.forEach(function (p) { var v = R.subFacet(p); if (v) counts[v] = (counts[v] || 0) + 1; });
    var values = Object.keys(counts).sort(function (a, b) { return (counts[b] - counts[a]) || a.localeCompare(b); });
    if (values.indexOf(S.sub) < 0) S.sub = "all";
    if (!values.length) { subWrap.hidden = true; subWrap.innerHTML = ""; return; }
    subWrap.hidden = false;
    var allLabel = S.cat === "watches" ? "All brands" : "All types";
    var html = ['<button type="button" class="filter-chip' + (S.sub === "all" ? " active" : "") + '" data-sub="all" aria-pressed="' + (S.sub === "all") + '">' + allLabel + "</button>"];
    values.forEach(function (v) {
      var label = C.TYPE_LABELS[v] || v;
      html.push('<button type="button" class="filter-chip' + (S.sub === v ? " active" : "") + '" data-sub="' + R.esc(v) + '" aria-pressed="' + (S.sub === v) + '">' + R.esc(label) + "</button>");
    });
    subWrap.innerHTML = html.join("");
    subWrap.setAttribute("aria-label", S.cat === "watches" ? "Filter by brand" : "Filter by type");
  }

  /* ---------- filter, sort, render ---------- */
  function haystack(p) {
    return R.norm([p.name, p.brand, R.typeLabel(p.type), p.purity, p.description, p.id].join(" "));
  }
  function applyFilters(list) {
    var out = list;
    if (S.cat !== "all") out = out.filter(function (p) { return p.category === S.cat; });
    if (S.sub !== "all") out = out.filter(function (p) { return R.subFacet(p) === S.sub; });
    if (S.q) out = out.filter(function (p) { return haystack(p).indexOf(S.q) > -1; });
    out = out.filter(function (p) { return p.price >= S.min && (S.max >= MAX || p.price <= S.max); });
    return out;
  }
  function score(p) {
    var n = R.norm(p.name), b = R.norm(p.brand), t = R.norm(R.typeLabel(p.type));
    return (n.indexOf(S.q) === 0 ? 2 : 0) + ((b && b.indexOf(S.q) === 0) || (t && t.indexOf(S.q) === 0) ? 1 : 0);
  }
  function sortList(list) {
    var out = list.slice();
    if (S.sort === "price-asc") out.sort(function (a, b) { return a.price - b.price || a.name.localeCompare(b.name); });
    else if (S.sort === "price-desc") out.sort(function (a, b) { return b.price - a.price || a.name.localeCompare(b.name); });
    else if (S.sort === "newest") out.sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)) || String(b.id).localeCompare(String(a.id)); });
    else if (S.sort === "name") out.sort(function (a, b) { return a.name.localeCompare(b.name); });
    else {
      out = R.sortFeatured(out);
      if (S.q) out.sort(function (a, b) { return score(b) - score(a); });
    }
    return out;
  }
  function setCount(list) {
    if (!countEl) return;
    var avail = list.filter(function (p) { return p.inStock; }).length;
    var text = avail + " " + catLabelWord(S.cat, avail) + " available";
    clearTimeout(countTimer);
    countTimer = setTimeout(function () { countEl.textContent = text; }, 120);
  }
  function render() {
    rafId = 0;
    var list = sortList(applyFilters(PRODUCTS));
    setCount(list);
    if (!list.length) {
      grid.innerHTML = '<p class="shop-empty">No pieces match these filters. <button type="button" class="link-btn" id="clearFilters">Clear filters</button></p>';
    } else {
      grid.innerHTML = R.cardsHtml(list, { root: ROOT, heading: "h3" });
    }
    writeUrl();
  }
  function scheduleRender() { if (!rafId) rafId = requestAnimationFrame(render); }
  function clearFilters() {
    S.cat = "all"; S.sub = "all"; S.q = ""; S.sort = "featured"; S.min = MIN; S.max = MAX;
    pressChip(catWrap, "data-filter", "all");
    if (searchEl) searchEl.value = "";
    if (sortEl) sortEl.value = "featured";
    buildSubChips();
    applyPricePos(false);
    render();
  }

  /* ---------- price slider ---------- */
  function applyPricePos(doRender) {
    if (!wrap || !hMin || !hMax || !fill) return;
    hMin.style.left = pctOf(S.min) + "%";
    hMax.style.left = pctOf(S.max) + "%";
    fill.style.left = pctOf(S.min) + "%";
    fill.style.width = (pctOf(S.max) - pctOf(S.min)) + "%";
    hMin.setAttribute("aria-valuenow", S.min);
    hMax.setAttribute("aria-valuenow", S.max);
    hMin.setAttribute("aria-valuetext", money(S.min));
    hMax.setAttribute("aria-valuetext", S.max >= MAX ? money(MAX) + " or more" : money(S.max));
    if (disp) disp.textContent = R.fmtRange(S.min, S.max);
    if (doRender !== false) scheduleRender();
  }
  function valueAt(clientX) {
    var rect = wrap.getBoundingClientRect();
    var frac = clamp((clientX - rect.left) / rect.width, 0, 1);
    return snap(MIN + frac * (MAX - MIN));
  }
  function setHandle(which, v) {
    if (which === "min") S.min = Math.min(v, S.max);
    else S.max = Math.max(v, S.min);
    applyPricePos();
  }
  function initSlider() {
    if (!wrap || !hMin || !hMax) return;
    wrap.addEventListener("pointerdown", function (e) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      var v = valueAt(e.clientX);
      var which = e.target === hMax ? "max" : e.target === hMin ? "min" : (Math.abs(v - S.min) <= Math.abs(v - S.max) ? "min" : "max");
      dragging = which;
      wrap.classList.add("is-dragging");
      try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* capture unsupported */ }
      setHandle(which, v);
      (which === "min" ? hMin : hMax).focus({ preventScroll: true });
    });
    wrap.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      e.preventDefault();
      setHandle(dragging, valueAt(e.clientX));
    });
    function end(e) {
      if (!dragging) return;
      dragging = null;
      wrap.classList.remove("is-dragging");
      try { wrap.releasePointerCapture(e.pointerId); } catch (err) { /* already released */ }
    }
    wrap.addEventListener("pointerup", end);
    wrap.addEventListener("pointercancel", end);
    function keys(which) {
      return function (e) {
        var cur = which === "min" ? S.min : S.max, v = cur;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") v = cur - STEP;
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") v = cur + STEP;
        else if (e.key === "PageDown") v = cur - STEP * 10;
        else if (e.key === "PageUp") v = cur + STEP * 10;
        else if (e.key === "Home") v = MIN;
        else if (e.key === "End") v = MAX;
        else return;
        e.preventDefault();
        setHandle(which, snap(v));
      };
    }
    hMin.addEventListener("keydown", keys("min"));
    hMax.addEventListener("keydown", keys("max"));
    applyPricePos(false);
  }

  /* ---------- wiring ---------- */
  if (catWrap) {
    catWrap.addEventListener("click", function (e) {
      var chip = e.target.closest ? e.target.closest("[data-filter]") : null;
      if (!chip) return;
      S.cat = chip.getAttribute("data-filter");
      S.sub = "all";
      pressChip(catWrap, "data-filter", S.cat);
      buildSubChips();
      render();
    });
  }
  if (subWrap) {
    subWrap.addEventListener("click", function (e) {
      var chip = e.target.closest ? e.target.closest("[data-sub]") : null;
      if (!chip) return;
      S.sub = chip.getAttribute("data-sub");
      pressChip(subWrap, "data-sub", S.sub);
      render();
    });
  }
  if (searchEl) {
    var onSearch = function () { S.q = R.norm(searchEl.value.trim()); render(); };
    searchEl.addEventListener("input", onSearch);
    searchEl.addEventListener("search", onSearch);
  }
  if (sortEl) sortEl.addEventListener("change", function () { S.sort = SORTS.indexOf(sortEl.value) > -1 ? sortEl.value : "featured"; render(); });
  grid.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("#clearFilters") : null;
    if (btn) { e.preventDefault(); clearFilters(); }
  });

  readUrl();
  pressChip(catWrap, "data-filter", S.cat);
  if (searchEl && S.q) searchEl.value = S.q;
  if (sortEl) sortEl.value = S.sort;
  initSlider();

  R.loadProducts(ROOT).then(function (list) {
    PRODUCTS = list;
    if (window.DIORO_CART) window.DIORO_CART.setProducts(PRODUCTS);
    buildSubChips();
    render();
  }).catch(function () {
    /* keep the pre-rendered grid; the static count line stands */
    if (countEl && !grid.querySelector(".product-card")) countEl.textContent = "Could not load the list. Please refresh.";
    else if (countEl) countEl.textContent = "Showing the last saved list";
  });
})();
