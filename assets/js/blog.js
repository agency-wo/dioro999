/* DiOro999.9 blog list: category chips and search over the cards' data attributes (no JSON). */
(function () {
  "use strict";
  var grid = document.getElementById("postGrid");
  if (!grid) return;
  var cats = document.getElementById("blogCats"), search = document.getElementById("blogSearch"), empty = document.getElementById("postEmpty");
  var cat = "all", q = "";
  function norm(s) { return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function apply() {
    var cards = grid.querySelectorAll(".post-card"), shown = 0;
    for (var i = 0; i < cards.length; i++) {
      var c = cards[i];
      var ok = (cat === "all" || c.getAttribute("data-cat") === cat) && (!q || norm(c.getAttribute("data-search")).indexOf(q) > -1);
      c.hidden = !ok;
      if (ok) shown++;
    }
    if (empty) empty.hidden = shown > 0;
  }
  if (cats) {
    cats.addEventListener("click", function (e) {
      var chip = e.target.closest ? e.target.closest("[data-cat]") : null;
      if (!chip) return;
      cat = chip.getAttribute("data-cat");
      cats.querySelectorAll("[data-cat]").forEach(function (c) {
        var on = c === chip;
        c.classList.toggle("active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      apply();
    });
  }
  if (search) {
    var onSearch = function () { q = norm(search.value.trim()); apply(); };
    search.addEventListener("input", onSearch);
    search.addEventListener("search", onSearch);
  }
})();
