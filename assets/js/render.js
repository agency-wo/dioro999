/* DiOro999.9 shared renderer.
   ONE place for product normalisation, validation, money formatting, image paths and the product card.
   Used by shop.js, product.js, cart.js, checkout.js, admin.js in the browser (window.DIORO_RENDER)
   and by _tools/prerender.mjs in node (module.exports), so the pre-rendered grid and the live grid
   can never drift apart.
   Every string that reaches innerHTML goes through esc(). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./config.js"));
  else root.DIORO_RENDER = factory(root.DIORO);
})(typeof window !== "undefined" ? window : this, function (C) {
  "use strict";

  var BADGES = ["", "New", "Sale"];
  var SINGULAR = {
    rings: "ring", necklaces: "necklace", chains: "chain", bracelets: "bracelet",
    earrings: "earring", pendants: "pendant", "bars-coins": "bar"
  };

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  /* accent-insensitive lowercase, for search */
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  /* typographic dashes and quotes typed by the owner become plain ASCII (house rule: no em or en dashes anywhere) */
  function textClean(s) {
    return String(s == null ? "" : s)
      .replace(/[\u2013\u2014\u2212]/g, "-").replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"')
      .replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
  }
  /* thousands grouping by hand: toLocaleString asks the browser for the separator and a phone can reflow the grid */
  function group(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function fmtPrice(n) {
    n = Number(n);
    if (!isFinite(n) || n <= 0) return "Price on request";
    var whole = Math.floor(n), cents = Math.round((n - whole) * 100);
    if (cents === 100) { whole += 1; cents = 0; }
    return "$" + group(whole) + (cents ? "." + (cents < 10 ? "0" : "") + cents : "");
  }
  function fmtRange(min, max) {
    return "$" + group(min) + " - $" + group(max) + (max >= C.PRICE_MAX ? "+" : "");
  }
  function slugify(s) {
    return norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  }

  function catLabel(id) {
    for (var i = 0; i < C.CATEGORIES.length; i++) if (C.CATEGORIES[i].id === id) return C.CATEGORIES[i].label;
    return id || "";
  }
  function typeLabel(t) { return C.TYPE_LABELS[t] || t || ""; }
  /* the secondary facet: type for jewellery, brand for watches */
  function subFacet(p) { return p.category === "watches" ? (p.brand || "") : (p.type || ""); }
  function subLabel(p) { return p.category === "watches" ? (p.brand || "") : typeLabel(p.type); }
  function kicker(p) { var s = subLabel(p); return catLabel(p.category) + (s ? " · " + s : ""); }
  function sizeText(p) { return p.size ? (p.type === "rings" ? "Size " + p.size : p.size) : ""; }
  function metaParts(p) {
    var parts = [];
    if (p.purity) parts.push(p.purity);
    if (p.weight_g) parts.push(p.weight_g + " g");
    if (p.size) parts.push(sizeText(p));
    return parts;
  }
  function metaLine(p) { return metaParts(p).join(" · "); }
  function altText(p) {
    var metal = p.category === "gold" ? " gold" : p.category === "silver" ? " silver" : "";
    return p.name + (p.purity ? ", " + p.purity + metal : "");
  }

  /* A shape the category alone cannot tell apart. Checked in order against the name and the
     description, before the category fallback below, so a new item that is obviously a rope chain
     or a moon phase does not land on the generic drawing for its category. Each entry names a file
     that exists in assets/img/shop/; there is no gold/silver substitution here, because the
     refinements are not drawn for both metals.

     WATCH TERMS ARE GENERIC ON PURPOSE. They match what a watch IS - digital, chronograph, field,
     moon phase - and never a manufacturer's model name. The drawings are generic types too, so
     matching "Bambino" or "PRX" would promise a specific maker's design that the illustration
     deliberately does not show. */
  var REFINE = [
    [/\brope\b/, "gold", "placeholder-chain-rope-gold"],
    [/\bsolitaire\b|\bdiamond\b|\bct\b/, "gold", "placeholder-ring-solitaire-gold"],
    [/\bcoin\b|\bsovereign\b|\bducat\b/, "gold", "placeholder-coin-gold"],
    [/\bsignet\b/, "silver", "placeholder-ring-signet-silver"],
    [/\bmoon\s*phase\b/, "watches", "placeholder-watch-moonphase"],
    [/\bchrono/, "watches", "placeholder-watch-chrono"],
    [/\bdigital\b|\blcd\b/, "watches", "placeholder-watch-digital"],
    [/\bfield\b/, "watches", "placeholder-watch-field"],
    [/\bintegrated\b/, "watches", "placeholder-watch-integrated"],
    [/\bdiver?\b|\bdiving\b|\bsports?\b/, "watches", "placeholder-watch-sport"],
    [/\bdress\b/, "watches", "placeholder-watch-dress"]
  ];
  function placeholderFor(p) {
    var hay = norm([p.name, p.description].join(" "));
    for (var i = 0; i < REFINE.length; i++) {
      if (REFINE[i][1] === p.category && REFINE[i][0].test(hay)) {
        return "assets/img/shop/" + REFINE[i][2] + ".svg";
      }
    }
    if (p.category === "watches") return "assets/img/shop/placeholder-watch.svg";
    var single = SINGULAR[p.type];
    if (single && (p.category === "gold" || p.category === "silver")) {
      return "assets/img/shop/placeholder-" + single + "-" + p.category + ".svg";
    }
    return C.PLACEHOLDER_IMG;
  }
  function imgPath(path, rootPrefix) {
    path = String(path || "");
    if (/^(https?:)?\/\//i.test(path) || /^(data|blob):/i.test(path)) return path;
    return (rootPrefix || "./") + path.replace(/^\/+/, "");
  }
  function images(p) {
    var list = (p.images || []).filter(Boolean);
    return list.length ? list : [placeholderFor(p)];
  }
  function coverImage(p, rootPrefix) { return imgPath(images(p)[0], rootPrefix); }
  function productUrl(p, rootPrefix) {
    rootPrefix = rootPrefix || "./";
    return C.PRETTY_PRODUCT_URLS
      ? rootPrefix + "shop/" + encodeURIComponent(p.slug) + "/"
      : rootPrefix + "product/?id=" + encodeURIComponent(p.slug);
  }
  function isSale(p) { return !!(p.originalPrice && p.originalPrice > p.price); }
  function badgeFor(p) {
    if (!p.inStock) return { cls: "badge--sold", text: "Sold out" };
    if (p.badge === "New") return { cls: "badge--new", text: "New" };
    if (p.badge === "Sale" || isSale(p)) return { cls: "badge--sale", text: "Sale" };
    return null;
  }

  /* Featured order: featured first, then newest, then name. The static grid and the live grid both use it. */
  function sortFeatured(list) {
    return list.slice().sort(function (a, b) {
      return (b.featured === true) - (a.featured === true)
        || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
        || String(a.name).localeCompare(String(b.name));
    });
  }

  /* The product card. opts.heading defaults to "h3". opts.root is the page depth prefix. */
  function productCard(p, opts) {
    opts = opts || {};
    var rootPrefix = opts.root || "./", h = opts.heading || "h3";
    var url = productUrl(p, rootPrefix), badge = badgeFor(p), meta = metaLine(p);
    var html = '<article class="product-card' + (p.inStock ? "" : " is-sold") + '" data-id="' + esc(p.id) + '">';
    html += '<a class="product-card__media" href="' + esc(url) + '" aria-label="' + esc(p.name) + '">'
      + '<img src="' + esc(coverImage(p, rootPrefix)) + '" alt="' + esc(altText(p)) + '" width="1200" height="1200" loading="lazy" decoding="async">'
      + (badge ? '<span class="badge ' + badge.cls + '">' + badge.text + "</span>" : "")
      + (p.inStock ? "" : '<span class="product-card__soldover" aria-hidden="true">Sold out</span>')
      /* The grid gets the one-word admission; the full sentence and the ask for real photos live
         on the product page, where the buyer is actually deciding. Twenty-four sentences down a
         grid would read as an apology for the shop rather than a note about one picture. */
      + (p.placeholder ? '<span class="product-card__illus">Illustration</span>' : "")
      + "</a>";
    html += '<div class="product-card__body">'
      + '<p class="product-card__kicker">' + esc(kicker(p)) + "</p>"
      + "<" + h + ' class="product-card__name"><a href="' + esc(url) + '">' + esc(p.name) + "</a></" + h + ">"
      + (meta ? '<p class="product-card__meta">' + esc(meta) + "</p>" : "")
      + (p.description ? '<p class="product-card__desc">' + esc(p.description) + "</p>" : "")
      + '<div class="product-card__foot"><div class="product-card__pricing">'
      + '<p class="price">' + esc(fmtPrice(p.price)) + "</p>"
      + (isSale(p) ? '<p class="price--was">Was ' + esc(fmtPrice(p.originalPrice)) + "</p>" : "")
      + "</div>"
      + (p.inStock
        ? '<button type="button" class="btn btn--ink btn--sm js-add" data-id="' + esc(p.id) + '" aria-label="Add ' + esc(p.name) + ' to cart">Add to cart</button>'
        : '<span class="product-card__sold">Sold out</span>')
      + "</div></div></article>";
    return html;
  }
  function cardsHtml(list, opts) {
    var out = [];
    for (var i = 0; i < list.length; i++) out.push(productCard(list[i], opts));
    return out.join("\n");
  }

  function absUrl(siteUrl, path) { return siteUrl.replace(/\/+$/, "") + "/" + String(path || "").replace(/^\/+/, ""); }
  function productLd(p, siteUrl) {
    var ld = {
      "@context": "https://schema.org", "@type": "Product",
      "name": p.name, "sku": p.id, "description": p.description || "",
      "image": images(p).map(function (x) { return absUrl(siteUrl, x); }),
      "category": catLabel(p.category) + (subLabel(p) ? " > " + subLabel(p) : ""),
      "url": absUrl(siteUrl, "product/?id=" + encodeURIComponent(p.slug)),
      "offers": {
        "@type": "Offer", "price": String(p.price), "priceCurrency": "USD",
        "availability": p.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        "itemCondition": "https://schema.org/NewCondition",
        "url": absUrl(siteUrl, "product/?id=" + encodeURIComponent(p.slug)),
        "seller": { "@type": "Organization", "name": C.SITE_NAME }
      }
    };
    if (p.brand) ld.brand = { "@type": "Brand", "name": p.brand };
    if (p.purity) ld.material = p.purity + (p.category === "gold" ? " gold" : p.category === "silver" ? " silver" : "");
    return ld;
  }
  function itemListLd(list, siteUrl) {
    return {
      "@context": "https://schema.org", "@type": "ItemList",
      "name": "All pieces", "numberOfItems": list.length,
      "itemListElement": list.map(function (p, i) {
        return { "@type": "ListItem", "position": i + 1, "url": absUrl(siteUrl, "product/?id=" + encodeURIComponent(p.slug)), "name": p.name };
      })
    };
  }

  function num(v) { if (v === "" || v == null) return null; var n = Number(v); return isFinite(n) ? n : null; }
  function str(v) { return textClean(v == null ? "" : String(v)); }
  /* Coerce a raw record into the canonical shape. Returns null when it cannot be a product at all. */
  function normalizeProduct(raw) {
    if (!raw || typeof raw !== "object") return null;
    var p = {
      id: str(raw.id), slug: str(raw.slug || ""), name: str(raw.name),
      category: str(raw.category).toLowerCase(), type: str(raw.type).toLowerCase(), brand: str(raw.brand),
      purity: str(raw.purity), weight_g: num(raw.weight_g), size: str(raw.size),
      price: num(raw.price), originalPrice: num(raw.originalPrice), currency: "USD",
      images: Array.isArray(raw.images) ? raw.images.map(function (x) { return str(x); }).filter(Boolean).slice(0, 4)
        : (raw.image ? [str(raw.image)] : []),
      description: str(raw.description),
      inStock: raw.inStock !== false && raw.sold !== true,
      featured: raw.featured === true,
      badge: BADGES.indexOf(raw.badge) > -1 ? raw.badge : "",
      placeholder: raw.placeholder === true,
      createdAt: str(raw.createdAt), updatedAt: str(raw.updatedAt)
    };
    if (p.category === "watches") { p.type = ""; p.purity = ""; }
    if (!p.slug && p.name) p.slug = slugify(p.name);
    if (!p.id || !p.name || p.price == null) return null;
    return p;
  }
  /* Returns "" when valid, else the first problem in plain words (shown to the owner in the admin). */
  function validateProduct(p, others) {
    others = others || [];
    if (!/^p-\d{13}$/.test(p.id)) return "The item id is malformed.";
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(p.slug) || p.slug.length > 80) return "The web address (slug) may only use letters, numbers and hyphens.";
    for (var i = 0; i < others.length; i++) {
      if (others[i].id !== p.id && others[i].slug === p.slug) return "Another item already uses the web address \"" + p.slug + "\".";
      if (others[i] !== p && others[i].id === p.id) return "Duplicate item id.";
    }
    if (p.name.length < 2 || p.name.length > 80) return "The name needs 2 to 80 characters.";
    if (!C.TYPES.hasOwnProperty(p.category)) return "Choose a category.";
    if (p.category !== "watches") {
      if (C.TYPES[p.category].indexOf(p.type) < 0) return "Choose a type for this " + catLabel(p.category).toLowerCase() + " piece.";
      if (p.purity && C.PURITIES[p.category].indexOf(p.purity) < 0) return "Choose a purity from the list.";
    } else if (!p.brand) {
      return "Watches need a brand.";
    }
    if (p.brand.length > 40) return "The brand is too long (40 characters).";
    if (p.weight_g != null && !(p.weight_g > 0 && p.weight_g <= 10000)) return "The weight must be between 0 and 10000 g.";
    if (p.size.length > 40) return "The size is too long (40 characters).";
    if (!(p.price >= 1 && p.price <= 1000000)) return "The price must be between $1 and $1,000,000.";
    if (Math.round(p.price * 100) !== p.price * 100) return "The price can have at most two decimals.";
    if (p.originalPrice != null && !(p.originalPrice > p.price)) return "The original price must be higher than the price.";
    if (p.images.length > 4) return "At most 4 photos per item.";
    if (p.description.length > 600) return "The description is too long (600 characters).";
    if (BADGES.indexOf(p.badge) < 0) return "Unknown badge.";
    return "";
  }

  /* Browser only: fetch the live catalogue (cache-busted, never from the HTTP cache) and normalise it.
     Resolves to an array of products; rejects on network or parse failure so callers can keep a pre-rendered grid. */
  function loadProducts(rootPrefix) {
    var url = (rootPrefix || "./") + C.PRODUCTS_PATH + "?ts=" + Date.now();
    return fetch(url, { cache: "no-store" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).then(function (data) {
      var list = (data && data.products) || [];
      return list.map(normalizeProduct).filter(Boolean);
    });
  }

  return {
    loadProducts: loadProducts,
    esc: esc, norm: norm, textClean: textClean, group: group, fmtPrice: fmtPrice, fmtRange: fmtRange, slugify: slugify,
    catLabel: catLabel, typeLabel: typeLabel, subFacet: subFacet, subLabel: subLabel, kicker: kicker,
    sizeText: sizeText, metaParts: metaParts, metaLine: metaLine, altText: altText,
    placeholderFor: placeholderFor, imgPath: imgPath, images: images, coverImage: coverImage, productUrl: productUrl,
    isSale: isSale, badgeFor: badgeFor, sortFeatured: sortFeatured,
    productCard: productCard, cardsHtml: cardsHtml, productLd: productLd, itemListLd: itemListLd, absUrl: absUrl,
    normalizeProduct: normalizeProduct, validateProduct: validateProduct
  };
});
