/* DiOro999.9 global interactions: header solid state, mobile nav with focus trap and scroll lock,
   scroll reveal, WhatsApp FAB, back to top, footer year, cart badge, toast.
   Ported from kun/assets/js/main.js and extended with the cart badge and the toast.
   Loaded at the end of body on every page (defer). Needs config.js; render/cart are optional. */
(function () {
  "use strict";
  var header = document.querySelector(".site-header");

  /* ---- scroll lock (depth counted, pins the body, pays the scrollbar width back) ---- */
  var lockDepth = 0, lockY = 0;
  function lockScroll() {
    if (lockDepth++) return;
    lockY = Math.round(window.scrollY || window.pageYOffset || 0);
    var sbw = window.innerWidth - document.documentElement.clientWidth;
    var s = document.body.style;
    s.position = "fixed"; s.top = -lockY + "px"; s.left = "0"; s.right = "0";
    if (sbw > 0) { s.paddingRight = sbw + "px"; if (header) header.style.paddingRight = sbw + "px"; }
  }
  function unlockScroll() {
    if (!lockDepth || --lockDepth) return;
    var s = document.body.style;
    s.position = ""; s.top = ""; s.left = ""; s.right = ""; s.paddingRight = "";
    if (header) header.style.paddingRight = "";
    var d = document.documentElement, prev = d.style.scrollBehavior;
    d.style.scrollBehavior = "auto";
    window.scrollTo(0, lockY);
    d.style.scrollBehavior = prev;
  }

  /* ---- header solid state ---- */
  function onScroll() {
    if (!header || lockDepth) return;
    if (window.scrollY > 40) header.classList.add("is-solid");
    else header.classList.remove("is-solid");
  }
  if (header) { onScroll(); window.addEventListener("scroll", onScroll, { passive: true }); }

  /* ---- mobile navigation with a focus trap ---- */
  var toggle = document.querySelector(".nav-toggle");
  var menu = document.querySelector(".nav-menu");
  var mainEl = document.getElementById("main");
  function focusables(root) {
    return Array.prototype.slice.call(root.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(function (el) { return el.offsetParent !== null || el === document.activeElement; });
  }
  function closeNav() {
    if (!document.body.classList.contains("nav-open")) return;
    document.body.classList.remove("nav-open");
    unlockScroll();
    if (mainEl && "inert" in mainEl) mainEl.inert = false;
    if (toggle) { toggle.setAttribute("aria-expanded", "false"); toggle.setAttribute("aria-label", "Open menu"); }
  }
  function openNav() {
    document.body.classList.add("nav-open");
    lockScroll();
    if (mainEl && "inert" in mainEl) mainEl.inert = true;
    if (toggle) { toggle.setAttribute("aria-expanded", "true"); toggle.setAttribute("aria-label", "Close menu"); }
    var f = menu.querySelector("a"); if (f) f.focus();
  }
  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      if (document.body.classList.contains("nav-open")) closeNav(); else openNav();
    });
    menu.querySelectorAll("a").forEach(function (a) { a.addEventListener("click", closeNav); });
    document.addEventListener("keydown", function (e) {
      if (!document.body.classList.contains("nav-open")) return;
      if (e.key === "Escape") { closeNav(); if (toggle) toggle.focus(); return; }
      if (e.key === "Tab") {
        var list = focusables(menu).concat([toggle]);
        if (!list.length) return;
        var first = list[0], last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    window.addEventListener("resize", function () { if (window.innerWidth > 860) closeNav(); });
  }

  /* ---- scroll reveal ---- */
  var reveals = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  if (reveals.length) {
    var revealCheck = function (stagger) {
      var vh = window.innerHeight || document.documentElement.clientHeight;
      var hit = [], rest = [];
      for (var i = 0; i < reveals.length; i++) (reveals[i].getBoundingClientRect().top < vh * 0.92 ? hit : rest).push(reveals[i]);
      reveals = rest;
      var seen = new Map();
      for (var j = 0; j < hit.length; j++) {
        var par = hit[j].parentNode, k = seen.get(par) || 0;
        seen.set(par, k + 1);
        if (stagger === true) hit[j].style.setProperty("--d", Math.min(k, 3) * 80 + "ms");
        hit[j].classList.add("is-visible");
      }
    };
    if ("IntersectionObserver" in window) {
      var io = new IntersectionObserver(function (entries) {
        var seen = new Map();
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          var el = entries[i].target, par = el.parentNode, k = seen.get(par) || 0;
          seen.set(par, k + 1);
          el.style.setProperty("--d", Math.min(k, 3) * 80 + "ms");
          el.classList.add("is-visible");
          io.unobserve(el);
          var idx = reveals.indexOf(el);
          if (idx > -1) reveals.splice(idx, 1);
        }
      }, { rootMargin: "0px 0px -4% 0px", threshold: 0 });
      for (var n = 0; n < reveals.length; n++) io.observe(reveals[n]);
      var idle;
      window.addEventListener("scroll", function () { clearTimeout(idle); if (reveals.length) idle = setTimeout(function () { revealCheck(true); }, 250); }, { passive: true });
      window.addEventListener("load", function () { if (reveals.length) revealCheck(); });
    } else {
      window.addEventListener("load", revealCheck);
      requestAnimationFrame(function () { revealCheck(); });
    }
  }

  /* ---- WhatsApp FAB: hidden while an in-layout contact CTA is on screen ---- */
  var fab = document.querySelector(".wa-fab");
  if (fab) {
    var blockers = document.querySelectorAll(".hero__btns, .cta-band, .contact-card, .site-footer, .pdp-buy, .cart-summary, .checkout-grid");
    if (!("IntersectionObserver" in window) || !blockers.length) fab.classList.add("is-in");
    else {
      var waIo = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) { e.target.__hit = e.isIntersecting; });
        var blocked = false;
        blockers.forEach(function (el) { if (el.__hit) blocked = true; });
        fab.classList.toggle("is-in", !blocked);
      }, { threshold: 0 });
      blockers.forEach(function (el) { waIo.observe(el); });
    }
  }

  /* ---- back to top ---- */
  var toTop = document.querySelector(".to-top");
  var sentinel = document.querySelector(".hero, .shop-hero, .page-head");
  if (toTop) {
    if (sentinel && "IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) { toTop.classList.toggle("is-in", !entries[0].isIntersecting); }, { threshold: 0 }).observe(sentinel);
    } else {
      window.addEventListener("scroll", function () { toTop.classList.toggle("is-in", window.scrollY > 600); }, { passive: true });
    }
    toTop.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
      var first = document.querySelector(".skip-link"); if (first) first.focus({ preventScroll: true });
    });
  }

  /* ---- footer year ---- */
  var y = document.querySelector("[data-year]");
  if (y) y.textContent = new Date().getFullYear();

  /* ---- cart badge: reads the cart store when present, else the raw localStorage key ---- */
  function cartCount() {
    try {
      if (window.DIORO_CART) return window.DIORO_CART.count();
      var raw = localStorage.getItem((window.DIORO && window.DIORO.CART_KEY) || "dioro_cart_v1");
      if (!raw) return 0;
      var data = JSON.parse(raw), n = 0;
      (data.items || []).forEach(function (it) { n += Number(it.qty) || 0; });
      return n;
    } catch (e) { return 0; }
  }
  function updateCartBadge() {
    var n = cartCount();
    document.querySelectorAll(".cart-count").forEach(function (el) {
      el.textContent = n > 99 ? "99+" : String(n);
      el.hidden = n === 0;
    });
    document.querySelectorAll(".cart-link").forEach(function (a) {
      a.setAttribute("aria-label", n === 0 ? "Cart, empty" : "Cart, " + n + (n === 1 ? " item" : " items"));
    });
  }
  updateCartBadge();
  window.addEventListener("dioro:cart", updateCartBadge);
  window.addEventListener("storage", function (e) { if (!e.key || e.key === ((window.DIORO && window.DIORO.CART_KEY) || "dioro_cart_v1")) updateCartBadge(); });

  /* ---- toast ---- */
  var toastEl = null, toastTimer = null;
  function toast(text, linkHref, linkText, isErr) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    while (toastEl.firstChild) toastEl.removeChild(toastEl.firstChild);
    var span = document.createElement("span"); span.textContent = text; toastEl.appendChild(span);
    if (linkHref) { var a = document.createElement("a"); a.href = linkHref; a.textContent = linkText || "View"; toastEl.appendChild(a); }
    toastEl.classList.toggle("is-err", !!isErr);
    toastEl.classList.add("is-in");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-in"); }, 3200);
  }

  window.DIORO_SITE = { lockScroll: lockScroll, unlockScroll: unlockScroll, toast: toast, updateCartBadge: updateCartBadge };
})();
