// The app's own native part (modules/fake-call): hands calls to iOS (CallKit), so they ring on the
// real iPhone call screen even when the phone is locked or the app is in the background.
import * as Expo from "expo";

function load() {
  try {
    if (typeof Expo.requireOptionalNativeModule === "function") {
      const m = Expo.requireOptionalNativeModule("FakeCall");
      if (m) return m;
    }
  } catch (e) {}
  try {
    const g = globalThis.expo;
    if (g && g.modules && g.modules.FakeCall) return g.modules.FakeCall;
  } catch (e) {}
  return null;
}

const FakeCall = load();
export default FakeCall;

// Call events from iOS: scheduled / ringing / answered / ended / missed / failed
export function onCallEvent(fn) {
  if (!FakeCall) return () => {};
  let sub = null;
  try {
    if (typeof FakeCall.addListener === "function") sub = FakeCall.addListener("onCallEvent", fn);
    else if (typeof Expo.EventEmitter === "function") sub = new Expo.EventEmitter(FakeCall).addListener("onCallEvent", fn);
  } catch (e) {}
  return () => {
    try { if (sub && sub.remove) sub.remove(); } catch (e) {}
  };
}
