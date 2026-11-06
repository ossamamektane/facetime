// The app's own call screen, shown while one of the app's calls is going on: after you answer with
// the iPhone unlocked, or when you tap the call in the Dynamic Island / green bar. It looks like the
// iPhone's own call screen, and the buttons really work (speaker, mute, keypad tones, end).
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

const WORDS = {
  en: {
    speaker: "Speaker", facetime: "FaceTime", mute: "Mute", more: "More", end: "End", keypad: "Keypad",
    hide: "Hide", ended: "Call Ended", add: "Add People", card: "Contact Card", rec: "Call Recording",
    recSub: "Record and Save For Later",
  },
  fr: {
    speaker: "Haut-parleur", facetime: "FaceTime", mute: "Silence", more: "Plus", end: "Fin", keypad: "Clavier",
    hide: "Masquer", ended: "Appel termin\u00e9", add: "Ajouter des personnes", card: "Fiche de contact",
    rec: "Enregistrement d\u2019appel", recSub: "Enregistrer pour plus tard",
  },
  ar: {
    speaker: "\u0645\u0643\u0628\u0631 \u0627\u0644\u0635\u0648\u062a", facetime: "FaceTime", mute: "\u0643\u062a\u0645",
    more: "\u0627\u0644\u0645\u0632\u064a\u062f", end: "\u0625\u0646\u0647\u0627\u0621",
    keypad: "\u0644\u0648\u062d\u0629 \u0627\u0644\u0645\u0641\u0627\u062a\u064a\u062d", hide: "\u0625\u062e\u0641\u0627\u0621",
    ended: "\u0627\u0646\u062a\u0647\u062a \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629",
    add: "\u0625\u0636\u0627\u0641\u0629 \u0623\u0634\u062e\u0627\u0635", card: "\u0628\u0637\u0627\u0642\u0629 \u062c\u0647\u0629 \u0627\u0644\u0627\u062a\u0635\u0627\u0644",
    rec: "\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u0645\u0643\u0627\u0644\u0645\u0629",
    recSub: "\u0633\u062c\u0651\u0644 \u0648\u0627\u062d\u0641\u0638 \u0644\u0648\u0642\u062a \u0644\u0627\u062d\u0642",
  },
};

const KEYS = [
  ["1", ""], ["2", "ABC"], ["3", "DEF"],
  ["4", "GHI"], ["5", "JKL"], ["6", "MNO"],
  ["7", "PQRS"], ["8", "TUV"], ["9", "WXYZ"],
  ["*", ""], ["0", "+"], ["#", ""],
];

const BG = "#262626";
const GRAY = "#9C9CA2";
const BUB = "#555555";
const RED = "#EB4034";

function pad(n) { return (n < 10 ? "0" : "") + n; }

function clock(sec) {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? h + ":" + pad(m) + ":" + pad(s) : pad(m) + ":" + pad(s);
}

function Icon({ name, size, color }) {
  return <SymbolView name={name} size={size} tintColor={color} type="monochrome" style={{ width: size + 4, height: size + 4 }} />;
}

function Ctl({ icon, label, on, dim, red, disabled, onPress, size }) {
  const d = size || 78;
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[st.ctl, { width: d + 16 }]} hitSlop={4}>
      {({ pressed }) => {
        let bg = red ? RED : on ? "#FFFFFF" : BUB;
        if (pressed && !dim) bg = red ? "#F2665C" : on ? "#D6D6D6" : "#7A7A7A";
        const tint = on ? "#1C1C1E" : dim ? "#A8A8AD" : "#FFFFFF";
        return (
          <>
            <View style={[st.bub, { width: d, height: d, borderRadius: d / 2, backgroundColor: bg }]}>
              <Icon name={icon} size={red ? 36 : 30} color={tint} />
            </View>
            {label ? <Text style={st.lab} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text> : null}
          </>
        );
      }}
    </Pressable>
  );
}

function Key({ k, sub, onPress, disabled }) {
  return (
    <Pressable onPress={() => onPress(k)} disabled={disabled} hitSlop={3}>
      {({ pressed }) => (
        <View style={[st.key, { backgroundColor: pressed ? "rgba(255,255,255,0.38)" : "rgba(255,255,255,0.16)" }]}>
          <Text style={[st.keyTxt, k === "*" && st.star]} allowFontScaling={false}>{k}</Text>
          {sub ? <Text style={st.keySub} allowFontScaling={false}>{sub}</Text> : null}
        </View>
      )}
    </Pressable>
  );
}

function MoreRow({ color, icon, children, title, sub, onPress }) {
  return (
    <Pressable onPress={onPress}>
      {({ pressed }) => (
        <View style={[st.msRow, pressed && { backgroundColor: "rgba(255,255,255,0.06)" }]}>
          <View style={[st.msIcon, { backgroundColor: color }]}>{children || <Icon name={icon} size={26} color="#FFFFFF" />}</View>
          <View style={{ flex: 1 }}>
            <Text style={st.msText} numberOfLines={1}>{title}</Text>
            {sub ? <Text style={st.msSub} numberOfLines={1}>{sub}</Text> : null}
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function InCall({ call, ended, lang, onEnd, onSpeaker, onMute, onDigit, onClosed }) {
  const insets = useSafeAreaInsets();
  const w = WORDS[lang] || WORDS.en;
  const rtl = lang === "ar";
  const row = rtl ? "row-reverse" : "row";
  const [now, setNow] = useState(Date.now());
  const [keys, setKeys] = useState(false);
  const [more, setMore] = useState(false);
  const [typed, setTyped] = useState("");
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [fade]);

  useEffect(() => {
    if (ended) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [ended]);

  // "Call Ended" stays a moment, then the screen goes away (like the iPhone's)
  useEffect(() => {
    if (!ended) return undefined;
    setMore(false);
    setKeys(false);
    const t = setTimeout(() => {
      Animated.timing(fade, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => onClosed && onClosed());
    }, 1150);
    return () => clearTimeout(t);
  }, [ended, fade, onClosed]);

  const name = (call && (call.name || call.handle)) || "";
  const at = call && call.answeredAt ? Number(call.answeredAt) : 0;
  const status = ended ? w.ended : at ? clock((now - at) / 1000) : "00:00";
  const dimHead = more || ended;
  const press = (k) => {
    setTyped((s) => (s + k).slice(-24));
    if (onDigit) onDigit(k);
  };

  return (
    <Animated.View style={[StyleSheet.absoluteFill, st.root, { opacity: fade }]}>
      <View style={[st.head, { paddingTop: insets.top + 58 }]}>
        {keys && typed ? (
          <Text style={st.typed} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5}>{typed}</Text>
        ) : (
          <>
            <Text style={[st.status, dimHead && { color: "#6E6E73" }]} allowFontScaling={false}>{status}</Text>
            <Text style={[st.name, dimHead && { color: ended ? "#8C8C92" : "#6E6E73" }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>{name}</Text>
          </>
        )}
      </View>
      <View style={{ flex: 1 }} />

      {keys ? (
        <View style={[st.bottom, { paddingBottom: insets.bottom + 22 }]}>
          <View style={st.keys}>
            {KEYS.map(([k, sub]) => <Key key={k} k={k} sub={sub} onPress={press} disabled={ended} />)}
          </View>
          <View style={[st.kbar, { flexDirection: row }]}>
            <View style={{ flex: 1 }} />
            <Ctl icon="phone.down.fill" red onPress={onEnd} disabled={ended} size={76} />
            <View style={{ flex: 1, alignItems: "center" }}>
              <Pressable onPress={() => setKeys(false)} hitSlop={12} disabled={ended}>
                {({ pressed }) => <Text style={[st.hide, pressed && { opacity: 0.5 }]}>{w.hide}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <View style={[st.bottom, { paddingBottom: insets.bottom + 26, opacity: more ? 0 : ended ? 0.45 : 1 }]} pointerEvents={more || ended ? "none" : "auto"}>
          <View style={[st.gridRow, { flexDirection: row }]}>
            <Ctl icon="speaker.wave.2.fill" label={w.speaker} on={!!(call && call.speaker)} onPress={onSpeaker} />
            <Ctl icon="video.fill" label={w.facetime} dim />
            <Ctl icon="mic.slash.fill" label={w.mute} on={!!(call && call.muted)} onPress={onMute} />
          </View>
          <View style={[st.gridRow, { flexDirection: row, marginTop: 25 }]}>
            <Ctl icon="ellipsis" label={w.more} onPress={() => setMore(true)} />
            <Ctl icon="phone.down.fill" label={w.end} red onPress={onEnd} />
            <Ctl icon="circle.grid.3x3.fill" label={w.keypad} onPress={() => { setTyped(""); setKeys(true); }} />
          </View>
        </View>
      )}

      {more && (
        <>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMore(false)} />
          <View style={[st.sheet, { bottom: insets.bottom + 20 }]}>
            <MoreRow color="#1EB0F0" icon="person.fill.badge.plus" title={w.add} onPress={() => setMore(false)} />
            <MoreRow color="#3A3350" icon="person.fill" title={w.card} onPress={() => setMore(false)} />
            <View style={st.msSep} />
            <MoreRow color="#FFFFFF" title={w.rec} sub={w.recSub} onPress={() => setMore(false)}>
              <View style={st.recDot} />
            </MoreRow>
          </View>
        </>
      )}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  root: { backgroundColor: BG, zIndex: 50 },
  head: { alignItems: "center", paddingHorizontal: 22 },
  status: { fontSize: 23, color: GRAY, lineHeight: 27, fontVariant: ["tabular-nums"] },
  name: { fontSize: 34, fontWeight: "700", color: "#FFFFFF", letterSpacing: -0.6, marginTop: 6, lineHeight: 38, textAlign: "center" },
  typed: { fontSize: 38, color: "#FFFFFF", letterSpacing: 1, marginTop: 14, fontVariant: ["tabular-nums"] },
  bottom: { alignItems: "center" },
  gridRow: { justifyContent: "center", gap: 23 },
  ctl: { alignItems: "center" },
  bub: { alignItems: "center", justifyContent: "center" },
  lab: { color: "#FFFFFF", fontSize: 17, marginTop: 9, letterSpacing: -0.4 },
  keys: { width: 76 * 3 + 34 * 2, flexDirection: "row", flexWrap: "wrap", columnGap: 34, rowGap: 14 },
  key: { width: 76, height: 76, borderRadius: 38, alignItems: "center", justifyContent: "center" },
  keyTxt: { color: "#FFFFFF", fontSize: 33, lineHeight: 36 },
  star: { fontSize: 40, lineHeight: 44, marginTop: 10 },
  keySub: { color: "#FFFFFF", fontSize: 10, fontWeight: "600", letterSpacing: 1.7, marginTop: -1 },
  kbar: { width: "100%", alignItems: "center", marginTop: 24 },
  hide: { color: "#FFFFFF", fontSize: 17 },
  sheet: {
    position: "absolute", left: 14, right: 14, backgroundColor: "#202022", borderRadius: 30, paddingVertical: 8,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
    shadowColor: "#000", shadowOpacity: 0.5, shadowRadius: 25, shadowOffset: { width: 0, height: 18 },
  },
  msRow: { flexDirection: "row", alignItems: "center", gap: 20, paddingVertical: 13, paddingHorizontal: 24 },
  msIcon: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  msText: { color: "#FFFFFF", fontSize: 20, fontWeight: "600" },
  msSub: { color: "#8E8E93", fontSize: 17, marginTop: 2 },
  msSep: { height: StyleSheet.hairlineWidth, backgroundColor: "rgba(255,255,255,0.2)", marginVertical: 6, marginLeft: 96, marginRight: 24 },
  recDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#FF3B30" },
});
