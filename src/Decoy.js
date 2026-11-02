// The screen anyone sees when they open the app: looks like Apple's FaceTime app. Everything on it
// really works: New FaceTime, the recent calls and the (i) card call through Apple's FaceTime,
// Messages and Mail, like the real app. The real app is behind it: hold the big title for 1 second.
import { useEffect, useMemo, useState } from "react";
import {
  Alert, Keyboard, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SymbolView } from "expo-symbols";

// The title at the top (the app's name under the icon is set in app.json).
const APP = "FaceTime";

const WORDS = {
  en: {
    edit: "Edit", done: "Done", link: "Create Link", newFt: "New FaceTime", audio: APP + " Audio",
    yesterday: "Yesterday", cancel: "Cancel", to: "To:", ok: "OK", today: "Today",
    message: "message", call: "call", video: "video", mail: "mail", mobile: "mobile", email: "email",
    incoming: "Incoming Call", missed: "Missed Call",
    mins: (n) => (n === 1 ? "1 minute" : n + " minutes"), secs: (n) => (n === 1 ? "1 second" : n + " seconds"),
    noLink: "Couldn\u2019t Create Link", noLinkMsg: "Check your internet connection and try again.",
    days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
  fr: {
    edit: "Modifier", done: "OK", link: "Cr\u00e9er un lien", newFt: "Nouveau FaceTime", audio: APP + " audio",
    yesterday: "Hier", cancel: "Annuler", to: "\u00c0\u00a0:", ok: "OK", today: "Aujourd\u2019hui",
    message: "message", call: "appeler", video: "vid\u00e9o", mail: "e-mail", mobile: "portable", email: "e-mail",
    incoming: "Appel entrant", missed: "Appel manqu\u00e9",
    mins: (n) => n + (n === 1 ? " minute" : " minutes"), secs: (n) => n + (n === 1 ? " seconde" : " secondes"),
    noLink: "Impossible de cr\u00e9er le lien", noLinkMsg: "V\u00e9rifiez votre connexion Internet, puis r\u00e9essayez.",
    days: ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"],
  },
  ar: {
    edit: "\u062a\u0639\u062f\u064a\u0644", done: "\u062a\u0645", link: "\u0625\u0646\u0634\u0627\u0621 \u0631\u0627\u0628\u0637",
    newFt: "FaceTime \u062c\u062f\u064a\u062f", audio: APP + " \u0635\u0648\u062a\u064a",
    yesterday: "\u0623\u0645\u0633", cancel: "\u0625\u0644\u063a\u0627\u0621", to: "\u0625\u0644\u0649:", ok: "\u062d\u0633\u0646\u064b\u0627",
    today: "\u0627\u0644\u064a\u0648\u0645",
    message: "\u0631\u0633\u0627\u0644\u0629", call: "\u0627\u062a\u0635\u0627\u0644", video: "\u0641\u064a\u062f\u064a\u0648",
    mail: "\u0628\u0631\u064a\u062f", mobile: "\u0627\u0644\u062c\u0648\u0627\u0644",
    email: "\u0627\u0644\u0628\u0631\u064a\u062f \u0627\u0644\u0625\u0644\u0643\u062a\u0631\u0648\u0646\u064a",
    incoming: "\u0645\u0643\u0627\u0644\u0645\u0629 \u0648\u0627\u0631\u062f\u0629", missed: "\u0645\u0643\u0627\u0644\u0645\u0629 \u0641\u0627\u0626\u062a\u0629",
    mins: (n) => (n === 1 ? "\u062f\u0642\u064a\u0642\u0629 \u0648\u0627\u062d\u062f\u0629" : n === 2 ? "\u062f\u0642\u064a\u0642\u062a\u0627\u0646" : n <= 10 ? n + " \u062f\u0642\u0627\u0626\u0642" : n + " \u062f\u0642\u064a\u0642\u0629"),
    secs: (n) => (n === 1 ? "\u062b\u0627\u0646\u064a\u0629 \u0648\u0627\u062d\u062f\u0629" : n === 2 ? "\u062b\u0627\u0646\u064a\u062a\u0627\u0646" : n <= 10 ? n + " \u062b\u0648\u0627\u0646\u064d" : n + " \u062b\u0627\u0646\u064a\u0629"),
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
    ? { bg: "#000000", text: "#FFFFFF", sub: "#8E8E93", sep: "#38383A", gray: "#1C1C1E", green: "#30D158", red: "#FF453A", sheet: "#1C1C1E", raised: "#3A3A3C", off: "#2C2C2E", page: "#1C1C1E", group: "#2C2C2E", avTop: [142, 142, 148], avBot: [99, 99, 104] }
    : { bg: "#FFFFFF", text: "#000000", sub: "#8A8A8E", sep: "#C6C6C8", gray: "#EEEEF0", green: "#34C759", red: "#FF3B30", sheet: "#FFFFFF", raised: "#E9E9EB", off: "#F2F2F7", page: "#F2F2F7", group: "#FFFFFF", avTop: [166, 171, 183], avBot: [133, 138, 149] };
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

function clockText(at, lang, h24) {
  const d = new Date(at);
  if (isNaN(d.getTime())) return "";
  if (h24) return d.getHours() + ":" + pad(d.getMinutes());
  const h = d.getHours() % 12 || 12;
  return h + ":" + pad(d.getMinutes()) + (lang === "ar" ? (d.getHours() < 12 ? " \u0635" : " \u0645") : d.getHours() < 12 ? " AM" : " PM");
}

function dayText(at, w, lang) {
  const d = new Date(at);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const day0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= day0) return w.today;
  if (t >= day0 - 86400000) return w.yesterday;
  if (t >= day0 - 6 * 86400000) return w.days[d.getDay()];
  if (lang === "en") return d.getMonth() + 1 + "/" + d.getDate() + "/" + String(d.getFullYear()).slice(2);
  return pad(d.getDate()) + "/" + pad(d.getMonth() + 1) + "/" + d.getFullYear();
}

function durText(sec, w) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  if (!sec) return "";
  return sec < 60 ? w.secs(sec) : w.mins(Math.floor(sec / 60));
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

function Avatar({ name, c, size }) {
  const d = size || 45;
  const ini = initials(name);
  const n = Math.max(15, Math.round(d / 3));
  const stripes = useMemo(() => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const col = c.avTop.map((v, j) => Math.round(v + (c.avBot[j] - v) * k));
      out.push("rgb(" + col.join(",") + ")");
    }
    return out;
  }, [c, n]);
  return (
    <View style={[s.avatar, { width: d, height: d, borderRadius: d / 2 }]}>
      {stripes.map((col, i) => <View key={i} style={{ height: d / n + 0.5, backgroundColor: col }} />)}
      <View style={s.avatarIn}>
        {ini ? (
          <Text style={[s.avatarTxt, { fontSize: Math.round(d * 0.42) }]} allowFontScaling={false}>{ini}</Text>
        ) : (
          <Icon name="person.fill" size={Math.round(d * 0.53)} color="#FFFFFF" />
        )}
      </View>
    </View>
  );
}

function openURL(u) {
  Linking.openURL(u).catch(() => {});
}

// The (i) card: the person, the usual buttons (they really work, like in FaceTime) and their calls.
function Details({ item, list, onClose, c, w, lang, h24, rtl }) {
  const insets = useSafeAreaInsets();
  const x = item || {};
  const name = x.name || x.handle || "";
  const h = okHandle(x.handle);
  const mail = h.indexOf("@") > 0;
  const row = rtl ? "row-reverse" : "row";
  const align = rtl ? "right" : "left";
  const calls = (list || []).filter((y) => (x.handle ? y.handle === x.handle : !y.handle && y.name === x.name)).slice(0, 20);
  const days = [];
  calls.forEach((y) => {
    const d = dayText(y.at, w, lang);
    const last = days[days.length - 1];
    if (last && last.day === d) last.items.push(y);
    else days.push({ day: d, items: [y] });
  });
  const later = (fn) => () => {
    onClose();
    setTimeout(fn, 450);
  };
  const tiles = [
    { icon: "message.fill", label: w.message, on: !!h, go: () => openURL("sms:" + h) },
    { icon: "phone.fill", label: w.call, on: !!h, go: () => (mail ? openFaceTime(h, false) : openURL("tel:" + h)) },
    { icon: "video.fill", label: w.video, on: !!h, go: () => openFaceTime(h, true) },
    { icon: "envelope.fill", label: w.mail, on: mail, go: () => openURL("mailto:" + h) },
  ];
  return (
    <Modal visible={!!item} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} onDismiss={onClose}>
      <View style={[s.sheet, { backgroundColor: c.page }]}>
        <View style={[s.cardHead, { flexDirection: row }]}>
          <View style={{ flex: 1 }} />
          <Pressable onPress={onClose} hitSlop={12}>
            {({ pressed }) => <Text style={[s.navTxt, { color: c.green, fontWeight: "600", opacity: pressed ? 0.4 : 1 }]}>{w.done}</Text>}
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
          <View style={s.cardTop}>
            <Avatar name={name} c={c} size={100} />
            <Text style={[s.cardName, { color: c.text }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.6}>{name}</Text>
          </View>
          <View style={[s.tiles, { flexDirection: row }]}>
            {tiles.map((t) => (
              <Pressable
                key={t.icon}
                disabled={!t.on}
                onPress={later(t.go)}
                style={({ pressed }) => [s.tile, { backgroundColor: c.group, opacity: pressed ? 0.6 : 1 }]}
              >
                <Icon name={t.icon} size={20} color={t.on ? c.green : c.sub} />
                <Text style={[s.tileTxt, { color: t.on ? c.green : c.sub }]} numberOfLines={1}>{t.label}</Text>
              </Pressable>
            ))}
          </View>
          {days.length > 0 && (
            <View style={[s.group, { backgroundColor: c.group }]}>
              {days.map((d, i) => (
                <View key={d.day + i} style={[s.dayBlock, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.sep }]}>
                  <Text style={[s.dayTxt, { color: c.text, textAlign: align }]}>{d.day}</Text>
                  {d.items.map((y, j) => (
                    <View key={String(y.at) + ":" + j} style={[s.callLine, { flexDirection: row }]}>
                      <Text style={[s.callTime, { color: c.text, textAlign: align }]} numberOfLines={1}>{clockText(y.at, lang, h24)}</Text>
                      <Text style={[s.callType, { color: c.text, textAlign: align }]} numberOfLines={1}>{y.missed ? w.missed : w.incoming}</Text>
                      <Text style={[s.callDur, { color: c.sub, textAlign: rtl ? "left" : "right" }]} numberOfLines={1}>{y.missed ? "" : durText(y.dur, w)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          )}
          {!!h && (
            <Pressable
              onPress={later(() => (mail ? openFaceTime(h, false) : openURL("tel:" + h)))}
              style={({ pressed }) => [s.group, s.fieldRow, { flexDirection: row, backgroundColor: pressed ? c.raised : c.group }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={[s.fieldLbl, { color: c.text, textAlign: align }]}>{mail ? w.email : w.mobile}</Text>
                <Text style={[s.fieldVal, { color: c.green, textAlign: align }]} numberOfLines={1}>{x.handle}</Text>
              </View>
            </Pressable>
          )}
          {!!h && (
            <View style={[s.group, s.fieldRow, { flexDirection: row, backgroundColor: c.group }]}>
              <Text style={[s.fieldLbl, { flex: 1, color: c.text, textAlign: align, marginTop: 0 }]}>FaceTime</Text>
              <Pressable hitSlop={10} onPress={later(() => openFaceTime(h, false))} style={{ marginHorizontal: 10 }}>
                <Icon name="phone.fill" size={20} color={c.green} />
              </Pressable>
              <Pressable hitSlop={10} onPress={later(() => openFaceTime(h, true))} style={{ marginHorizontal: 10 }}>
                <Icon name="video.fill" size={20} color={c.green} />
              </Pressable>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
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
  const [details, setDetails] = useState(null);
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
                  <Pressable hitSlop={10} onPress={() => setDetails(x)} style={{ [rtl ? "marginRight" : "marginLeft"]: 12 }}>
                    {({ pressed }) => <View style={{ opacity: pressed ? 0.4 : 1 }}><Icon name="info.circle" size={22} color={c.green} /></View>}
                  </Pressable>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <NewFaceTime visible={sheet} onClose={() => setSheet(false)} c={c} w={w} rtl={rtl} />
      <Details item={details} list={list} onClose={() => setDetails(null)} c={c} w={w} lang={lang} h24={h24} rtl={rtl} />
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
  cardHead: { height: 52, alignItems: "center", paddingHorizontal: 18 },
  cardTop: { alignItems: "center", paddingHorizontal: 20, marginTop: 4 },
  cardName: { fontSize: 30, fontWeight: "600", letterSpacing: 0.3, marginTop: 12, textAlign: "center" },
  tiles: { paddingHorizontal: 16, gap: 8, marginTop: 18 },
  tile: { flex: 1, height: 58, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 4 },
  tileTxt: { fontSize: 12, letterSpacing: -0.1 },
  group: { marginHorizontal: 16, marginTop: 18, borderRadius: 12, overflow: "hidden" },
  dayBlock: { paddingHorizontal: 16, paddingVertical: 11 },
  dayTxt: { fontSize: 15, fontWeight: "600", letterSpacing: -0.24, marginBottom: 6 },
  callLine: { alignItems: "center", paddingVertical: 2, gap: 10 },
  callTime: { width: 78, fontSize: 15, letterSpacing: -0.24 },
  callType: { flex: 1, fontSize: 15, letterSpacing: -0.24 },
  callDur: { fontSize: 15, letterSpacing: -0.24 },
  fieldRow: { paddingHorizontal: 16, paddingVertical: 11, alignItems: "center" },
  fieldLbl: { fontSize: 15, letterSpacing: -0.24 },
  fieldVal: { fontSize: 17, letterSpacing: -0.41, marginTop: 2 },
});
