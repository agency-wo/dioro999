/* DiOro999.9 product page: renders one piece from data/products.json by ?id=<slug> (or ?slug=, or an id).
   Sets the title, description, canonical and a Product + BreadcrumbList JSON-LD at runtime.
   Phase 2 pre-renders /shop/<slug>/ pages; until then this page is noindex. */
(function () {
  "use strict";
  var C = window.DIORO, R = window.DIORO_RENDER, ROOT = window.DIORO_ROOT || "./";
  var pdp = document.getElementById("pdp");
  if (!pdp || !C || !R) return;
  var SITE = C.SITE_URL;
  var $ = function (id) { return document.getElementById(id); };
  var loading = $("pdpLoading"), notFound = $("pdpNotFound"), nfTitle = $("pdpNotFoundTitle"), nfText = $("pdpNotFoundText");
  var crumbCat = $("pdpCrumbCat"), crumbCatLink = $("pdpCrumbCatLink"), crumbName = $("pdpCrumbName");
  var img = $("pdpImage"), badge = $("pdpBadge"), thumbs = $("pdpThumbs"), kicker = $("pdpKicker"), title = $("pdpTitle"), chips = $("pdpChips");
  var priceEl = $("pdpPrice"), wasEl = $("pdpWas"), availEl = $("pdpAvail"), qtyWrap = $("pdpQtyWrap"), qty = $("pdpQty"), dec = $("pdpQtyDec"), inc = $("pdpQtyInc"), addBtn = $("pdpAdd"), waBtn = $("pdpWa"), desc = $("pdpDesc"), specs = $("pdpSpecs"), relSec = $("pdpRelatedSec"), rel = $("pdpRelated");
  var illus = $("pdpIllus"), illusWa = $("pdpIllusWa");
  var MAXQ = C.CART_MAX_QTY || 10;
  var product = null, gallery = [], current = 0;

  function key() {
    try { var u = new URLSearchParams(window.location.search); return (u.get("id") || u.get("slug") || "").trim(); } catch (e) { return ""; }
  }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function setMeta(name, content) {
    var m = document.querySelector('meta[name="' + name + '"]');
    if (!m) { m = document.createElement("meta"); m.setAttribute("name", name); document.head.appendChild(m); }
    m.setAttribute("content", content);
  }
  function setProp(prop, content) {
    var m = document.querySelector('meta[property="' + prop + '"]');
    if (m) m.setAttribute("content", content);
  }
  function clampQty(v) { v = Math.floor(Number(v)); if (!isFinite(v) || v < 1) v = 1; return Math.min(MAXQ, v); }
  function showImage(i) {
    current = i;
    img.src = R.imgPath(gallery[i], ROOT);
    var buttons = thumbs.querySelectorAll(".pdp-thumb");
    for (var k = 0; k < buttons.length; k++) buttons[k].setAttribute("aria-pressed", k === i ? "true" : "false");
  }
  function fail(titleText, text) {
    loading.hidden = true;
    pdp.hidden = true;
    notFound.hidden = false;
    nfTitle.textContent = titleText;
    nfText.textContent = text;
    document.title = "Item not found | DiOro999.9";
    setMeta("robots", "noindex");
  }

  function render(p, all) {
    product = p;
    var url = SITE.replace(/\/+$/, "") + "/product/?id=" + encodeURIComponent(p.slug);
    document.title = p.name + " | DiOro999.9";
    var d = (p.description || (R.kicker(p) + ", " + R.fmtPrice(p.price) + " at DiOro999.9.")).slice(0, 155);
    setMeta("description", d);
    var canon = document.querySelector('link[rel="canonical"]');
    if (canon) canon.setAttribute("href", url);
    setProp("og:title", p.name + " | DiOro999.9");
    setProp("og:description", d);
    setProp("og:url", url);
    setProp("og:image", R.absUrl(SITE, R.images(p)[0]));

    /* breadcrumb */
    crumbCat.hidden = false;
    crumbCatLink.textContent = R.catLabel(p.category);
    crumbCatLink.href = ROOT + "shop/?cat=" + encodeURIComponent(p.category);
    crumbName.textContent = p.name;

    /* gallery */
    gallery = R.images(p);
    img.alt = R.altText(p);
    while (thumbs.firstChild) thumbs.removeChild(thumbs.firstChild);
    if (gallery.length > 1) {
      thumbs.hidden = false;
      gallery.forEach(function (src, i) {
        var li = document.createElement("li");
        var b = el("button", "pdp-thumb");
        b.type = "button";
        b.setAttribute("aria-label", "Photo " + (i + 1) + " of " + gallery.length);
        b.setAttribute("aria-pressed", i === 0 ? "true" : "false");
        b.setAttribute("data-i", String(i));
        var t = document.createElement("img");
        t.src = R.imgPath(src, ROOT); t.alt = ""; t.width = 72; t.height = 72; t.loading = "lazy";
        b.appendChild(t); li.appendChild(b); thumbs.appendChild(li);
      });
    } else {
      thumbs.hidden = true;
    }
    showImage(0);
    var bd = R.badgeFor(p);
    if (bd) { badge.hidden = false; badge.className = "badge " + bd.cls; badge.textContent = bd.text; } else { badge.hidden = true; }

    /* copy */
    kicker.textContent = R.kicker(p);
    title.textContent = p.name;
    while (chips.firstChild) chips.removeChild(chips.firstChild);
    R.metaParts(p).forEach(function (part) { var li = el("li", "chip", part); chips.appendChild(li); });
    chips.hidden = !chips.firstChild;
    priceEl.textContent = R.fmtPrice(p.price);
    if (R.isSale(p)) { wasEl.hidden = false; wasEl.textContent = "Was " + R.fmtPrice(p.originalPrice); } else { wasEl.hidden = true; }
    availEl.textContent = p.inStock ? "In stock" : "Sold out";
    availEl.classList.toggle("is-out", !p.inStock);
    if (!p.inStock) {
      addBtn.disabled = true; addBtn.textContent = "Sold out";
      qtyWrap.hidden = true;
      waBtn.textContent = "";
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("aria-hidden", "true");
      var use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", "#i-wa"); svg.appendChild(use);
      waBtn.appendChild(svg); waBtn.appendChild(document.createTextNode("Ask when it is back"));
    }
    var waText = "Hi, I am interested in " + p.name + " (" + R.fmtPrice(p.price) + "). " + url;
    waBtn.href = "https://wa.me/" + C.WHATSAPP + "?text=" + encodeURIComponent(waText);

    /* The picture on a placeholder item is a drawing, not the piece. Saying so is the honest
       thing, and on a 1450 EUR ring it is also the moment a buyer most wants a real photo, so
       the admission carries the ask rather than sitting there as a disclaimer. */
    if (illus && illusWa) {
      illus.hidden = !p.placeholder;
      illusWa.href = "https://wa.me/" + C.WHATSAPP + "?text=" + encodeURIComponent(
        "Hi, could you send photos of " + p.name + "? " + url);
    }
    desc.textContent = p.description || "";
    desc.hidden = !p.description;

    /* specs */
    while (specs.firstChild) specs.removeChild(specs.firstChild);
    function row(k, v) { if (!v) return; specs.appendChild(el("dt", null, k)); specs.appendChild(el("dd", null, v)); }
    row("Category", R.catLabel(p.category));
    row(p.category === "watches" ? "Brand" : "Type", p.category === "watches" ? p.brand : R.typeLabel(p.type));
    row("Purity", p.purity);
    row("Weight", p.weight_g ? p.weight_g + " g" : "");
    row("Size", R.sizeText(p));
    row("Availability", p.inStock ? "In stock" : "Sold out");
    row("Item no.", p.id);
    if (p.type === "bars-coins") row("Price note", "Bars and coins follow the daily metal price; the price is confirmed when you order.");

    /* related: same category, not self, in stock first, max 4 */
    var related = all.filter(function (x) { return x.id !== p.id && x.category === p.category; });
    related.sort(function (a, b) { return (b.inStock === true) - (a.inStock === true) || (R.subFacet(b) === R.subFacet(p)) - (R.subFacet(a) === R.subFacet(p)); });
    related = related.slice(0, 4);
    if (related.length) { relSec.hidden = false; rel.innerHTML = R.cardsHtml(related, { root: ROOT, heading: "h3" }); } else { relSec.hidden = true; }

    /* structured data */
    var old = document.getElementById("ld-product"); if (old) old.parentNode.removeChild(old);
    var ld = document.createElement("script");
    ld.type = "application/ld+json"; ld.id = "ld-product";
    var graph = [R.productLd(p, SITE), {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/" },
        { "@type": "ListItem", "position": 2, "name": "Shop", "item": SITE + "/shop/" },
        { "@type": "ListItem", "position": 3, "name": R.catLabel(p.category), "item": SITE + "/shop/?cat=" + p.category },
        { "@type": "ListItem", "position": 4, "name": p.name, "item": url }
      ]
    }];
    ld.textContent = JSON.stringify(graph);
    document.head.appendChild(ld);

    loading.hidden = true;
    notFound.hidden = true;
    pdp.hidden = false;
  }

  /* interactions */
  thumbs.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".pdp-thumb") : null;
    if (b) showImage(parseInt(b.getAttribute("data-i"), 10) || 0);
  });
  thumbs.addEventListener("keydown", function (e) {
    if (gallery.length < 2) return;
    if (e.key === "ArrowRight") { e.preventDefault(); showImage((current + 1) % gallery.length); thumbs.querySelectorAll(".pdp-thumb")[current].focus(); }
    if (e.key === "ArrowLeft") { e.preventDefault(); showImage((current - 1 + gallery.length) % gallery.length); thumbs.querySelectorAll(".pdp-thumb")[current].focus(); }
  });
  dec.addEventListener("click", function () { qty.value = String(clampQty(Number(qty.value) - 1)); });
  inc.addEventListener("click", function () { qty.value = String(clampQty(Number(qty.value) + 1)); });
  qty.addEventListener("change", function () { qty.value = String(clampQty(qty.value)); });
  addBtn.addEventListener("click", function () {
    if (!product || !window.DIORO_CART) return;
    var res = window.DIORO_CART.add(product.id, clampQty(qty.value), product);
    if (window.DIORO_SITE && window.DIORO_SITE.toast) window.DIORO_SITE.toast(res.ok ? "Added to cart." : res.reason, res.ok ? ROOT + "cart/" : null, "View cart", !res.ok);
  });

  var k = key();
  if (!k) { fail("We could not find that piece", "The link is incomplete. Browse the shop to find it."); return; }
  R.loadProducts(ROOT).then(function (all) {
    if (window.DIORO_CART) window.DIORO_CART.setProducts(all);
    var p = all.filter(function (x) { return x.slug === k; })[0] || all.filter(function (x) { return x.id === k; })[0];
    if (!p) { fail("We could not find that piece", "It may have been removed from the shop, or the link is incomplete."); return; }
    render(p, all);
  }).catch(function () {
    fail("Could not load this item", "Please check the connection and try again.");
  });
})();
