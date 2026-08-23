/* DiOro999.9 owner admin.
   PUBLISH MODEL: the site is a static GitHub Pages repo. "Publishing" means this page, running in the
   owner's browser, commits to that repo through the GitHub Contents API with a fine-grained personal
   access token (Contents: Read and write) that lives only in this browser, encrypted at rest with an
   AES-GCM key derived from the login password. data/products.json is the database; photos are
   resized in the browser and committed under assets/img/shop/ BEFORE the JSON is written. The JSON is
   re-read from GitHub immediately before every write (so two devices cannot clobber each other) and a
   sha conflict is retried once. GitHub Pages redeploys in 1 to 2 minutes.
   LOGIN: PBKDF2-HMAC-SHA256(utf8(user.toLowerCase() + ":" + password), utf8(SALT), 250000, 32) compared
   to LOGIN_HASH. The hash is public by design; the token is the real protection, and it is never in
   the repo. To rotate the password run _tools/hash.mjs and replace SALT and LOGIN_HASH below.
   Owner-typed text is rendered with textContent only, never innerHTML. */
(function () {
  "use strict";
  var C = window.DIORO, R = window.DIORO_RENDER;

  /* ---------- constants (edit OWNER / REPO / USER / SALT / LOGIN_HASH only) ---------- */
  var OWNER = "agency-wo", REPO = "dioro999", BRANCH = "main";
  var JSON_PATH = "data/products.json", PHOTO_DIR = "assets/img/shop", API = "https://api.github.com";
  var USER = "olsi";
  var SALT = "d30069fe8b5ea5a0694873755992a037";
  var LOGIN_HASH = "9edf4e03553c02260bcc0418f1f40dfdac2db5d896e08ef4eaac227195c5660c";
  var ITERS = 250000, SESSION_KEY = "dioro_admin_session", TOKEN_KEY = "dioro_admin_token_v1";
  var MAX_PHOTOS = 4, MAX_EDGE = 1200, JPEG_Q = 0.85, MAX_PHOTO_BYTES = 600000, JSON_WARN_BYTES = 800000;
  var TOKEN_SHAPE = /^(github_pat_[A-Za-z0-9_]{20,}|gh[pos]_[A-Za-z0-9]{20,})$/;

  var MSG = {
    wrongLogin: "Wrong username or password.",
    noCrypto: "This browser cannot run the admin securely. Open the page over https in Chrome, Safari or Firefox.",
    keyShape: "That does not look like a GitHub key. It starts with github_pat_ or ghp_.",
    keyRejected: "GitHub did not accept the key. It may be mistyped or expired; create a new one.",
    keyNoRepo: "The key cannot see the site's repository. Create it again with Only select repositories and pick dioro999.",
    keyNoWrite: "The key cannot write to the site. Create it again with Contents: Read and write.",
    keySaved: "Key saved on this device.",
    keyFirst: "Save the publish key first (the box at the bottom of this page).",
    keyReenter: "The saved key could not be unlocked on this device. Please paste it again.",
    keyForgotten: "The key was removed from this device.",
    stateNo: "No key on this device yet.",
    stateYes: "Publish key saved on this device.",
    photoBad: "This photo could not be read. Try a JPG or PNG.",
    photoMax: "At most " + MAX_PHOTOS + " photos per piece.",
    conflict: "Someone else published at the same time. Please try again.",
    published: "Published. The shop updates in 1 to 2 minutes.",
    listUnreadable: "The product list could not be read from GitHub, so nothing was changed. Try again in a minute.",
    offline: "Could not reach GitHub. Check the connection and try again.",
    rateLimit: "GitHub is rate limiting this key. Wait a few minutes and try again.",
    jsonBig: "The product list is getting large. Ask the person who looks after the site to archive old pieces.",
    busyUpload: "Uploading photo {n} of {t}...",
    busyPublish: "Publishing...",
    removed: "Removed.",
    soldOut: "Marked as sold out.",
    backIn: "Back in stock."
  };

  /* ---------- dom ---------- */
  function $(id) { return document.getElementById(id); }
  var loginView = $("loginView"), loginForm = $("loginForm"), loginUser = $("loginUser"), loginPass = $("loginPass"), loginMsg = $("loginMsg"), loginBtn = $("loginBtn");
  var adminView = $("adminView"), logoutBtn = $("logoutBtn");
  var itemList = $("itemList"), itemsEmpty = $("itemsEmpty"), listMsg = $("listMsg"), listCount = $("listCount"), listSearch = $("listSearch");
  var addForm = $("addForm"), addCardTitle = $("addCardTitle"), addBtn = $("addBtn"), cancelEditBtn = $("cancelEditBtn"), addMsg = $("addMsg");
  var fName = $("addName"), fCat = $("addCategory"), fType = $("addType"), fBrand = $("addBrand"), fPurity = $("addPurity"), fWeight = $("addWeight"), fSize = $("addSize"), fPrice = $("addPrice"), fWas = $("addOriginalPrice"), fDesc = $("addDesc"), fPhotos = $("addPhotos"), photoList = $("photoList"), editPhotoHint = $("editPhotoHint"), fInStock = $("addInStock"), fFeatured = $("addFeatured"), fBadge = $("addBadge"), slugRow = $("slugRow"), slugText = $("slugText");
  var typeField = $("typeField"), brandField = $("brandField"), purityField = $("purityField");
  var tokenInput = $("tokenInput"), saveTokenBtn = $("saveTokenBtn"), forgetTokenBtn = $("forgetTokenBtn"), tokenMsg = $("tokenMsg"), tokenState = $("tokenState"), keyWarn = $("keyWarn");

  /* ---------- state ---------- */
  var TOKEN = null, PASS = null, PRODUCTS = [], editing = null, photoItems = [], listFilter = "all", listQuery = "", busy = false;

  function setMsg(el, text, kind) {
    if (!el) return;
    el.textContent = text || "";
    el.className = "admin-msg" + (text ? " show " + (kind || "") : "");
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  var hasCrypto = !!(window.crypto && window.crypto.subtle && window.TextEncoder);
  var enc = hasCrypto ? new TextEncoder() : null;

  /* ---------- encoding helpers ---------- */
  function toHex(buf) {
    var b = new Uint8Array(buf), s = "";
    for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
    return s;
  }
  function fromHex(hex) {
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  /* btoa corrupts anything outside Latin-1, so encode the UTF-8 bytes in chunks */
  function b64EncodeUtf8(str) {
    var bytes = enc.encode(str), bin = "", CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }
  function b64DecodeUtf8(b64) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }
  function blobToBase64(blob) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result).split(",")[1] || ""); };
      fr.onerror = function () { reject(new Error(MSG.photoBad)); };
      fr.readAsDataURL(blob);
    });
  }

  /* ---------- crypto: login hash and the token at rest ---------- */
  function pbkdf2Bits(secret, saltBytes, bits) {
    return crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]).then(function (key) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", salt: saltBytes, iterations: ITERS, hash: "SHA-256" }, key, bits);
    });
  }
  function loginHash(user, pass) {
    return pbkdf2Bits(String(user).toLowerCase() + ":" + pass, enc.encode(SALT), 256).then(toHex);
  }
  function deriveTokenKey(pass, saltBytes) {
    return pbkdf2Bits("token:" + pass, saltBytes, 256).then(function (bits) {
      return crypto.subtle.importKey("raw", bits, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
    });
  }
  function encryptToken(token, pass) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveTokenKey(pass, salt).then(function (key) {
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(token));
    }).then(function (ct) {
      return { v: 1, salt: toHex(salt), iv: toHex(iv), ct: toHex(ct) };
    });
  }
  function decryptToken(blob, pass) {
    return Promise.resolve().then(function () {
      if (!blob || blob.v !== 1 || !blob.salt || !blob.iv || !blob.ct) throw new Error("shape");
      return deriveTokenKey(pass, fromHex(blob.salt));
    }).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: fromHex(blob.iv) }, key, fromHex(blob.ct));
    }).then(function (pt) { return new TextDecoder().decode(pt); }).catch(function () { return null; });
  }
  function readTokenBlob() {
    try { var raw = localStorage.getItem(TOKEN_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function writeTokenBlob(blob) {
    try { if (blob) localStorage.setItem(TOKEN_KEY, JSON.stringify(blob)); else localStorage.removeItem(TOKEN_KEY); } catch (e) { /* private mode */ }
  }
  function showTokenState() {
    if (!tokenState) return;
    tokenState.textContent = TOKEN ? MSG.stateYes : MSG.stateNo;
    tokenState.classList.toggle("is-ok", !!TOKEN);
    if (forgetTokenBtn) forgetTokenBtn.hidden = !TOKEN;
    /* the key card is at the bottom now, so say so at the top while there is no key */
    if (keyWarn) keyWarn.hidden = !!TOKEN;
  }

  /* ---------- GitHub Contents API ---------- */
  function ConflictError(msg) { this.name = "ConflictError"; this.message = msg || MSG.conflict; }
  ConflictError.prototype = Object.create(Error.prototype);

  function ghHeaders(token, json) {
    var h = { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (json) h["Content-Type"] = "application/json";
    return h;
  }
  function ghFetch(url, opts) {
    return fetch(url, opts).catch(function () { throw new Error(MSG.offline); });
  }
  function httpError(res, bodyText) {
    var text = String(bodyText || "");
    if (res.status === 401) return new Error(MSG.keyRejected);
    if (res.status === 403) return new Error(/rate limit/i.test(text) ? MSG.rateLimit : MSG.keyNoWrite);
    if (res.status === 404) return new Error(MSG.keyNoRepo);
    if (res.status === 409) return new ConflictError();
    if (res.status === 422 && /sha|does not match/i.test(text)) return new ConflictError();
    return new Error("GitHub answered " + res.status + ". " + (text ? text.slice(0, 160) : ""));
  }
  function ghCheckToken(token) {
    return ghFetch(API + "/repos/" + OWNER + "/" + REPO, { headers: ghHeaders(token), cache: "no-store" }).then(function (res) {
      if (res.status === 401) throw new Error(MSG.keyRejected);
      if (res.status === 404 || res.status === 403) throw new Error(MSG.keyNoRepo);
      if (!res.ok) throw new Error("GitHub answered " + res.status + ".");
      return res.json();
    }).then(function (json) {
      if (!json || !json.permissions || json.permissions.push !== true) throw new Error(MSG.keyNoWrite);
      return true;
    });
  }
  function ghGet(path) {
    var url = API + "/repos/" + OWNER + "/" + REPO + "/contents/" + path + "?ref=" + encodeURIComponent(BRANCH);
    return ghFetch(url, { headers: ghHeaders(TOKEN), cache: "no-store" }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw httpError(res, t); });
      return res.json();
    }).then(function (json) {
      return { sha: json.sha, content: json.content || "", size: json.size || 0 };
    });
  }
  function ghPut(path, b64, message, sha) {
    var body = { message: message, content: b64, branch: BRANCH };
    if (sha) body.sha = sha;
    var url = API + "/repos/" + OWNER + "/" + REPO + "/contents/" + path;
    return ghFetch(url, { method: "PUT", headers: ghHeaders(TOKEN, true), body: JSON.stringify(body) }).then(function (res) {
      if (!res.ok) return res.text().then(function (t) { throw httpError(res, t); });
      return res.json();
    });
  }

  /* ---------- publish: read, mutate, validate, write (with one conflict retry) ---------- */
  function publishProducts(mutate, label) {
    if (!TOKEN) return Promise.reject(new Error(MSG.keyFirst));
    function attempt(retry) {
      return ghGet(JSON_PATH).then(function (cur) {
        var data;
        try { data = JSON.parse(b64DecodeUtf8(cur.content.replace(/\n/g, ""))); } catch (e) { throw new Error(MSG.listUnreadable); }
        if (!data || !Array.isArray(data.products)) throw new Error(MSG.listUnreadable);
        var list = data.products.map(R.normalizeProduct).filter(Boolean);
        var next = mutate(list);
        for (var i = 0; i < next.length; i++) {
          var err = R.validateProduct(next[i], next);
          if (err) throw new Error(err + " (" + next[i].name + ")");
        }
        var body = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), products: next }, null, 2) + "\n";
        if (body.length > JSON_WARN_BYTES) setMsg(listMsg, MSG.jsonBig, "err");
        return ghPut(JSON_PATH, b64EncodeUtf8(body), label, cur.sha).then(function () { return next; });
      }).catch(function (e) {
        if (e instanceof ConflictError && !retry) return attempt(true);
        throw e;
      });
    }
    return attempt(false).then(function (next) {
      PRODUCTS = next;
      renderList();
      return next;
    });
  }

  /* ---------- photos ---------- */
  function decodeImage(file) {
    var viaBitmap = function (opts) {
      return opts ? createImageBitmap(file, opts) : createImageBitmap(file);
    };
    var viaElement = function () {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () {
          var img = new Image();
          img.onload = function () { resolve(img); };
          img.onerror = function () { reject(new Error(MSG.photoBad)); };
          img.src = fr.result;
        };
        fr.onerror = function () { reject(new Error(MSG.photoBad)); };
        fr.readAsDataURL(file);
      });
    };
    if (!window.createImageBitmap) return viaElement();
    return viaBitmap({ imageOrientation: "from-image" }).catch(function () { return viaBitmap(null); }).catch(viaElement);
  }
  function resizeToJpeg(file) {
    return decodeImage(file).then(function (img) {
      var w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
      if (!w || !h) throw new Error(MSG.photoBad);
      var scale = Math.min(1, MAX_EDGE / Math.max(w, h));
      var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
      var canvas = document.createElement("canvas");
      canvas.width = cw; canvas.height = ch;
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, cw, ch);   /* JPEG has no alpha: transparent PNG corners go white */
      ctx.drawImage(img, 0, 0, cw, ch);
      if (img.close) img.close();
      function toBlob(q) {
        return new Promise(function (resolve, reject) {
          canvas.toBlob(function (b) { if (b) resolve(b); else reject(new Error(MSG.photoBad)); }, "image/jpeg", q);
        });
      }
      return toBlob(JPEG_Q).then(function (b) { return b.size > MAX_PHOTO_BYTES ? toBlob(0.72) : b; });
    });
  }
  function uploadPhotos(id, files, onProgress) {
    var paths = [];
    var chain = Promise.resolve();
    files.forEach(function (file, i) {
      chain = chain.then(function () {
        if (onProgress) onProgress(i + 1, files.length);
        return resizeToJpeg(file).then(blobToBase64).then(function (b64) {
          var path = PHOTO_DIR + "/" + id + "-" + Date.now() + "-" + (i + 1) + ".jpg";
          return ghPut(path, b64, "Add photo " + (i + 1) + " for " + id, null).then(function () { paths.push(path); });
        }).then(function () { return sleep(300); });
      });
    });
    return chain.then(function () { return paths; });
  }

  /* ---------- the form ---------- */
  function option(value, label) { var o = document.createElement("option"); o.value = value; o.textContent = label; return o; }
  function fillSelect(sel, items) {
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    items.forEach(function (it) { sel.appendChild(option(it.value, it.label)); });
  }
  function populateCategory() {
    fillSelect(fCat, C.CATEGORIES.map(function (c) { return { value: c.id, label: c.label }; }));
  }
  function populateForCategory(cat, keepType, keepPurity) {
    var isWatch = cat === "watches";
    typeField.hidden = isWatch; purityField.hidden = isWatch; brandField.hidden = !isWatch;
    fillSelect(fType, (C.TYPES[cat] || []).map(function (t) { return { value: t, label: C.TYPE_LABELS[t] || t }; }));
    fillSelect(fPurity, [{ value: "", label: "Not stated" }].concat((C.PURITIES[cat] || []).map(function (p) { return { value: p, label: p }; })));
    if (keepType != null) fType.value = keepType;
    if (keepPurity != null) fPurity.value = keepPurity;
  }
  function revokeAll() {
    photoItems.forEach(function (it) { if (it.url && it.kind === "new") { try { URL.revokeObjectURL(it.url); } catch (e) { /* ignore */ } } });
  }
  function renderPhotos() {
    while (photoList.firstChild) photoList.removeChild(photoList.firstChild);
    photoItems.forEach(function (it, i) {
      var li = document.createElement("li");
      var img = document.createElement("img");
      img.alt = it.kind === "new" ? "New photo " + (i + 1) : "Current photo " + (i + 1);
      img.src = it.kind === "new" ? it.url : R.imgPath(it.path, "./");
      li.appendChild(img);
      if (i === 0) { var tag = document.createElement("span"); tag.className = "cover"; tag.textContent = "Cover"; li.appendChild(tag); }
      if (i > 0) { var mk = document.createElement("button"); mk.type = "button"; mk.className = "btn btn-dark"; mk.textContent = "Make cover"; mk.setAttribute("data-photo", String(i)); mk.setAttribute("data-act", "cover"); li.appendChild(mk); }
      var rm = document.createElement("button"); rm.type = "button"; rm.className = "btn btn-remove"; rm.textContent = "Remove"; rm.setAttribute("data-photo", String(i)); rm.setAttribute("data-act", "remove"); li.appendChild(rm);
      photoList.appendChild(li);
    });
  }
  function resetForm() {
    editing = null;
    addForm.reset();
    revokeAll();
    photoItems = [];
    renderPhotos();
    populateForCategory(fCat.value || "gold");
    fInStock.checked = true;
    addCardTitle.textContent = "Add a piece";
    addBtn.textContent = "Add and publish";
    cancelEditBtn.hidden = true;
    editPhotoHint.hidden = true;
    slugRow.hidden = true;
    slugText.textContent = "";
  }
  function numOrNull(v) { v = String(v || "").trim(); if (!v) return null; var n = Number(v); return isFinite(n) ? n : NaN; }
  function uniqueSlug(base, ownId) {
    var slug = base || "piece", n = 2, taken = {};
    PRODUCTS.forEach(function (p) { if (p.id !== ownId) taken[p.slug] = true; });
    while (taken[slug]) slug = base + "-" + (n++);
    return slug;
  }
  function buildProduct(existing) {
    var cat = fCat.value;
    var name = R.textClean(fName.value);
    var raw = {
      id: existing ? existing.id : "p-" + Date.now(),
      slug: existing ? existing.slug : uniqueSlug(R.slugify(name), null),
      name: name, category: cat,
      type: cat === "watches" ? "" : fType.value,
      brand: cat === "watches" ? R.textClean(fBrand.value) : "",
      purity: cat === "watches" ? "" : fPurity.value,
      weight_g: numOrNull(fWeight.value), size: R.textClean(fSize.value),
      price: numOrNull(fPrice.value), originalPrice: numOrNull(fWas.value), currency: "USD",
      images: photoItems.filter(function (it) { return it.kind === "kept"; }).map(function (it) { return it.path; }),
      description: R.textClean(fDesc.value),
      inStock: !!fInStock.checked, featured: !!fFeatured.checked, badge: fBadge.value || "",
      placeholder: false,
      createdAt: existing && existing.createdAt ? existing.createdAt : today(), updatedAt: today()
    };
    if (raw.price !== raw.price) raw.price = -1;           /* NaN: let validation name the field */
    if (raw.weight_g !== raw.weight_g) raw.weight_g = -1;
    if (raw.originalPrice !== raw.originalPrice) raw.originalPrice = -1;
    return raw;
  }
  function validateDraft(p) {
    if (!p.name) return "Type a name.";
    if (p.price == null || !(p.price >= 1)) return "Type the price in US dollars.";
    if (p.weight_g != null && !(p.weight_g > 0)) return "The weight must be a number of grams.";
    if (p.originalPrice != null && !(p.originalPrice > p.price)) return "The original price must be higher than the price, or leave it empty.";
    if (photoItems.length > MAX_PHOTOS) return MSG.photoMax;
    var norm = R.normalizeProduct(p);
    if (!norm) return "Something is missing: name, category or price.";
    return R.validateProduct(norm, PRODUCTS.filter(function (x) { return x.id !== norm.id; }).concat([norm]));
  }
  function onAddSubmit(e) {
    e.preventDefault();
    if (busy) return;
    if (!TOKEN) { setMsg(addMsg, MSG.keyFirst, "err"); tokenInput.focus(); return; }
    var draft = buildProduct(editing);
    var err = validateDraft(draft);
    if (err) { setMsg(addMsg, err, "err"); return; }
    var newFiles = photoItems.filter(function (it) { return it.kind === "new"; }).map(function (it) { return it.file; });
    var wasEditing = editing, label = (wasEditing ? "Update " : "Add ") + draft.name;
    busy = true; addBtn.disabled = true;
    setMsg(addMsg, newFiles.length ? MSG.busyUpload.replace("{n}", "1").replace("{t}", String(newFiles.length)) : MSG.busyPublish, "busy");
    uploadPhotos(draft.id, newFiles, function (n, t) { setMsg(addMsg, MSG.busyUpload.replace("{n}", String(n)).replace("{t}", String(t)), "busy"); }).then(function (uploaded) {
      /* keep the owner's order: kept and new photos interleaved as shown in the preview list */
      var ui = 0, ordered = [];
      photoItems.forEach(function (it) { ordered.push(it.kind === "kept" ? it.path : uploaded[ui++]); });
      draft.images = ordered.filter(Boolean).slice(0, MAX_PHOTOS);
      var p = R.normalizeProduct(draft);
      setMsg(addMsg, MSG.busyPublish, "busy");
      return publishProducts(function (list) {
        if (!wasEditing) return list.concat([p]);
        var found = false;
        var out = list.map(function (x) { if (x.id === p.id) { found = true; return p; } return x; });
        if (!found) out.push(p);
        return out;
      }, label);
    }).then(function () {
      resetForm();
      setMsg(addMsg, MSG.published, "ok");
    }).catch(function (e) {
      setMsg(addMsg, e && e.message ? e.message : String(e), "err");
    }).then(function () { busy = false; addBtn.disabled = false; });
  }
  function startEdit(id) {
    var p = PRODUCTS.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    resetForm();
    editing = p;
    fName.value = p.name;
    fCat.value = p.category;
    populateForCategory(p.category, p.type, p.purity);
    fBrand.value = p.brand || "";
    fWeight.value = p.weight_g == null ? "" : String(p.weight_g);
    fSize.value = p.size || "";
    fPrice.value = String(p.price);
    fWas.value = p.originalPrice == null ? "" : String(p.originalPrice);
    fDesc.value = p.description || "";
    fInStock.checked = !!p.inStock;
    fFeatured.checked = !!p.featured;
    fBadge.value = p.badge || "";
    photoItems = (p.images || []).map(function (path) { return { kind: "kept", path: path }; });
    renderPhotos();
    addCardTitle.textContent = "Edit piece";
    addBtn.textContent = "Save changes";
    cancelEditBtn.hidden = false;
    editPhotoHint.hidden = false;
    slugRow.hidden = false;
    slugText.textContent = p.slug;
    setMsg(addMsg, "", "");
    $("formCard").scrollIntoView({ behavior: "smooth", block: "start" });
    fName.focus({ preventScroll: true });
  }
  function toggleStock(id) {
    if (busy) return;
    var p = PRODUCTS.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (!TOKEN) { setMsg(listMsg, MSG.keyFirst, "err"); return; }
    var toOut = !!p.inStock;
    busy = true;
    setMsg(listMsg, MSG.busyPublish, "busy");
    publishProducts(function (list) {
      return list.map(function (x) { if (x.id === id) { x.inStock = !toOut; x.updatedAt = today(); } return x; });
    }, (toOut ? "Mark sold out: " : "Back in stock: ") + p.name).then(function () {
      setMsg(listMsg, toOut ? MSG.soldOut : MSG.backIn, "ok");
    }).catch(function (e) { setMsg(listMsg, e.message || String(e), "err"); }).then(function () { busy = false; });
  }
  function removeItem(id) {
    if (busy) return;
    var p = PRODUCTS.filter(function (x) { return x.id === id; })[0];
    if (!p) return;
    if (!TOKEN) { setMsg(listMsg, MSG.keyFirst, "err"); return; }
    if (!window.confirm("Remove " + p.name + " from the shop?")) return;
    busy = true;
    setMsg(listMsg, MSG.busyPublish, "busy");
    publishProducts(function (list) { return list.filter(function (x) { return x.id !== id; }); }, "Remove " + p.name).then(function () {
      if (editing && editing.id === id) resetForm();
      setMsg(listMsg, MSG.removed, "ok");
    }).catch(function (e) { setMsg(listMsg, e.message || String(e), "err"); }).then(function () { busy = false; });
  }

  /* ---------- the list ---------- */
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function renderList() {
    while (itemList.firstChild) itemList.removeChild(itemList.firstChild);
    var q = R.norm(listQuery);
    var shown = PRODUCTS.filter(function (p) {
      if (listFilter === "sold") { if (p.inStock) return false; }
      else if (listFilter !== "all" && p.category !== listFilter) return false;
      if (q && R.norm([p.name, p.brand, R.typeLabel(p.type), p.purity, p.id, p.slug].join(" ")).indexOf(q) < 0) return false;
      return true;
    });
    itemsEmpty.hidden = PRODUCTS.length > 0;
    if (listCount) listCount.textContent = PRODUCTS.length ? (shown.length === PRODUCTS.length ? PRODUCTS.length + " pieces" : shown.length + " of " + PRODUCTS.length + " pieces") : "";
    shown.forEach(function (p) {
      var li = el("li", "admin-item");
      var img = document.createElement("img");
      img.src = R.coverImage(p, "./"); img.alt = ""; img.width = 54; img.height = 54; img.loading = "lazy";
      li.appendChild(img);
      var info = el("div", "admin-item-info");
      info.appendChild(el("div", "admin-item-name", p.name));
      var meta = R.metaLine(p);
      info.appendChild(el("div", "admin-item-price", R.fmtPrice(p.price) + (p.originalPrice ? " (was " + R.fmtPrice(p.originalPrice) + ")" : "") + (meta ? " · " + meta : "")));
      var pills = el("div", "admin-item-pills");
      pills.appendChild(el("span", "admin-item-cat", R.kicker(p)));
      pills.appendChild(el("span", "admin-item-stock" + (p.inStock ? "" : " is-out"), p.inStock ? "In stock" : "Sold out"));
      if (p.featured) pills.appendChild(el("span", "admin-item-cat", "Home page"));
      if (p.badge) pills.appendChild(el("span", "admin-item-cat", p.badge));
      if (p.placeholder) pills.appendChild(el("span", "admin-item-cat", "Placeholder"));
      info.appendChild(pills);
      if (p.description) info.appendChild(el("div", "admin-item-desc", p.description));
      li.appendChild(info);
      var actions = el("div", "admin-item-actions");
      var bEdit = el("button", "btn btn-sm btn-edit", "Edit"); bEdit.type = "button"; bEdit.setAttribute("data-act", "edit"); bEdit.setAttribute("data-id", p.id);
      var bStock = el("button", "btn btn-sm btn-stock", p.inStock ? "Mark sold out" : "Back in stock"); bStock.type = "button"; bStock.setAttribute("data-act", "stock"); bStock.setAttribute("data-id", p.id);
      var bRm = el("button", "btn btn-sm btn-remove", "Remove"); bRm.type = "button"; bRm.setAttribute("data-act", "remove"); bRm.setAttribute("data-id", p.id);
      actions.appendChild(bEdit); actions.appendChild(bStock); actions.appendChild(bRm);
      li.appendChild(actions);
      itemList.appendChild(li);
    });
  }
  function loadList() {
    return R.loadProducts("./").then(function (list) { PRODUCTS = list; renderList(); }).catch(function () {
      setMsg(listMsg, "Could not load the product list. Check the connection and refresh.", "err");
    });
  }

  /* ---------- login, token, session ---------- */
  function showAdmin() {
    loginView.hidden = true;
    adminView.hidden = false;
    logoutBtn.hidden = false;
    showTokenState();
    loadList();
  }
  function tryLogin(e) {
    e.preventDefault();
    if (!hasCrypto) { setMsg(loginMsg, MSG.noCrypto, "err"); return; }
    var user = loginUser.value.trim(), pass = loginPass.value;
    loginBtn.disabled = true;
    setMsg(loginMsg, "", "");
    loginHash(user, pass).then(function (hex) {
      if (user.toLowerCase() !== USER || hex !== LOGIN_HASH) { setMsg(loginMsg, MSG.wrongLogin, "err"); loginPass.select(); return; }
      PASS = pass;
      try { sessionStorage.setItem(SESSION_KEY, "1"); } catch (err) { /* ignore */ }
      var blob = readTokenBlob();
      var p = blob ? decryptToken(blob, PASS) : Promise.resolve(null);
      return p.then(function (token) {
        if (blob && !token) { writeTokenBlob(null); setMsg(tokenMsg, MSG.keyReenter, "err"); }
        TOKEN = token && TOKEN_SHAPE.test(token) ? token : null;
        loginForm.reset();
        showAdmin();
      });
    }).catch(function (err) { setMsg(loginMsg, err.message || MSG.wrongLogin, "err"); }).then(function () { loginBtn.disabled = false; });
  }
  function logout() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    TOKEN = null; PASS = null;
    location.reload();
  }
  function saveToken() {
    var token = tokenInput.value.trim();
    if (!TOKEN_SHAPE.test(token)) { setMsg(tokenMsg, MSG.keyShape, "err"); return; }
    if (!PASS) { setMsg(tokenMsg, "Log in again before saving the key.", "err"); return; }
    saveTokenBtn.disabled = true;
    setMsg(tokenMsg, "Checking the key with GitHub...", "busy");
    ghCheckToken(token).then(function () {
      return encryptToken(token, PASS);
    }).then(function (blob) {
      writeTokenBlob(blob);
      TOKEN = token;
      tokenInput.value = "";
      showTokenState();
      setMsg(tokenMsg, MSG.keySaved, "ok");
    }).catch(function (e) { setMsg(tokenMsg, e.message || String(e), "err"); }).then(function () { saveTokenBtn.disabled = false; });
  }
  function forgetToken() {
    writeTokenBlob(null);
    TOKEN = null;
    showTokenState();
    setMsg(tokenMsg, MSG.keyForgotten, "ok");
  }

  /* ---------- wiring ---------- */
  if (!C || !R || !loginForm) return;
  populateCategory();
  fCat.value = "gold";
  populateForCategory("gold");
  fCat.addEventListener("change", function () { populateForCategory(fCat.value); });
  loginForm.addEventListener("submit", tryLogin);
  logoutBtn.addEventListener("click", logout);
  addForm.addEventListener("submit", onAddSubmit);
  cancelEditBtn.addEventListener("click", function () { resetForm(); setMsg(addMsg, "", ""); });
  saveTokenBtn.addEventListener("click", saveToken);
  if (forgetTokenBtn) forgetTokenBtn.addEventListener("click", forgetToken);
  tokenInput.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); saveToken(); } });
  fPhotos.addEventListener("change", function () {
    var files = Array.prototype.slice.call(fPhotos.files || []);
    files.forEach(function (f) {
      if (photoItems.length >= MAX_PHOTOS) { setMsg(addMsg, MSG.photoMax, "err"); return; }
      photoItems.push({ kind: "new", file: f, url: URL.createObjectURL(f) });
    });
    fPhotos.value = "";
    renderPhotos();
  });
  photoList.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-photo]") : null;
    if (!btn) return;
    var i = parseInt(btn.getAttribute("data-photo"), 10), act = btn.getAttribute("data-act");
    if (!(i >= 0 && i < photoItems.length)) return;
    if (act === "remove") { var it = photoItems.splice(i, 1)[0]; if (it.kind === "new") { try { URL.revokeObjectURL(it.url); } catch (err) { /* ignore */ } } }
    else if (act === "cover") { var mv = photoItems.splice(i, 1)[0]; photoItems.unshift(mv); }
    renderPhotos();
  });
  itemList.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("[data-act]") : null;
    if (!btn) return;
    var id = btn.getAttribute("data-id"), act = btn.getAttribute("data-act");
    if (act === "edit") startEdit(id);
    else if (act === "stock") toggleStock(id);
    else if (act === "remove") removeItem(id);
  });
  var filterWrap = document.querySelector(".admin-filter");
  if (filterWrap) {
    filterWrap.addEventListener("click", function (e) {
      var chip = e.target.closest ? e.target.closest("[data-filter]") : null;
      if (!chip) return;
      listFilter = chip.getAttribute("data-filter");
      filterWrap.querySelectorAll("[data-filter]").forEach(function (c) {
        var on = c === chip;
        c.classList.toggle("active", on);
        c.setAttribute("aria-pressed", on ? "true" : "false");
      });
      renderList();
    });
  }
  if (listSearch) {
    var onListSearch = function () { listQuery = listSearch.value.trim(); renderList(); };
    listSearch.addEventListener("input", onListSearch);
    listSearch.addEventListener("search", onListSearch);
  }
  if (!hasCrypto) setMsg(loginMsg, MSG.noCrypto, "err");
  loginUser.focus();

  /* exposed for the smoke test only (no secrets here: the hash is public by design) */
  window.DIORO_ADMIN_TEST = { loginHash: hasCrypto ? loginHash : null };
})();
