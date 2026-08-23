/* DiOro999.9 checkout: the order request.
   Phase 1 takes no payment. The form posts the cart and the customer's details to Web3Forms (email to the
   owner) and always offers the same order as a WhatsApp message. The cart is cleared only after the email
   went through.

   PAYMENT HOOK (later): startPayment(order) dispatches on C.PAYMENT_PROVIDER.
   - "none"   (now): sendEmail(order) -> the order request.
   - "paypal": load https://www.paypal.com/sdk/js?client-id=<C.PAYPAL_CLIENT_ID>&currency=USD on demand (only here,
               only when selected), render Smart Buttons into #paymentSlot, createOrder with order.subtotal,
               onApprove: capture, then sendEmail(order) with "paid" in the subject. Extend the CSP meta on this page
               with script-src https://www.paypal.com and connect-src https://www.paypal.com https://api-m.paypal.com
               and frame-src https://www.paypal.com.
   - "stripe": POST the order to C.STRIPE_CHECKOUT_URL (a Cloudflare Worker holding the secret key that creates a
               Checkout Session and returns {url}), then location.assign(url); the Worker's webhook emails the owner;
               extend connect-src with the Worker origin. No card data ever touches this page.
   Both keep sendEmail/waLink as they are. */
(function () {
  "use strict";
  var C = window.DIORO, R = window.DIORO_RENDER, ROOT = window.DIORO_ROOT || "./";
  var form = document.getElementById("checkoutForm");
  if (!form || !C || !R || !window.DIORO_CART) return;
  var CART = window.DIORO_CART;
  var $ = function (id) { return document.getElementById(id); };
  var grid = $("checkoutGrid"), emptyEl = $("coEmpty"), sentEl = $("orderSent"), refEl = $("orderRef"), emailEl = $("orderEmail"), waAfter = $("waAfter");
  var linesEl = $("coLines"), countEl = $("coCount"), subtotalEl = $("coSubtotal"), say = $("coSay"), sendBtn = $("sendOrder"), waBtn = $("waOrder");
  var f = { name: $("coName"), email: $("coEmail"), phone: $("coPhone"), country: $("coCountry"), address: $("coAddress"), city: $("coCity"), postal: $("coPostal"), notes: $("coNotes"), privacy: $("coPrivacy") };
  var lines = [], subtotal = 0, sending = false, sentOnce = false;

  form.setAttribute("novalidate", "");   /* we validate ourselves; the markup stays valid for no-JS */

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function digits(s) { return String(s || "").replace(/\D/g, ""); }
  function val(k) { return String(f[k].value || "").trim(); }
  function setSay(text, kind) { say.textContent = text || ""; say.className = "qf__say" + (kind ? " " + kind : ""); }

  function renderSummary() {
    while (linesEl.firstChild) linesEl.removeChild(linesEl.firstChild);
    var available = lines.filter(function (l) { return l.available; });
    available.forEach(function (l) {
      var li = document.createElement("li");
      li.appendChild(el("span", null, l.qty + " x " + l.product.name));
      li.appendChild(el("span", null, R.fmtPrice(l.lineTotal)));
      linesEl.appendChild(li);
    });
    var n = 0; available.forEach(function (l) { n += l.qty; });
    countEl.textContent = String(n);
    subtotal = CART.subtotal(lines);
    subtotalEl.textContent = R.fmtPrice(subtotal);
    var isEmpty = !available.length;
    emptyEl.hidden = !isEmpty;
    grid.hidden = isEmpty;
    updateWa();
  }

  function makeRef() {
    var t = Date.now().toString(36).toUpperCase(), r = "";
    var chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
    for (var i = 0; i < 3; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
    return (C.ORDER_PREFIX || "DO-") + t + r;
  }
  var currentRef = makeRef();
  function buildOrder() {
    return {
      ref: currentRef, lines: lines.filter(function (l) { return l.available; }), subtotal: subtotal,
      customer: { name: val("name"), email: val("email"), phone: val("phone"), country: val("country"), address: val("address"), city: val("city"), postal: val("postal"), notes: val("notes") },
      createdAt: new Date().toISOString()
    };
  }
  function summaryText(order) {
    var s = CART.summaryText(order.lines);
    return s + "\nSubtotal " + R.fmtPrice(order.subtotal) + " (shipping to be confirmed)";
  }
  function waLink(order) {
    var c = order.customer;
    var text = "Order request " + order.ref + "\n" + summaryText(order)
      + (c.name ? "\nName: " + c.name : "") + (c.phone ? "\nPhone: " + c.phone : "")
      + (c.address ? "\nShip to: " + c.address + ", " + c.city + " " + c.postal + ", " + c.country : "")
      + (c.notes ? "\nNotes: " + c.notes : "")
      + "\nPlease confirm availability and payment details.";
    return "https://wa.me/" + C.WHATSAPP + "?text=" + encodeURIComponent(text);
  }
  function updateWa() { var link = waLink(buildOrder()); if (waBtn) waBtn.href = link; if (waAfter) waAfter.href = link; }

  function sendEmail(order) {
    var c = order.customer, count = 0;
    order.lines.forEach(function (l) { count += l.qty; });
    var message = summaryText(order)
      + "\n\nShip to:\n" + c.name + "\n" + c.address + "\n" + c.city + " " + c.postal + "\n" + c.country
      + "\nPhone: " + c.phone + "\nEmail: " + c.email
      + "\n\nNotes:\n" + (c.notes || "(none)")
      + "\n\nReference: " + order.ref + "\nSent: " + order.createdAt;
    var payload = {
      access_key: C.WEB3FORMS_KEY,
      subject: "Order request " + order.ref + " (" + count + (count === 1 ? " item, " : " items, ") + R.fmtPrice(order.subtotal) + ")",
      from_name: "DiOro999.9 website",
      name: c.name, email: c.email, phone: c.phone, replyto: c.email,
      order_ref: order.ref, message: message, botcheck: ""
    };
    return fetch(C.WEB3FORMS_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload) })
      .then(function (res) { return res.json().catch(function () { return {}; }).then(function (json) { return !!(res.ok && json && json.success === true); }); })
      .catch(function () { return false; });
  }
  var PAYMENT = {
    none: { pay: function (order) { return sendEmail(order).then(function (ok) { return { status: ok ? "requested" : "failed" }; }); } },
    paypal: { pay: function () { return Promise.resolve({ status: "unconfigured" }); } },
    stripe: { pay: function () { return Promise.resolve({ status: "unconfigured" }); } }
  };
  function startPayment(order) { return (PAYMENT[C.PAYMENT_PROVIDER] || PAYMENT.none).pay(order); }

  /* validation */
  var RULES = [
    ["name", function () { return val("name").length >= 2; }],
    ["email", function () { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val("email")); }],
    ["phone", function () { return digits(val("phone")).length >= 6; }],
    ["address", function () { return val("address").length >= 6; }],
    ["city", function () { return val("city").length >= 2; }],
    ["postal", function () { return val("postal").length >= 3; }],
    ["privacy", function () { return !!f.privacy.checked; }]
  ];
  function validate() {
    var first = null;
    RULES.forEach(function (r) {
      var ok = r[1](), input = f[r[0]];
      input.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok && !first) first = input;
    });
    if (first) { first.focus(); setSay("Please check the highlighted fields.", "is-err"); }
    return !first;
  }
  Object.keys(f).forEach(function (k) {
    f[k].addEventListener("input", function () { if (f[k].getAttribute("aria-invalid") === "true") { var r = RULES.filter(function (x) { return x[0] === k; })[0]; if (r && r[1]()) f[k].setAttribute("aria-invalid", "false"); } updateWa(); });
    f[k].addEventListener("change", updateWa);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending || sentOnce) return;
    if (!lines.filter(function (l) { return l.available; }).length) { setSay("Your cart is empty.", "is-err"); return; }
    if (form.querySelector('[name="botcheck"]') && form.querySelector('[name="botcheck"]').checked) return;   /* honeypot */
    if (!validate()) return;
    var order = buildOrder();
    sending = true;
    sendBtn.disabled = true;
    var label = sendBtn.textContent;
    sendBtn.textContent = "Sending...";
    setSay("Sending your request...", "");
    startPayment(order).then(function (res) {
      if (res.status === "requested" || res.status === "paid") {
        sentOnce = true;
        refEl.textContent = order.ref;
        emailEl.textContent = order.customer.email;
        if (waAfter) waAfter.href = waLink(order);
        grid.hidden = true;
        sentEl.hidden = false;
        CART.clear();
        sentEl.focus();
        setSay("", "");
      } else if (res.status === "unconfigured") {
        setSay("Online payment is not set up yet. Send the order on WhatsApp instead.", "is-err");
      } else {
        setSay("The email did not go through. Send the order on WhatsApp instead.", "is-err");
      }
    }).catch(function () {
      setSay("The email did not go through. Send the order on WhatsApp instead.", "is-err");
    }).then(function () {
      sending = false;
      if (!sentOnce) { sendBtn.disabled = false; sendBtn.textContent = label; }
    });
  });

  function refresh() {
    lines = CART.hydrate();
    renderSummary();
  }
  R.loadProducts(ROOT).then(function (list) {
    CART.setProducts(list);
    refresh();
    window.addEventListener("dioro:cart", function () { if (!sentOnce) refresh(); });
  }).catch(function () {
    setSay("Could not load the catalogue. Please reload the page, or order on WhatsApp.", "is-err");
    grid.hidden = false;
  });
})();
