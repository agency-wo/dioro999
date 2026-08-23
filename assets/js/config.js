/* DiOro999.9 site configuration.
   The ONE file to edit for contact details, keys, taxonomy and limits.
   Loaded first on every page (sync, in <head>) and by the node tools (_tools/prerender.mjs).
   Pages read window.DIORO; node reads module.exports. */
(function (root, factory) {
  var cfg = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = cfg;
  } else {
    root.DIORO = cfg;
    /* Page depth prefix for relative links: "./" at the root, "../" one level down, "../../" two levels down.
       Relative, not site-absolute, because the site is served under /dioro999/ until its own domain is attached. */
    root.DIORO_ROOT = (root.document && root.document.documentElement.getAttribute("data-root")) || "./";
    /* the .js class gates reveal-on-scroll and the FAB (no inline script is allowed by the CSP) */
    if (root.document) root.document.documentElement.classList.add("js");
  }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";
  var JEWEL_TYPES = ["rings", "necklaces", "chains", "bracelets", "earrings", "pendants", "bars-coins"];
  return Object.freeze({
    SITE_NAME: "DiOro999.9",
    /* TODO: the real domain, no trailing slash. Also HOST in _tools/verify.py and the Sitemap line in robots.txt. */
    SITE_URL: "https://minarankstudio.com/dioro999",
    LOCALE: "en-US",
    CURRENCY: "USD",
    PHONE_DISPLAY: "+1 (000) 000-0000",      /* TODO */
    PHONE_E164: "+10000000000",              /* TODO */
    WHATSAPP: "10000000000",                 /* TODO: digits only, country code first, no plus */
    EMAIL: "orders@example.com",             /* TODO */
    ADDRESS: { street: "TODO street", city: "TODO city", region: "TODO state", postal: "00000", country: "US" },
    HOURS: "Mon to Sat, 10:00 to 19:00",     /* TODO */
    SOCIAL: { instagram: "", facebook: "" }, /* TODO: full URLs; empty hides the link */
    WEB3FORMS_ENDPOINT: "https://api.web3forms.com/submit",
    WEB3FORMS_KEY: "WEB3FORMS_ACCESS_KEY_PLACEHOLDER",   /* TODO: the owner's Web3Forms access key */
    PAYMENT_PROVIDER: "none",                /* "none" | "paypal" | "stripe"  (see the header of checkout.js) */
    PAYPAL_CLIENT_ID: "",
    STRIPE_CHECKOUT_URL: "",
    PRODUCTS_PATH: "data/products.json",
    PLACEHOLDER_IMG: "assets/img/shop/placeholder-generic.svg",
    PRETTY_PRODUCT_URLS: false,              /* Phase 2 flips this when /shop/<slug>/ pages are generated */
    PRICE_MIN: 0,
    PRICE_MAX: 3000,
    PRICE_STEP: 25,
    CATEGORIES: [
      { id: "gold", label: "Gold" },
      { id: "silver", label: "Silver" },
      { id: "watches", label: "Watches" }
    ],
    TYPES: { gold: JEWEL_TYPES, silver: JEWEL_TYPES, watches: [] },
    TYPE_LABELS: {
      rings: "Rings", necklaces: "Necklaces", chains: "Chains", bracelets: "Bracelets",
      earrings: "Earrings", pendants: "Pendants", "bars-coins": "Bars and coins"
    },
    PURITIES: {
      gold: ["999.9", "24K", "22K", "21K", "18K", "14K", "10K", "9K"],
      silver: ["999", "925", "900", "800"],
      watches: []
    },
    CART_KEY: "dioro_cart_v1",
    CART_MAX_QTY: 10,
    CART_MAX_LINES: 20,
    ORDER_PREFIX: "DO-"
  });
});
