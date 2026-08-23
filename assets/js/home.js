/* DiOro999.9 home: repaint the featured grid from the live catalogue (the HTML ships pre-rendered). */
(function () {
  "use strict";
  var C = window.DIORO, R = window.DIORO_RENDER, ROOT = window.DIORO_ROOT || "./";
  var grid = document.getElementById("featuredGrid");
  if (!grid || !C || !R) return;
  R.loadProducts(ROOT).then(function (list) {
    if (window.DIORO_CART) window.DIORO_CART.setProducts(list);
    var inStock = list.filter(function (p) { return p.inStock; });
    var featured = R.sortFeatured(inStock.filter(function (p) { return p.featured; }));
    if (featured.length < 3) {
      featured = inStock.slice().sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
    }
    featured = featured.slice(0, 6);
    if (featured.length) grid.innerHTML = R.cardsHtml(featured, { root: ROOT, heading: "h3" });
  }).catch(function () { /* the pre-rendered block stands */ });
})();
