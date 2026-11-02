// The screen anyone sees when they open the app: looks like Apple's FaceTime app, titled with the
// app's own name (APP). Everything on it really works (New FaceTime and the recent calls call through
// Apple's FaceTime). The real app is behind it: hold the big title for 1 second.
import { useEffect, useMemo, useState } from "react";
import {
  Alert, Keyboard, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

// Must match "name" in app.json. The call screen shows it too: "Mobile Audio".
const APP = "Mobile";

const WORDS = {
  en: {
    edit: "Edit", done: "Done", link: "Create Link", newFt: "New FaceTime", audio: APP + " Audio",
    yesterday: "Yesterday", cancel: "Cancel", to: "To:", ok: "OK",
    noLink: "Couldn\u2019t Create Link", noLinkMsg: "Check your internet connection and try again.",
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
  fr: {
    edit: "Modifier", done: "OK", link: "Cr\u00e9er un lien", newFt: "Nouveau FaceTime", audio: APP + " audio",
    yesterday: "Hier", cancel: "Annuler", to: "\u00c0\u00a0:", ok: "OK",
    noLink: "Impossible de cr\u00e9er le lien", noLinkMsg: "V\u00e9rifiez votre connexion Internet, puis r\u00e9essayez.",
    days: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  },
  ar: {
    edit: "\u062a\u0639\u062f\u064a\u0644", done: "\u062a\u0645", link: "\u0625\u0646\u0634\u0627\u0621 \u0631\u0627\u0628\u0637",
    newFt: "FaceTime \u062c\u062f\u064a\u062f", audio: APP + " \u0635\u0648\u062a\u064a",
    yesterday: "\u0623\u0645\u0633", cancel: "\u0625\u0644\u063a\u0627\u0621", to: "\u0625\u0644\u0649:", ok: "\u062d\u0633\u0646\u064b\u0627",
    noLink: "\u062a\u0639\u0630\u0631 \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0631\u0627\u0628\u0637",
    noLinkMsg: "\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u062a\u0635\u0627\u0644\u0643 \u0628\u0627\u0644\u0625\u0646\u062a\u0631\u0646\u062a \u0648\u062d\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062e\u0631\u0649.",
    days: [
      "\u0627\u0644\u0623\u062d\u062f", "\u0627\u0644\u0627\u062b\u0646\u064a\u0646", "\u0627\u0644\u062b\u0644\u0627\u062b\u0627\u0621",
      "\u0627\u0644\u0623\u0631\u0628\u0639\u0627\u0621", "\u0627\u0644\u062e\u0645\u064a\u0633", "\u0627\u0644\u062c\u0645\u0639\u0629",
      "\u0627\u0644\u0633\u0628\u062a",
    ],
  },
};

function palette(dark) {
  return dark
    ? { bg: "#000000", text: "#FFFFFF", sub: "#8E8E93", sep: "#38383A", gray: "#1C1C1E", green: "#30D158", red: "#FF453A", sheet: "#1C1C1E", raised: "#3A3A3C", off: "#2C2C2E", avTop: [142, 142, 148], avBot: [99, 99, 104] }
    : { bg: "#FFFFFF", text: "#000000", sub: "#8A8A8E", sep: "#C6C6C8", gray: "#EEEEF0", green: "#34C759", red: "#FF3B30", sheet: "#FFFFFF", raised: "#E9E9EB", off: "#F2F2F7", avTop: [166, 171, 183], avBot: [133, 138, 149] };
}

function pad(n) { return (n < 10 ? "0" : "") + n; }

function timeText(at, w, lang, h24) {
  const d = new Date(at);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= day0) {
    if (h24) return d.getHours() + ":" + pad(d.getMinutes());
    const h = d.getHours() % 12 || 12;
    return h + ":" + pad(d.getMinutes()) + (lang === "ar" ? (d.getHours() < 12 ? " \u0635" : " \u0645") : d.getHours() < 12 ? " AM" : " PM");
  }
  if (t >= day0 - 86400000) return w.yesterday;
  if (t >= day0 - 6 * 86400000) return w.days[d.getDay()];
  if (lang === "en") return d.getMonth() + 1 + "/" + d.getDate() + "/" + String(d.getFullYear()).slice(2);
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  const pick = (s) => (s && /^[A-Za-z\u00C0-\u024F]/.test(s) ? s[0].toUpperCase() : "");
  if (!parts.length) return "";
  const a = pick(parts[0]);
  const b = parts.length > 1 ? pick(parts[parts.length - 1]) : "";
  return a && (parts.length === 1 || b) ? a + b : "";
}

function okHandle(s) {
  s = String(s || "").trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return s;
  const digits = s.replace(/[^\d+]/g, "");
  return digits.replace(/\+/g, "").length >= 3 ? digits : "";
}

function openFaceTime(handle, video) {
  const h = okHandle(handle);
  if (!h) return;
  Linking.openURL((video ? "facetime://" : "facetime-audio://") + encodeURIComponent(h).replace(/%2B/g, "+").replace(/%40/g, "@")).catch(() => {});
}

function Icon({ name, size, color, weight }) {
  return <SymbolView name={name} size={size} tintColor={color} weight={weight || "regular"} type="monochrome" style={{ width: size, height: size }} />;
}

function Avatar({ name, c }) {
  const ini = initials(name);
  const stripes = useMemo(() => {
    const n = 15, out = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const col = c.avTop.map((v, j) => Math.round(v + (c.avBot[j] - v) * k));
      out.push("rgb(" + col.join(",") + ")");
    }
    return out;
  }, [c]);
  return (
    <View style={s.avatar}>
      {stripes.map((col, i) => <View key={i} style={{ height: 3, backgroundColor: col }} />)}
      <View style={s.avatarIn}>
        {ini ? <Text style={s.avatarTxt} allowFontScaling={false}>{ini}</Text> : <Icon name="person.fill" size={24} color="#FFFFFF" />}
      </View>
    </View>
  );
}

function NewFaceTime({ visible, onClose, c, w, rtl }) {
  const insets = useSafeAreaInsets();
  const [to, setTo] = useState("");
  const [kb, setKb] = useState(0);
  useEffect(() => {
    const a = Keyboard.addListener("keyboardWillShow", (e) => setKb((e && e.endCoordinates && e.endCoordinates.height) || 0));
    const b = Keyboard.addListener("keyboardWillHide", () => setKb(0));
    return () => { a.remove(); b.remove(); };
  }, []);
  useEffect(() => { if (!visible) setTo(""); }, [visible]);
  const h = okHandle(to);
  const row = rtl ? "row-reverse" : "row";
  const go = (video) => {
    if (!h) return;
    Keyboard.dismiss();
    onClose();
    setTimeout(() => openFaceTime(h, video), 450);
  };
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={onClose}>
      <View style={[s.sheet, { backgroundColor: c.sheet, paddingBottom: (kb ? kb : insets.bottom) + 10 }]}>
        <View style={[s.sheetHead, { flexDirection: row }]}>
          <Pressable onPress={onClose} hitSlop={10} style={s.sheetSide}>
            {({ pressed }) => <Text style={[s.navTxt, { color: c.green, opacity: pressed ? 0.4 : 1, textAlign: rtl ? "right" : "left" }]}>{w.cancel}</Text>}
          </Pressable>
          <Text style={[s.sheetTitle, { color: c.text }]} numberOfLines={1}>{w.newFt}</Text>
          <View style={s.sheetSide} />
        </View>
        <View style={[s.toRow, { flexDirection: row, borderBottomColor: c.sep }]}>
          <Text style={[s.toLbl, { color: c.sub }]}>{w.to}</Text>
          <TextInput
            value={to}
            onChangeText={setTo}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            keyboardType="email-address"
            textContentType="none"
            selectionColor={c.green}
            style={[s.toInput, { color: c.text, textAlign: rtl ? "right" : "left" }]}
            returnKeyType="done"
            onSubmitEditing={() => go(true)}
          />
          <Pressable hitSlop={10}>
            <Icon name="plus.circle" size={22} color={c.green} />
          </Pressable>
        </View>
        <View style={{ flex: 1 }} />
        <View style={[s.sheetBtns, { flexDirection: row }]}>
          <Pressable onPress={() => go(false)} disabled={!h} style={({ pressed }) => [s.audioBtn, { backgroundColor: h ? c.raised : c.off, opacity: pressed ? 0.6 : 1 }]}>
            <Icon name="phone.fill" size={22} color={h ? c.green : c.sub} />
          </Pressable>
          <Pressable onPress={() => go(true)} disabled={!h} style={({ pressed }) => [s.ftBtn, { flexDirection: row, backgroundColor: h ? c.green : c.off, opacity: pressed ? 0.7 : 1 }]}>
            <Icon name="video.fill" size={20} color={h ? "#FFFFFF" : c.sub} />
            <Text style={[s.ftTxt, { color: h ? "#FFFFFF" : c.sub }]}>FaceTime</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export default function Decoy({ info, dark, onUnlock, onDelete }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const c = palette(dark);
  const lang = info && WORDS[info.lang] ? info.lang : "en";
  const w = WORDS[lang];
  const rtl = lang === "ar";
  const row = rtl ? "row-reverse" : "row";
  const side = width >= 414 ? 20 : 16;
  const h24 = info ? info.h24 !== false : true;
  const list = (info && Array.isArray(info.history) ? info.history : []).filter((x) => x && (x.name || x.handle));
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState(false);
  useEffect(() => { if (!list.length) setEditing(false); }, [list.length]);

  const link = () => Alert.alert(w.noLink, w.noLinkMsg, [{ text: w.ok }]);

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg }]}>
      <View style={[s.nav, { marginTop: insets.top, paddingHorizontal: side, flexDirection: row }]}>
        <Pressable onPress={() => setEditing((e) => !e)} hitSlop={12}>
          {({ pressed }) => (
            <Text style={[s.navTxt, { color: c.green, opacity: pressed ? 0.4 : 1 }, editing && { fontWeight: "600" }]}>{editing ? w.done : w.edit}</Text>
          )}
        </Pressable>
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: side, flexDirection: row }}>
          <Pressable onLongPress={onUnlock} delayLongPress={1000} accessibilityRole="header">
            <Text style={[s.title, { color: c.text }]} allowFontScaling={false}>{APP}</Text>
          </Pressable>
        </View>
        <View style={[s.btnRow, { paddingHorizontal: side, flexDirection: row }]}>
          <Pressable onPress={link} style={({ pressed }) => [s.bigBtn, { flexDirection: row, backgroundColor: c.gray, opacity: pressed ? 0.6 : 1 }]}>
            <Icon name="link" size={18} color={c.green} weight="semibold" />
            <Text style={[s.bigTxt, { color: c.green }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{w.link}</Text>
          </Pressable>
          <View style={{ width: 12 }} />
          <Pressable onPress={() => setSheet(true)} style={({ pressed }) => [s.bigBtn, { flexDirection: row, backgroundColor: c.green, opacity: pressed ? 0.75 : 1 }]}>
            <Icon name="video.fill" size={18} color="#FFFFFF" weight="semibold" />
            <Text style={[s.bigTxt, { color: "#FFFFFF" }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{w.newFt}</Text>
          </Pressable>
        </View>
        <View style={{ height: 22 }} />
        {list.map((x, i) => {
          const name = x.name || x.handle;
          const last = i === list.length - 1;
          return (
            <Pressable
              key={String(x.at) + ":" + i}
              onPress={() => (editing ? null : openFaceTime(x.handle, false))}
              style={({ pressed }) => [s.rowWrap, { flexDirection: row, backgroundColor: pressed && !editing ? c.gray : "transparent" }]}
            >
              {editing && (
                <Pressable onPress={() => onDelete && onDelete(x.at)} hitSlop={8} style={{ [rtl ? "marginRight" : "marginLeft"]: side, justifyContent: "center" }}>
                  <Icon name="minus.circle.fill" size={22} color={c.red} />
                </Pressable>
              )}
              <View style={{ [rtl ? "marginRight" : "marginLeft"]: editing ? 12 : side, paddingVertical: 11 }}>
                <Avatar name={name} c={c} />
              </View>
              <View style={[s.rowBody, { flexDirection: row, borderBottomColor: last ? "transparent" : c.sep, [rtl ? "paddingLeft" : "paddingRight"]: side, [rtl ? "marginRight" : "marginLeft"]: 12 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.name, { color: x.missed ? c.red : c.text, textAlign: rtl ? "right" : "left" }]} numberOfLines={1}>{name}</Text>
                  <View style={[s.subRow, { flexDirection: row }]}>
                    <Icon name="phone.fill" size={12} color={c.sub} />
                    <Text style={[s.sub, { color: c.sub, [rtl ? "marginRight" : "marginLeft"]: 5 }]} numberOfLines={1}>{w.audio}</Text>
                  </View>
                </View>
                <Text style={[s.when, { color: c.sub }]} numberOfLines={1}>{timeText(x.at, w, lang, h24)}</Text>
                {!editing && (
                  <Pressable hitSlop={10} style={{ [rtl ? "marginRight" : "marginLeft"]: 12 }}>
                    <Icon name="info.circle" size={22} color={c.green} />
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <NewFaceTime visible={sheet} onClose={() => setSheet(false)} c={c} w={w} rtl={rtl} />
    </View>
  );
}

const s = StyleSheet.create({
  nav: { height: 44, alignItems: "center" },
  navTxt: { fontSize: 17, letterSpacing: -0.41 },
  title: { fontSize: 34, fontWeight: "700", letterSpacing: 0.37, lineHeight: 41, marginTop: 2 },
  btnRow: { marginTop: 14 },
  bigBtn: { flex: 1, height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10 },
  bigTxt: { flexShrink: 1, fontSize: 17, fontWeight: "600", letterSpacing: -0.41 },
  rowWrap: { alignItems: "stretch" },
  avatar: { width: 45, height: 45, borderRadius: 22.5, overflow: "hidden" },
  avatarIn: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  avatarTxt: { color: "#FFFFFF", fontSize: 19, fontWeight: "600", letterSpacing: 0.3 },
  rowBody: { flex: 1, alignItems: "center", borderBottomWidth: StyleSheet.hairlineWidth },
  name: { fontSize: 17, fontWeight: "600", letterSpacing: -0.41 },
  subRow: { alignItems: "center", marginTop: 2 },
  sub: { fontSize: 15, letterSpacing: -0.24 },
  when: { fontSize: 15, letterSpacing: -0.24, marginLeft: 8 },
  sheet: { flex: 1 },
  sheetHead: { height: 56, alignItems: "center", paddingHorizontal: 16 },
  sheetSide: { width: 90 },
  sheetTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "600", letterSpacing: -0.41 },
  toRow: { alignItems: "center", marginLeft: 16, paddingRight: 16, height: 46, borderBottomWidth: StyleSheet.hairlineWidth },
  toLbl: { fontSize: 17, letterSpacing: -0.41, marginHorizontal: 4 },
  toInput: { flex: 1, fontSize: 17, height: 46, marginHorizontal: 6, letterSpacing: -0.41 },
  sheetBtns: { paddingHorizontal: 16, alignItems: "center", gap: 12 },
  audioBtn: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  ftBtn: { flex: 1, height: 50, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 8 },
  ftTxt: { fontSize: 17, fontWeight: "600", letterSpacing: -0.41 },
});
