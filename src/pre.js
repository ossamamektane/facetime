// A small script that runs inside the page before the page's own code, only in the app.
// - tells the page it is inside the iPhone app (window.__NATIVE), so "Start call" goes to iOS itself
// - the ringtone is the iPhone's own ringtone, so the page never asks for one
// - the built-in sounds (hang-up) come from inside the app, never from the internet
import { jsArg } from "./shim";

export function preScript(sounds, sig) {
  return (
    "window.__SND=" + jsArg(sounds || {}) + ";window.__SND_SIG=" + jsArg(String(sig || "")) + ";" +
    `(function () {
  window.__NATIVE = { ios: true };
  var BASE = "";
  try { BASE = new URL("./", location.href).href; } catch (e) {}
  var SOUNDS = BASE + "sounds/";

  /* the ringtone is your iPhone's own ringtone */
  try {
    var K = "ph.cfg.v2", c = JSON.parse(localStorage.getItem(K) || "{}");
    if (c.ringFile !== "native") {
      c.ringFile = "native";
      c.ringName = "iPhone ringtone";
      c.ring = true;
      localStorage.setItem(K, JSON.stringify(c));
    }
  } catch (e) {}

  /* a new app version may carry a different hang-up sound: forget the old saved copy */
  try {
    if (localStorage.getItem("fc.sndsig") !== window.__SND_SIG && window.indexedDB) {
      var rq = indexedDB.open("ph.offline.audio", 1);
      rq.onupgradeneeded = function () { try { rq.result.createObjectStore("audio"); } catch (e) {} };
      rq.onsuccess = function () {
        try {
          var db = rq.result, tx = db.transaction("audio", "readwrite"), st = tx.objectStore("audio");
          st.delete(SOUNDS + "hangup.mp3");
          st.delete(SOUNDS + "ringtone.mp3");
          tx.oncomplete = function () {
            try { localStorage.setItem("fc.sndsig", window.__SND_SIG); } catch (e) {}
            try { db.close(); } catch (e) {}
          };
        } catch (e) {}
      };
    }
  } catch (e) {}

  /* built-in sounds are inside the app */
  var realFetch = window.fetch;
  if (realFetch && BASE) {
    window.fetch = function (input) {
      try {
        var u = typeof input === "string" ? input : (input && input.url) || String(input || "");
        var abs = new URL(u, location.href).href;
        if (abs.indexOf(SOUNDS) === 0) {
          var name = decodeURIComponent(abs.slice(SOUNDS.length).split(/[?#]/)[0]);
          var src = window.__SND[name] || "";
          if (!src && /^hangup\\./i.test(name)) {
            var e = window.endSnd;
            src = e && /^data:/.test(e.src || "") ? e.src : "";
          }
          if (src) return realFetch.call(window, src);
          return Promise.resolve(new Response("", { status: 404, statusText: "Not Found" }));
        }
      } catch (err) {}
      return realFetch.apply(this, arguments);
    };
  }
})();`
  );
}
