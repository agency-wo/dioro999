/* DiOro999.9 contact form: progressive enhancement over a native Web3Forms POST.
   With JS off the form posts to Web3Forms and comes back to ?sent=1#sent, where the :target rule in
   styles.css shows the done panel. With JS on we validate, POST JSON with fetch and show the same panel. */
(function () {
  "use strict";
  var C = window.DIORO;
  var form = document.getElementById("contact-form");
  if (!form || !C) return;
  var say = document.getElementById("c-say"), btn = document.getElementById("c-send"), done = document.getElementById("sent"), ref = document.getElementById("c-ref");
  var name = document.getElementById("c-name"), email = document.getElementById("c-email"), msg = document.getElementById("c-msg");
  form.setAttribute("novalidate", "");

  /* prefill the reference from ?ref= (the product page links here) */
  try {
    var u = new URLSearchParams(window.location.search);
    if (ref && u.get("ref") && !ref.value) ref.value = u.get("ref").slice(0, 120);
    if (u.get("sent") === "1" && done) { done.parentNode.classList.add("is-sent"); done.focus(); }
  } catch (e) { /* ignore */ }

  function setSay(text, kind) { say.textContent = text || ""; say.className = "qf__say" + (kind ? " " + kind : ""); }
  function valid() {
    var first = null;
    [[name, name.value.trim().length >= 2], [email, /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())], [msg, msg.value.trim().length >= 5]].forEach(function (pair) {
      pair[0].setAttribute("aria-invalid", pair[1] ? "false" : "true");
      if (!pair[1] && !first) first = pair[0];
    });
    if (first) { first.focus(); setSay("Please check the highlighted fields.", "is-err"); }
    return !first;
  }
  [name, email, msg].forEach(function (i) { i.addEventListener("input", function () { if (i.getAttribute("aria-invalid") === "true") i.setAttribute("aria-invalid", "false"); }); });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var hp = form.querySelector('[name="botcheck"]');
    if (hp && hp.checked) return;
    if (!valid()) return;
    btn.disabled = true;
    setSay("Sending...", "");
    var payload = {
      access_key: C.WEB3FORMS_KEY, subject: "Message from the DiOro999.9 website", from_name: "DiOro999.9 website",
      name: name.value.trim(), email: email.value.trim(), replyto: email.value.trim(),
      reference: ref ? ref.value.trim() : "", message: msg.value.trim(), botcheck: ""
    };
    fetch(C.WEB3FORMS_ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return r.ok && j && j.success === true; }); })
      .catch(function () { return false; })
      .then(function (ok) {
        if (ok) { form.parentNode.classList.add("is-sent"); done.focus(); setSay("", ""); }
        else { setSay("The message did not go through. Please try again, or message us on WhatsApp.", "is-err"); btn.disabled = false; }
      });
  });
})();
