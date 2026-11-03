// Builds the page the app shows: the call page (same file as the website) plus small scripts that run first.
// That script puts the saved data back into the page, and sends every change to the app,
// which keeps the real copy on the phone (a web view's storage alone can be wiped by the system).
const SHIM = `(function(){
  var S = window.__SEED || {rev:0, data:{}}, RN = window.ReactNativeWebView, real = null;
  try{ real = window.localStorage; real.setItem("__t", "1"); real.removeItem("__t"); }catch(e){ real = null; }
  var pend = {set:{}, del:{}}, timer = null;
  function send(){ timer = null; var m = {type:"store", set:pend.set, del:Object.keys(pend.del), rev:rev}; pend = {set:{}, del:{}};
    try{ if(RN) RN.postMessage(JSON.stringify(m)); }catch(e){} }
  function queue(k, v){ if(k === "r.__rev") return; if(v === null){ delete pend.set[k]; pend.del[k] = 1; } else { pend.set[k] = v; delete pend.del[k]; } if(!timer) timer = setTimeout(send, 60); }
  window.__flushStore = function(){ if(timer){ clearTimeout(timer); send(); } };
  var rev = S.rev || 0;
  if(real){
    var P = Storage.prototype, oSet = P.setItem, oRem = P.removeItem, oClr = P.clear, oGet = P.getItem, oKey = P.key;
    var localRev = +(oGet.call(real, "r.__rev") || 0), keys = [], i;
    for(i = 0; i < real.length; i++) keys.push(oKey.call(real, i));
    if(localRev > rev){   /* the page saved something the app never got: keep it and send it over */
      rev = localRev; keys.forEach(function(k){ if(k) queue(k, oGet.call(real, k)); });
    } else {
      keys.forEach(function(k){ try{ oRem.call(real, k); }catch(e){} });
      Object.keys(S.data).forEach(function(k){ try{ oSet.call(real, k, S.data[k]); }catch(e){} });
      try{ oSet.call(real, "r.__rev", String(rev)); }catch(e){}
    }
    function bump(){ rev++; try{ oSet.call(real, "r.__rev", String(rev)); }catch(e){} }
    P.setItem = function(k, v){ oSet.call(this, k, v); if(this === real && String(k) !== "r.__rev"){ bump(); queue(String(k), String(v)); } };
    P.removeItem = function(k){ oRem.call(this, k); if(this === real){ bump(); queue(String(k), null); } };
    P.clear = function(){ var ks = [], j; for(j = 0; j < this.length; j++) ks.push(oKey.call(this, j)); oClr.call(this); if(this === real){ bump(); ks.forEach(function(k){ queue(k, null); }); } };
  } else {   /* storage blocked: keep everything in memory and in the app */
    var mem = {}; Object.keys(S.data).forEach(function(k){ mem[k] = S.data[k]; });
    var st = {
      getItem:function(k){ k = String(k); return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem:function(k, v){ k = String(k); mem[k] = String(v); rev++; queue(k, mem[k]); },
      removeItem:function(k){ k = String(k); delete mem[k]; rev++; queue(k, null); },
      clear:function(){ Object.keys(mem).forEach(function(k){ queue(k, null); }); mem = {}; rev++; },
      key:function(n){ return Object.keys(mem)[n] || null; }
    };
    Object.defineProperty(st, "length", {get:function(){ return Object.keys(mem).length; }});
    try{ Object.defineProperty(window, "localStorage", {value:st, configurable:true}); }catch(e){}
  }
})();`;

function safe(json) {
  return json.replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

// html: the page. store: saved data. extraCss: optional. pre: optional script that runs before the page's own.
export function buildPage(html, store, extraCss, pre) {
  const seed = "window.__SEED=" + safe(JSON.stringify({ rev: store.rev || 0, data: store.data || {} })) + ";";
  const head =
    "<script>" + seed + SHIM + "</script>" +
    (pre ? "<script>" + pre + "</script>" : "") +
    (extraCss ? "<style>" + extraCss + "</style>" : "");
  html = html.replace(/<link rel="manifest"[^>]*>/g, ""); // nothing to fetch from the internet
  const i = html.indexOf("<head>");
  return i < 0 ? head + html : html.slice(0, i + 6) + head + html.slice(i + 6);
}

// For values put inside scripts (page code or injectJavaScript).
export function jsArg(v) {
  return safe(JSON.stringify(v === undefined ? null : v));
}
