/* Synchronisation téléphone <-> ordinateur via Supabase.
 *
 * Fonctionnement : ce fichier intercepte les écritures localStorage des trois
 * outils. Aucune modification de leur logique n'est nécessaire.
 *   - une écriture locale marque l'appareil "modifié" et déclenche un envoi différé
 *   - au chargement et toutes les 30 s, on regarde si l'autre appareil a envoyé du neuf
 *   - si les deux côtés ont changé, on demande quoi garder au lieu de choisir tout seul
 *
 * Sans configuration valide (config.js), tout le site fonctionne comme avant,
 * hors ligne, sur chaque appareil séparément.
 */
(function () {
  "use strict";

  var KEYS = ["swops.stock.v2", "swops.roadmap.v1", "swops.strategie.v1"];
  var K_CODE = "swops.sync.code";
  var K_AT = "swops.sync.at";
  var K_DIRTY = "swops.sync.dirty";

  var cfg = window.SWOPS_SUPABASE || {};

  /* Garde-fou : la clé "service_role" contourne toutes les protections de la
     base. Ce fichier étant public, l'y mettre exposerait la base entière.
     On refuse de démarrer plutôt que de laisser passer l'erreur. */
  function isServiceRole(k) {
    try {
      var p = String(k).split(".");
      if (p.length !== 3) return false;                       // pas un JWT
      var b = p[1].replace(/-/g, "+").replace(/_/g, "/");
      while (b.length % 4) b += "=";
      return JSON.parse(atob(b)).role === "service_role";
    } catch (e) { return false; }
  }

  var dangerous = isServiceRole(cfg.key);
  var configured = !!(cfg.url && cfg.key && !dangerous &&
    cfg.url.indexOf("TON-PROJET") < 0 && cfg.key.indexOf("TA-CLE-ANON") < 0);

  if (dangerous && window.console) {
    console.error("[sync] Clé service_role détectée dans config.js. Synchro désactivée. " +
      "Utilise la clé anon/public, et révoque cette clé dans Supabase.");
  }

  var applying = false;      // vrai pendant qu'on écrit des données distantes
  var busy = false;          // une requête est en cours
  var pushTimer = null;
  var lastSyncMs = 0;
  var els = {};

  /* ---------------- accès localStorage (tolérant aux erreurs) -------------- */
  var origSet = localStorage.setItem.bind(localStorage);
  var origDel = localStorage.removeItem.bind(localStorage);

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function put(k, v) { try { origSet(k, v); } catch (e) {} }
  function drop(k) { try { origDel(k); } catch (e) {} }

  function code() { return get(K_CODE) || ""; }
  function syncedAt() { return get(K_AT) || ""; }

  function hasLocalData() {
    for (var i = 0; i < KEYS.length; i++) {
      var v = get(KEYS[i]);
      if (v && v !== "[]" && v !== "{}") return true;
    }
    return false;
  }

  /* Modifié = drapeau posé, ou données locales jamais synchronisées.
     Le second cas protège les données saisies avant l'activation de la synchro. */
  function isDirty() {
    if (get(K_DIRTY) === "1") return true;
    return !syncedAt() && hasLocalData();
  }
  function markDirty() { put(K_DIRTY, "1"); }
  function clearDirty() { drop(K_DIRTY); }

  function snapshot() {
    var o = {};
    for (var i = 0; i < KEYS.length; i++) {
      var v = get(KEYS[i]);
      if (v !== null) o[KEYS[i]] = v;
    }
    return o;
  }

  function applySnapshot(o) {
    applying = true;
    try {
      for (var i = 0; i < KEYS.length; i++) {
        var k = KEYS[i];
        if (o && typeof o[k] === "string") put(k, o[k]);
        else drop(k);
      }
    } finally { applying = false; }
  }

  /* ---------------- appels Supabase ---------------- */
  function rpc(fn, body) {
    var base = String(cfg.url).replace(/\/+$/, "");
    return fetch(base + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": cfg.key,
        "Authorization": "Bearer " + cfg.key
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) {
        return r.text().then(function (t) {
          throw new Error("HTTP " + r.status + " " + t.slice(0, 200));
        });
      }
      return r.json();
    });
  }

  function remoteRead() {
    return rpc("pull_state", { p_code: code() }).then(function (rows) {
      if (!rows || !rows.length) return null;
      return rows[0];
    });
  }

  /* ---------------- opérations ---------------- */
  function push(silent) {
    if (!ready() || busy) return Promise.resolve();
    busy = true;
    status("envoi…", "work");
    return rpc("push_state", { p_code: code(), p_data: snapshot() })
      .then(function (ts) {
        put(K_AT, String(ts).replace(/"/g, ""));
        clearDirty();
        lastSyncMs = Date.now();
        status("à jour", "ok");
      })
      .catch(function (e) {
        if (!silent) status("échec de l'envoi", "err");
        else status("hors ligne", "err");
        if (window.console) console.warn("[sync] push", e);
      })
      .then(function () { busy = false; });
  }

  function pull() {
    if (!ready() || busy) return Promise.resolve();
    busy = true;
    status("réception…", "work");
    return remoteRead()
      .then(function (row) {
        if (!row) {
          // rien à distance : cet appareil devient la référence
          busy = false;
          if (hasLocalData()) return push(true);
          status("prêt", "ok");
          return;
        }
        var remoteAt = String(row.updated_at);
        if (remoteAt === syncedAt()) {
          lastSyncMs = Date.now();
          status(isDirty() ? "modifications locales" : "à jour", isDirty() ? "work" : "ok");
          busy = false;
          return;
        }
        if (isDirty()) {
          busy = false;
          conflict(row);            // les deux côtés ont bougé : on demande
          return;
        }
        applySnapshot(row.data);
        put(K_AT, remoteAt);
        clearDirty();
        busy = false;
        status("mise à jour reçue", "ok");
        reload();
      })
      .catch(function (e) {
        status("hors ligne", "err");
        if (window.console) console.warn("[sync] pull", e);
        busy = false;
      });
  }

  function schedulePush() {
    if (!ready()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () { pushTimer = null; push(true); }, 1500);
  }

  function reload() { setTimeout(function () { location.reload(); }, 350); }

  function ready() { return configured && code().length >= 12; }

  /* ---------------- interception des écritures locales ---------------- */
  localStorage.setItem = function (k, v) {
    origSet(k, v);
    if (!applying && KEYS.indexOf(k) >= 0) { markDirty(); refresh(); schedulePush(); }
  };
  localStorage.removeItem = function (k) {
    origDel(k);
    if (!applying && KEYS.indexOf(k) >= 0) { markDirty(); refresh(); schedulePush(); }
  };

  /* ---------------- génération du code ---------------- */
  function newCode() {
    var alpha = "abcdefghjkmnpqrstuvwxyz23456789"; // sans caractères ambigus
    var n = 16, out = "", i;
    var buf = null;
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        buf = new Uint32Array(n);
        window.crypto.getRandomValues(buf);
      }
    } catch (e) { buf = null; }
    for (i = 0; i < n; i++) {
      var r = buf ? buf[i] : Math.floor(Math.random() * 0xffffffff);
      out += alpha.charAt(r % alpha.length);
      if (i === 3 || i === 7 || i === 11) out += "-";
    }
    return "tana-" + out; // 24 caractères, bien au-dessus du minimum de 12
  }

  /* ---------------- interface ---------------- */
  var CSS =
    '.swsync{border:1.5px solid var(--line2,rgba(27,23,20,.28));background:var(--card,#F4F0E7);' +
    'margin-bottom:14px;font-family:"Space Mono",monospace}' +
    '.swsync .hd{display:flex;align-items:center;gap:8px;padding:8px 11px;flex-wrap:wrap}' +
    '.swsync .dot{width:9px;height:9px;flex:none;border:1px solid var(--ink,#1B1714);background:transparent}' +
    '.swsync .dot.ok{background:var(--green,#2E7A4C);border-color:var(--green,#2E7A4C)}' +
    '.swsync .dot.err{background:var(--stamp,#D6371A);border-color:var(--stamp,#D6371A)}' +
    '.swsync .dot.work{background:var(--muted,#6E6658);border-color:var(--muted,#6E6658)}' +
    '.swsync .txt{flex:1;min-width:90px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;' +
    'color:var(--muted,#6E6658)}' +
    '.swsync .txt b{color:var(--ink,#1B1714);font-weight:700}' +
    '.swsync button{font-family:"Space Mono",monospace;font-size:10px;letter-spacing:.06em;' +
    'text-transform:uppercase;font-weight:700;border:1.5px solid var(--ink,#1B1714);background:none;' +
    'color:var(--ink,#1B1714);padding:5px 9px;cursor:pointer;border-radius:0}' +
    '.swsync button:hover{background:var(--ink,#1B1714);color:var(--card,#F4F0E7)}' +
    '.swsync .pan{border-top:1px solid var(--line,rgba(27,23,20,.14));padding:11px;display:none}' +
    '.swsync.open .pan{display:block}' +
    '.swsync .lbl{font-size:9.5px;letter-spacing:.1em;text-transform:uppercase;' +
    'color:var(--muted,#6E6658);margin-bottom:4px}' +
    '.swsync .code{font-size:14px;font-weight:700;word-break:break-all;' +
    'border:1.5px solid var(--ink,#1B1714);background:#fff;padding:8px 9px;margin-bottom:8px}' +
    '.swsync input{font-family:"Space Mono",monospace;font-size:13px;padding:7px 8px;width:100%;' +
    'border:1.5px solid var(--ink,#1B1714);background:#fff;border-radius:0;margin-bottom:8px;box-sizing:border-box}' +
    '.swsync .acts{display:flex;gap:6px;flex-wrap:wrap}' +
    '.swsync .note{font-size:10px;color:var(--muted,#6E6658);line-height:1.6;margin-top:9px;text-transform:none;' +
    'letter-spacing:0}' +
    '.swsync .cf{border-top:1px solid var(--line,rgba(27,23,20,.14));padding:11px;background:rgba(214,55,26,.08);' +
    'display:none}' +
    '.swsync.conflict .cf{display:block}' +
    '.swsync .cf p{font-size:11px;line-height:1.6;margin-bottom:9px;text-transform:none;letter-spacing:0;' +
    'color:var(--ink,#1B1714)}';

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function build() {
    var host = document.querySelector(".wrap");
    if (!host) return;

    var st = document.createElement("style");
    st.textContent = CSS;
    document.head.appendChild(st);

    var box = el("div", "swsync");
    box.innerHTML =
      '<div class="hd">' +
        '<span class="dot"></span>' +
        '<span class="txt">Synchro — <b class="s">…</b></span>' +
        '<button type="button" class="tg">Gérer</button>' +
      '</div>' +
      '<div class="pan">' +
        '<div class="lbl">Code de synchro de cet appareil</div>' +
        '<div class="code"></div>' +
        '<div class="acts">' +
          '<button type="button" class="cp">Copier</button>' +
          '<button type="button" class="up">Envoyer</button>' +
          '<button type="button" class="dl">Récupérer</button>' +
        '</div>' +
        '<div class="note">Sur ton autre appareil, ouvre cette page, clique Gérer, ' +
        'et colle ce code ci-dessous pour relier les deux.</div>' +
        '<div style="margin-top:11px">' +
          '<div class="lbl">Utiliser un code existant</div>' +
          '<input class="in" placeholder="tana-xxxx-xxxx-xxxx-xxxx" autocomplete="off" ' +
          'autocapitalize="off" spellcheck="false">' +
          '<div class="acts"><button type="button" class="lk">Relier cet appareil</button></div>' +
        '</div>' +
      '</div>' +
      '<div class="cf">' +
        '<p><b>Les deux appareils ont changé.</b> Impossible de deviner lequel garder — choisis, ' +
        'l\'autre version sera remplacée.</p>' +
        '<div class="acts">' +
          '<button type="button" class="kl">Garder cet appareil</button>' +
          '<button type="button" class="kr">Prendre l\'autre</button>' +
        '</div>' +
      '</div>';

    var nav = host.querySelector("nav.nav");
    if (nav && nav.nextSibling) host.insertBefore(box, nav.nextSibling);
    else if (nav) host.appendChild(box);
    else host.insertBefore(box, host.firstChild);

    els.box = box;
    els.dot = box.querySelector(".dot");
    els.s = box.querySelector(".s");
    els.code = box.querySelector(".code");
    els.in = box.querySelector(".in");

    box.querySelector(".tg").onclick = function () { box.classList.toggle("open"); };
    box.querySelector(".cp").onclick = function () { copy(code()); };
    box.querySelector(".up").onclick = function () { push(false); };
    box.querySelector(".dl").onclick = function () { forcePull(); };
    box.querySelector(".lk").onclick = function () { link(); };
    box.querySelector(".kl").onclick = function () {
      els.box.classList.remove("conflict"); push(false);
    };
    box.querySelector(".kr").onclick = function () {
      els.box.classList.remove("conflict");
      remoteRead().then(function (row) {
        if (!row) return;
        applySnapshot(row.data);
        put(K_AT, String(row.updated_at));
        clearDirty();
        reload();
      }).catch(function () { status("hors ligne", "err"); });
    };

    refresh();
  }

  function copy(t) {
    if (!t) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { status("code copié", "ok"); },
                                            function () { selectCode(); });
    } else selectCode();
  }
  function selectCode() {
    try {
      var r = document.createRange();
      r.selectNodeContents(els.code);
      var sel = window.getSelection();
      sel.removeAllRanges(); sel.addRange(r);
      status("copie le code sélectionné", "work");
    } catch (e) {}
  }

  function link() {
    var v = (els.in.value || "").trim().toLowerCase();
    if (v.length < 12) { status("code trop court", "err"); return; }
    if (isDirty() && hasLocalData() &&
        !window.confirm("Relier cet appareil au code " + v +
          " ?\n\nLes données de cet appareil seront remplacées par celles du code, si le code en contient.")) {
      return;
    }
    put(K_CODE, v);
    drop(K_AT);
    clearDirty();
    els.code.textContent = v;
    els.in.value = "";
    status("liaison…", "work");
    pull();
  }

  function forcePull() {
    // récupération explicite demandée par l'utilisateur : le distant fait foi
    if (!ready()) return;
    clearDirty();
    drop(K_AT);
    pull();
  }

  function conflict(row) {
    els.box.classList.add("conflict");
    els.box.classList.add("open");
    status("conflit à trancher", "err");
    if (window.console) console.warn("[sync] conflit, distant du " + row.updated_at);
  }

  function status(t, cls) {
    if (!els.s) return;
    els.s.textContent = t;
    els.dot.className = "dot" + (cls ? " " + cls : "");
  }

  function refresh() {
    if (!els.box) return;
    els.code.textContent = code() || "—";
    if (dangerous) { status("clé invalide — voir console", "err"); return; }
    if (!configured) {
      status("non configurée", "");
      return;
    }
    if (!ready()) { status("aucun code", ""); return; }
    if (els.box.classList.contains("conflict")) return;
    if (busy) return;
    if (isDirty()) { status("modifications locales", "work"); return; }
    if (lastSyncMs) status("à jour · " + ago(lastSyncMs), "ok");
    else status("prêt", "ok");
  }

  function ago(ms) {
    var s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return "il y a " + s + " s";
    if (s < 3600) return "il y a " + Math.round(s / 60) + " min";
    return "il y a " + Math.round(s / 3600) + " h";
  }

  /* ---------------- démarrage ---------------- */
  function start() {
    build();
    if (!configured) return;

    if (!code()) { put(K_CODE, newCode()); if (els.code) els.code.textContent = code(); }

    pull();
    setInterval(function () {
      if (document.hidden || busy) return;
      if (els.box && els.box.classList.contains("conflict")) return;
      if (isDirty()) { push(true); return; }
      pull();
    }, 30000);
    setInterval(refresh, 5000);

    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && !busy) { if (isDirty()) push(true); else pull(); }
    });

    window.addEventListener("pagehide", function () {
      if (!ready() || !isDirty()) return;
      try {
        fetch(String(cfg.url).replace(/\/+$/, "") + "/rest/v1/rpc/push_state", {
          method: "POST", keepalive: true,
          headers: {
            "Content-Type": "application/json",
            "apikey": cfg.key,
            "Authorization": "Bearer " + cfg.key
          },
          body: JSON.stringify({ p_code: code(), p_data: snapshot() })
        });
      } catch (e) {}
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else start();

  window.SWOPS_SYNC = { push: push, pull: pull, code: code, isDirty: isDirty, ready: ready };
})();
