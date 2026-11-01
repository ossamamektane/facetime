// The phone app. Opening it shows a FaceTime look-alike (src/Decoy.js). Hold the big "FaceTime"
// title for 1 second to get to the real app: the same page as the website (bundled inside, works
// offline). "Start call" is handed to iOS itself (modules/fake-call), so the call rings on the real
// iPhone call screen with your own ringtone, even locked, in your pocket or with the app closed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Keyboard, Linking, StyleSheet, View, useColorScheme } from "react-native";
import { WebView } from "react-native-webview";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";

import HTML from "./src/web";
import SOUNDS, { SIG } from "./src/sounds";
import { buildPage, jsArg } from "./src/shim";
import { preScript } from "./src/pre";
import { applyChange, flushStore, getStore, loadStore } from "./src/store";
import FakeCall, { onCallEvent } from "./src/fakecall";
import Decoy from "./src/Decoy";

SplashScreen.preventAutoHideAsync().catch(() => {});

const BASE = "https://app.calls.invalid/"; // ".invalid" never exists on the internet: nothing is ever loaded from it
const PRE = preScript(SOUNDS, SIG);

// sound files are saved under a name like "s1a2b3c4-123456.mp3" (fingerprint + size)
function sizeOf(key) {
  const m = /^s[0-9a-f]+-(\d+)\./.exec(String(key || ""));
  return m ? Number(m[1]) : 0;
}

export default function App() {
  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const dark = useColorScheme() === "dark";
  const web = useRef(null);
  const ready = useRef(false);
  const outbox = useRef([]); // messages waiting for the page to be ready
  const quietUntil = useRef(0); // while iPhone shows a permission prompt, don't lock
  const splashDone = useRef(false);

  const [loaded, setLoaded] = useState(false);
  const [page, setPage] = useState(0); // bump = rebuild + reload the page
  const [locked, setLockedState] = useState(true);
  const [info, setInfo] = useState(null); // from iOS: planned call, quick call, recent calls, language

  const hideSplash = useCallback(() => {
    if (splashDone.current) return;
    splashDone.current = true;
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  /* ---------- start ---------- */
  useEffect(() => {
    let done = false;
    const failSafe = setTimeout(hideSplash, 1200);
    loadStore()
      .catch(() => {})
      .then(() => { if (!done) setLoaded(true); });
    return () => { done = true; clearTimeout(failSafe); };
  }, [hideSplash]);

  const source = useMemo(
    () => (loaded ? { html: buildPage(HTML, getStore(), "", PRE), baseUrl: BASE } : null),
    // rebuilt only when the page is (re)loaded on purpose, never while you use it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, page]
  );

  /* ---------- talking to the page ---------- */
  const send = useCallback((js) => {
    const code = `try{${js}}catch(e){}true;`;
    if (ready.current && web.current) web.current.injectJavaScript(code);
    else {
      outbox.current.push(code);
      if (outbox.current.length > 40) outbox.current.shift();
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!FakeCall) return null;
    try {
      const st = await FakeCall.status();
      if (st) {
        setInfo(st);
        send(`window.__fc&&__fc.status(${jsArg(st)})`);
      }
      return st || null;
    } catch (e) {
      return null;
    }
  }, [send]);

  useEffect(() => {
    refresh().then(() => setTimeout(hideSplash, 60));
  }, [refresh, hideSplash]);

  const setLocked = useCallback((v) => {
    setLockedState(v);
    if (v) {
      Keyboard.dismiss();
      if (web.current) web.current.injectJavaScript("try{document.activeElement&&document.activeElement.blur&&document.activeElement.blur()}catch(e){}true;");
    }
  }, []);

  const flush = useCallback(() => {
    if (web.current) web.current.injectJavaScript("try{window.__flushStore&&__flushStore()}catch(e){}true;");
    setTimeout(flushStore, 150);
    flushStore();
  }, []);

  const reload = useCallback(() => {
    ready.current = false;
    outbox.current = [];
    flushStore();
    setPage((n) => n + 1);
  }, []);

  /* ---------- calls: events from iOS ---------- */
  useEffect(
    () =>
      onCallEvent((e) => {
        if (!e || !e.type) return;
        if (e.type === "ringing") setLocked(true); // after the call, the app opens on FaceTime
        send(`window.__fc&&__fc.event(${jsArg(e)})`);
        if (e.type !== "scheduled" && e.type !== "ringing" && e.type !== "answered") refresh();
      }),
    [send, refresh, setLocked]
  );

  /* ---------- the app goes to the background / comes back ---------- */
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        refresh();
        return;
      }
      // leaving the app (home, app switcher, lock button): back to the FaceTime cover
      if (s === "background" || Date.now() >= quietUntil.current) setLocked(true);
      flush();
    });
    return () => sub.remove();
  }, [refresh, setLocked, flush]);

  /* ---------- requests from the page ---------- */
  const reply = (id, r) => {
    if (id) send(`window.__fc&&__fc.reply(${jsArg(Object.assign({}, r || {}, { id }))})`);
  };

  const askPermissions = async () => {
    quietUntil.current = Date.now() + 60000;
    try { await FakeCall.requestPermissions(); } catch (e) {}
    quietUntil.current = Date.now() + 800;
  };

  const fc = async (m) => {
    const id = m.id || 0;
    if (!FakeCall) {
      reply(id, { error: "no native part" });
      return;
    }
    try {
      switch (m.op) {
        case "status": {
          const st = await refresh();
          reply(id, st || {});
          break;
        }
        case "have": { // which sound files does the app still need?
          const keys = Array.isArray(m.keys) ? m.keys.map(String) : [];
          const missing = keys.filter((k) => {
            let have = -1;
            try { have = Number(FakeCall.fileSize(k)); } catch (e) {}
            const want = sizeOf(k);
            return !(have > 0) || (want > 0 && have !== want);
          });
          reply(id, { missing });
          break;
        }
        case "chunk": {
          const ok = await FakeCall.writeChunk(String(m.key || ""), String(m.data || ""), !!m.append, !!m.last);
          reply(id, { ok: !!ok });
          break;
        }
        case "call":
        case "quick": {
          await askPermissions();
          const opts = {
            name: String(m.name || ""),
            handle: String(m.handle || ""),
            delay: Math.max(0, Number(m.delay) || 0),
            cid: String(m.cid || ""),
            voice: m.voice ? String(m.voice) : "",
            hangup: m.hangup ? String(m.hangup) : "",
          };
          const r = m.op === "call" ? await FakeCall.schedule(opts) : await FakeCall.saveQuick(opts);
          reply(id, r || {});
          refresh();
          break;
        }
        case "cancel": {
          const ok = await FakeCall.cancel();
          reply(id, { ok: !!ok });
          refresh();
          break;
        }
        default:
          reply(id, { error: "unknown" });
      }
    } catch (e) {
      reply(id, { error: String((e && e.message) || e || "error") });
    }
  };

  const onMessage = (e) => {
    let m;
    try { m = JSON.parse(e.nativeEvent.data); } catch (err) { return; }
    if (!m || typeof m.type !== "string") return;
    if (m.type === "store") applyChange(m);
    else if (m.type === "fc") fc(m);
    else if (m.type === "ready") {
      ready.current = true;
      const q = outbox.current;
      outbox.current = [];
      q.forEach((code) => web.current && web.current.injectJavaScript(code));
      refresh();
    }
  };

  const unlock = useCallback(() => {
    setLockedState(false);
    send("window.__fc&&__fc.resync&&__fc.resync()");
  }, [send]);

  const deleteRecent = useCallback(async (at) => {
    try { if (FakeCall && FakeCall.deleteHistory) await FakeCall.deleteHistory(Number(at) || 0); } catch (e) {}
    refresh();
  }, [refresh]);

  const pageBg = dark ? "#000000" : "#F2F2F7";
  return (
    <View style={[styles.root, { backgroundColor: dark ? "#000000" : "#FFFFFF" }]}>
      <StatusBar style={dark ? "light" : "dark"} />
      <View
        style={styles.root}
        pointerEvents={locked ? "none" : "auto"}
        accessibilityElementsHidden={locked}
        importantForAccessibility={locked ? "no-hide-descendants" : "auto"}
      >
        {source && (
          <WebView
            key={page}
            ref={web}
            source={source}
            originWhitelist={["*"]}
            onMessage={onMessage}
            onLoadStart={() => { ready.current = false; }}
            onShouldStartLoadWithRequest={(req) => {
              const u = req.url || "";
              if (u.startsWith(BASE) || u.startsWith("about:") || u.startsWith("data:") || u.startsWith("blob:")) return true;
              Linking.openURL(u).catch(() => {});
              return false;
            }}
            onContentProcessDidTerminate={reload}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            style={{ flex: 1, backgroundColor: pageBg }}
            containerStyle={{ backgroundColor: pageBg }}
            contentInsetAdjustmentBehavior="never"
            automaticallyAdjustContentInsets={false}
            bounces={false}
            keyboardDisplayRequiresUserAction={false}
            hideKeyboardAccessoryView={false}
            allowsBackForwardNavigationGestures={false}
            allowsLinkPreview={false}
            dataDetectorTypes="none"
            pullToRefreshEnabled={false}
            setSupportMultipleWindows={false}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            allowFileAccess={false}
            cacheEnabled={false}
            webviewDebuggingEnabled={__DEV__}
          />
        )}
      </View>
      {locked && <Decoy info={info} dark={dark} onUnlock={unlock} onDelete={deleteRecent} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
