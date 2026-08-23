/* DiOro999.9 blog post: fills "Pieces related to this guide" from the live catalogue. */
(function () {
  "use strict";
  var C = window.DIORO, R = window.DIORO_RENDER, ROOT = window.DIORO_ROOT || "./";
  var grid = document.getElementById("relatedGrid");
  if (!grid || !C || !R) return;
  var section = grid.closest(".post-related") || grid.parentNode;
  var cat = grid.getAttribute("data-cat") || "gold";
  var max = cat === "watches" ? 4 : 3;
  R.loadProducts(ROOT).then(function (list) {
    if (window.DIORO_CART) window.DIORO_CART.setProducts(list);
    var pool = list.filter(function (p) { return p.category === cat; });
    pool.sort(function (a, b) { return (b.inStock === true) - (a.inStock === true) || (b.featured === true) - (a.featured === true); });
    pool = pool.slice(0, max);
    if (!pool.length) { section.hidden = true; return; }
    grid.innerHTML = R.cardsHtml(pool, { root: ROOT, heading: "h3" });
    section.hidden = false;
  }).catch(function () { section.hidden = true; });
})();
