(() => {
"use strict";

const $ = (id) => document.getElementById(id);
const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_IMAGES = 5;
const MAX_EDGE = 1800;
const HISTORY_MAX = 25;

// ---------- Speicher (nur auf diesem Gerät) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const settings = () => ({
  apiKey: store.get("apiKey", ""),
  model: store.get("model", "claude-sonnet-5")
});

// ---------- Texte ----------
const PHRASES = {
  vegetarisch: { jp: "私はベジタリアンです。肉と魚は食べられません。", de: "Ich bin Vegetarier:in. Ich esse kein Fleisch und keinen Fisch." },
  streng: { jp: "私はベジタリアンです。肉、魚、鰹節やだし（魚のスープ）も食べられません。昆布だしは大丈夫です。", de: "Ich bin Vegetarier:in. Kein Fleisch, kein Fisch, auch keine Bonito-Flocken oder Fisch-Dashi. Kombu-Dashi ist okay." },
  vegan: { jp: "私はヴィーガンです。肉、魚、だし、卵、乳製品は食べられません。", de: "Ich bin Veganer:in. Kein Fleisch, Fisch, Dashi, Ei oder Milchprodukte." }
};
const ASK_JP = "この料理に肉、魚、またはだし（鰹節）は入っていますか？";
const ASK_DE = "„Enthält dieses Gericht Fleisch, Fisch oder Dashi (Bonito)?“";
const LABEL = { veg: "Vegetarisch", ask: "Nachfragen", no: "Nicht vegetarisch" };
const VENUE_LABEL = { veg: "Gut geeignet. ", ask: "Eingeschränkt. ", no: "Schwierig. " };
const DIET_RULES = {
  vegetarisch: "Die Person isst vegetarisch: kein Fleisch, kein Fisch, keine Meeresfrüchte. Eier und Milchprodukte sind ok. Versteckte Fisch- oder Fleischbrühen und -saucen zählen als nicht vegetarisch; wenn ein Gericht so etwas nur wahrscheinlich enthält, markiere es als \"ask\".",
  streng: "Die Person isst streng vegetarisch: kein Fleisch, kein Fisch, keine Meeresfrüchte und keine versteckten tierischen Zutaten (Fisch- oder Fleischbrühe, Fischsauce, Garnelenpaste, Austernsauce, Sardellen, Schmalz, Gelatine). Eier und Milch sind ok. Reine Algen- oder Gemüsebrühe ist ok.",
  vegan: "Die Person isst vegan: keine tierischen Produkte, also auch kein Ei, keine Milchprodukte, kein Honig und keine versteckten tierischen Zutaten (Fisch- oder Fleischbrühe, Fischsauce, Garnelenpaste, Austernsauce, Sardellen, Schmalz, Gelatine, Ghee)."
};
const DIET_NAME_PROMPT = { vegetarisch: "vegetarisch (Ei und Milch ok)", streng: "streng vegetarisch (Ei und Milch ok, aber keine Fisch- oder Fleischbrühe)", vegan: "vegan" };

function buildPrompt(diet) {
  return `Du bist Experte für internationale Küche und hilfst Reisenden im Restaurant. Die Fotos zeigen eine Speisekarte in irgendeiner Sprache (oft Japanisch, aber auch Chinesisch, Koreanisch, Thai, Italienisch usw.), gedruckt oder handschriftlich auf einer Tafel. Mehrere Fotos sind Seiten derselben Karte.

Aufgabe: Erfasse jedes lesbare Gericht (erfinde keine). Übersetze es ins Deutsche und bewerte es für diese Ernährung:
${DIET_RULES[diet]}

Denke an die typischen versteckten Zutaten der jeweiligen Küche, zum Beispiel:
Japan: Dashi (Bonito) in Miso-Suppe, Udon, Soba, Nimono, Chawanmushi, Tempura-Dip, Mentsuyu, Agedashi; Katsuobushi-Topping; Schmalz oder Hühnerbrühe in Ramen, Gyoza, Chāhan.
China/Taiwan: Austernsauce, Schmalz, Hühnerbrühe, Hackfleisch in Gemüsegerichten (z. B. Mapo Tofu, Auberginen).
Korea: Sardellenbrühe in Suppen und Eintöpfen, Fischsauce und Garnelen im Kimchi.
Südostasien: Fischsauce, Garnelenpaste, getrocknete Garnelen.
Europa: Sardellen, Speck oder Fleischbrühe in Saucen, Suppen und Risotto, Gelatine in Desserts, Käse mit tierischem Lab (nur bei streng relevant als Hinweis).
Bei Kursmenüs (Kaiseki, Omakase, Degustation) ist jeder Gang ein Eintrag. Bei Sets (Teishoku, Bentō, Menü) nenne im Grund die üblichen Beilagen. Getränke nur aufnehmen, wenn sie für die Ernährung relevant sind.
status: "veg" = passt sicher, "ask" = passt wahrscheinlich oder unklar, beim Personal nachfragen, "no" = enthält eindeutig Ungeeignetes.
Wenn eine Stelle schwer lesbar ist, schreibe deine beste Lesung und vermerke die Unsicherheit im Grund.

Personal-Sprache: Bestimme die Sprache, in der man das Personal ansprechen sollte. Das ist meist die Landessprache, nicht unbedingt die Sprache der Karte (eine englische Touristenkarte in Japan heißt trotzdem Japanisch). Schreibe darin höflich und natürlich, so wie ein Muttersprachler es sagen würde.

AUSGABEFORMAT: Newline-delimited JSON. Jede Zeile ist genau ein JSON-Objekt. Kein anderer Text, keine Code-Blöcke.
Zeile 1:
{"type":"meta","restaurant":"Art des Lokals auf Deutsch (z. B. Izakaya, Ramen, Trattoria, Garküche)","language":"Sprache der Karte auf Deutsch","staff_language":"Sprache fürs Personal auf Deutsch, z. B. Japanisch","lang":"BCP-47-Code der Personal-Sprache, z. B. ja, zh-TW, ko, th, it","phrase_local":"1 bis 2 kurze höfliche Sätze in der Personal-Sprache: Ich esse ${DIET_NAME_PROMPT[diet]} und genau, was ich nicht essen kann, inklusive der landestypischen versteckten Zutaten","phrase_de":"deutsche Übersetzung von phrase_local","ask_local":"eine kurze höfliche Frage in der Personal-Sprache, ob dieses Gericht die für diese Ernährung kritischen Zutaten enthält (landestypisch konkret, z. B. Fischsauce)","ask_de":"deutsche Übersetzung von ask_local","venue":{"status":"veg|ask|no","text":"1 Satz: Kann man hier mit dieser Ernährung gut essen? Bei festen Kursmenüs Hinweis, die Ernährung schon bei der Reservierung anzugeben."},"summary":"1 bis 2 Sätze: was hier am besten passt oder was man bestellen könnte"}
Danach pro Gericht eine Zeile, zuerst alle "veg", dann "ask", dann "no":
{"type":"dish","jp":"Originalname wie auf der Karte","romaji":"Umschrift in lateinischer Schrift (leer, wenn die Karte schon lateinisch ist)","de":"deutscher Name","desc":"kurze Beschreibung, höchstens 12 Wörter","price":"Preis wie auf der Karte oder leer","status":"veg|ask|no","reason":"kurzer Grund, bei ask genau was zu klären ist","hidden":["versteckte Zutat im Original + Deutsch"]}
Wenn keine Speisekarte lesbar ist: nur die meta-Zeile, und in summary steht warum.`;
}

// ---------- Zustand ----------
let photos = [];          // [{blob, url}]
let current = null;       // {meta, dishes, ts, diet, model, sample?}
let filter = "all";
let ctl = null;

const diet = () => (document.querySelector('input[name="diet"]:checked') || {}).value || "vegetarisch";

// ---------- DOM-Helfer ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function setStatus(msg, kind) {
  const s = $("status");
  s.replaceChildren();
  s.className = "status" + (kind === "err" ? " err" : "");
  if (kind === "busy") s.append(el("span", "dot"));
  if (msg) s.append(document.createTextNode(msg));
}
function refreshSetup() {
  const has = !!settings().apiKey;
  $("setup").hidden = has;
  updateGo();
}
function updateGo() {
  $("go").disabled = !!ctl || !photos.length;
  $("go").textContent = settings().apiKey ? "Karte analysieren" : "Karte analysieren (Schlüssel fehlt)";
}

// ---------- Fotos ----------
function addFiles(list) {
  const imgs = Array.from(list || []).filter((f) => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
  for (const f of imgs) {
    if (photos.length >= MAX_IMAGES) { setStatus(`Höchstens ${MAX_IMAGES} Fotos pro Scan.`, "err"); break; }
    photos.push({ blob: f, url: URL.createObjectURL(f) });
  }
  renderThumbs();
}
function renderThumbs() {
  const t = $("thumbs");
  t.replaceChildren();
  photos.forEach((p, i) => {
    const w = el("div", "thumb");
    const im = new Image(); im.src = p.url; im.alt = `Seite ${i + 1}`;
    const x = el("button", null, "✕"); x.type = "button"; x.setAttribute("aria-label", `Seite ${i + 1} entfernen`);
    x.onclick = () => { URL.revokeObjectURL(p.url); photos.splice(i, 1); renderThumbs(); };
    w.append(im, x); t.append(w);
  });
  $("pickHint").textContent = photos.length
    ? `${photos.length} ${photos.length === 1 ? "Seite" : "Seiten"} bereit. Weitere Seiten einfach dazufotografieren.`
    : `Mehrere Seiten? Einfach nacheinander fotografieren, bis zu ${MAX_IMAGES}.`;
  updateGo();
}
$("camInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
$("libInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });

function loadImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Foto konnte nicht geöffnet werden.")); };
    img.src = url;
  });
}
async function toJpeg(blob, maxEdge, quality) {
  const img = await loadImage(blob);
  const w = img.naturalWidth, h = img.naturalHeight;
  const s = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  const g = c.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

// ---------- Claude-Anfrage (Streaming) ----------
async function scan() {
  const { apiKey, model } = settings();
  if (!apiKey) { openSettings(); return; }
  if (!photos.length) return;

  ctl = new AbortController();
  $("stop").hidden = false;
  updateGo();
  setStatus("Fotos werden vorbereitet …", "busy");

  const d = diet();
  current = { meta: null, dishes: [], ts: Date.now(), diet: d, model, streaming: true };
  filter = "all";
  render();

  let thumb = "";
  try {
    const images = [];
    for (const p of photos) images.push(await toJpeg(p.blob, MAX_EDGE, 0.85));
    thumb = await toJpeg(photos[0].blob, 160, 0.6).catch(() => "");

    const content = images.map((u) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: u.split(",")[1] } }));
    content.push({ type: "text", text: buildPrompt(d) });

    setStatus("Claude liest die Karte …", "busy");
    const res = await fetch(API_URL, {
      method: "POST",
      signal: ctl.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({ model, max_tokens: 8000, stream: true, messages: [{ role: "user", content }] })
    });

    if (!res.ok) throw await apiError(res);

    let buf = "", text = "", lineBuf = "", truncated = false;
    const reader = res.body.getReader();
    const dec = new TextDecoder();

    const eatLine = (line) => {
      line = line.trim().replace(/^```(json)?/, "").replace(/```$/, "").trim();
      if (!line.startsWith("{")) return;
      let obj; try { obj = JSON.parse(line); } catch { return; }
      if (obj.type === "meta") { current.meta = obj; render(); }
      else if (obj.type === "dish" || obj.jp || obj.de) { current.dishes.push(obj); appendDish(obj); updateHead(); }
      setStatus(`Claude liest die Karte … ${current.dishes.length} ${current.dishes.length === 1 ? "Gericht" : "Gerichte"} bisher`, "busy");
    };

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const evt = buf.slice(0, i); buf = buf.slice(i + 2);
        const dataLine = evt.split("\n").find((l) => l.startsWith("data:"));
        if (!dataLine) continue;
        let data; try { data = JSON.parse(dataLine.slice(5).trim()); } catch { continue; }
        if (data.type === "content_block_delta" && data.delta && data.delta.type === "text_delta") {
          text += data.delta.text;
          lineBuf += data.delta.text;
          let j;
          while ((j = lineBuf.indexOf("\n")) >= 0) { eatLine(lineBuf.slice(0, j)); lineBuf = lineBuf.slice(j + 1); }
        } else if (data.type === "message_delta" && data.delta && data.delta.stop_reason === "max_tokens") {
          truncated = true;
        } else if (data.type === "error") {
          throw friendly(data.error && data.error.type, data.error && data.error.message);
        }
      }
    }
    if (lineBuf.trim()) eatLine(lineBuf);

    if (!current.meta && !current.dishes.length) throw new Error("Claude hat keine auswertbare Antwort geliefert. Versuch es mit einem schärferen Foto noch einmal.");

    const order = { veg: 0, ask: 1, no: 2 };
    current.dishes.sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1));
    current.streaming = false;
    current.thumb = thumb;
    render();
    saveHistory(current);

    const n = current.dishes.length;
    setStatus(n
      ? `Fertig. ${n} ${n === 1 ? "Gericht" : "Gerichte"} erkannt.` + (truncated ? " Die Karte war sehr lang, einige Gerichte fehlen eventuell." : "")
      : (current.meta && current.meta.summary) || "Keine Gerichte erkannt.");
    // Fotos nach erfolgreichem Scan leeren, damit die nächste Karte frisch startet
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    renderThumbs();
  } catch (e) {
    if (e && e.name === "AbortError") {
      setStatus(current.dishes.length ? "Gestoppt. Die bisher erkannten Gerichte bleiben sichtbar." : "Gestoppt.");
    } else {
      setStatus((e && e.message) || "Etwas ist schiefgelaufen. Versuch es noch einmal.", "err");
    }
    if (current) { current.streaming = false; render(); }
  } finally {
    ctl = null;
    $("stop").hidden = true;
    updateGo();
  }
}

async function apiError(res) {
  let type = "", msg = "";
  try { const j = await res.json(); type = j.error && j.error.type; msg = j.error && j.error.message; } catch {}
  if (res.status === 401) return new Error("Der API-Schlüssel wird nicht akzeptiert. Prüfe ihn in den Einstellungen.");
  if (res.status === 403) return new Error("Der Schlüssel hat keine Berechtigung für dieses Modell. Wähle in den Einstellungen ein anderes.");
  if (res.status === 404) return new Error("Dieses Modell ist nicht verfügbar. Wähle in den Einstellungen ein anderes.");
  if (res.status === 413) return new Error("Die Fotos sind zu groß. Nimm weniger Seiten auf einmal.");
  if (res.status === 400 && /credit|balance/i.test(msg)) return new Error("Dein API-Guthaben ist aufgebraucht. Lade es auf console.anthropic.com auf.");
  return friendly(type, msg, res.status);
}
function friendly(type, msg, status) {
  if (type === "rate_limit_error" || status === 429) return new Error("Zu viele Anfragen in kurzer Zeit. Warte eine Minute und versuch es erneut.");
  if (type === "overloaded_error" || status === 529) return new Error("Claude ist gerade stark ausgelastet. Versuch es gleich noch einmal.");
  return new Error("Fehler von Claude" + (status ? ` (${status})` : "") + (msg ? `: ${msg}` : "."));
}

// ---------- Ergebnis anzeigen ----------
function counts() {
  const c = { veg: 0, ask: 0, no: 0 };
  (current ? current.dishes : []).forEach((d) => { if (c[norm(d.status)] != null) c[norm(d.status)]++; });
  return c;
}
const norm = (s) => (["veg", "ask", "no"].includes(s) ? s : "ask");

function render() {
  const r = $("results");
  r.replaceChildren();
  renderPhrase();
  if (!current) return;
  const head = el("div", "rhead"); head.id = "rhead";
  r.append(head);
  updateHead();
  const list = el("div", "results"); list.id = "dishList";
  r.append(list);
  current.dishes.filter((d) => filter === "all" || norm(d.status) === filter).forEach((d) => list.append(dishCard(d, false)));
  if (!current.streaming && current.dishes.length && !list.children.length) list.append(el("p", "empty", "Keine Gerichte in dieser Kategorie."));
}

function updateHead() {
  const head = $("rhead");
  if (!head || !current) return;
  head.replaceChildren();
  const m = current.meta || {};
  const when = new Date(current.ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  head.append(el("span", "meta", [when, m.language, dietName(current.diet)].filter(Boolean).join(" · ")));
  head.append(el("h2", null, (m.restaurant ? m.restaurant + " · " : "") + current.dishes.length + (current.dishes.length === 1 ? " Gericht" : " Gerichte")));
  if (m.venue && m.venue.text) {
    const vs = norm(m.venue.status);
    const v = el("div", "venue " + vs);
    v.append(el("b", null, VENUE_LABEL[vs]), document.createTextNode(m.venue.text));
    head.append(v);
  }
  if (m.summary) head.append(el("p", "summary", m.summary));
  if (current.dishes.length) {
    const c = counts();
    const tally = el("div", "tally");
    [["all", "Alle", current.dishes.length], ["veg", "Vegetarisch", c.veg], ["ask", "Nachfragen", c.ask], ["no", "Nicht veg.", c.no]].forEach(([k, l, n]) => {
      const b = el("button", "chip" + (k === "all" ? "" : " " + k)); b.type = "button";
      b.setAttribute("aria-pressed", String(filter === k));
      if (k !== "all") b.append(el("i"));
      b.append(document.createTextNode(`${l} ${n}`));
      b.onclick = () => { filter = k; render(); };
      tally.append(b);
    });
    head.append(tally);
  }
}

function appendDish(d) {
  const list = $("dishList");
  if (list && (filter === "all" || norm(d.status) === filter)) list.append(dishCard(d, true));
}

function dishCard(d, animate) {
  const st = norm(d.status);
  const c = el("article", "dish " + st + (animate ? " enter" : ""));
  const left = el("div");
  left.append(el("div", "jp", d.jp || d.de || ""));
  if (d.romaji) left.append(el("div", "romaji", d.romaji));
  c.append(left, el("div", "price", d.price || ""));
  if (d.de && d.de !== d.jp) c.append(el("div", "de", d.de));
  if (d.desc) c.append(el("div", "desc", d.desc));
  const v = el("div", "verdict");
  v.append(el("b", null, LABEL[st]));
  if (d.reason) v.append(el("span", null, d.reason));
  if (Array.isArray(d.hidden) && d.hidden.length) {
    const t = el("div", "tags");
    d.hidden.forEach((h) => t.append(el("span", "tag", String(h))));
    v.append(t);
  }
  c.append(v);
  if (st === "ask") {
    const a = el("button", "askbtn", "Beim Personal nachfragen"); a.type = "button";
    a.onclick = () => { const t = askText(d); showBig(t.local, t.de, t.lang); };
    c.append(a);
  }
  return c;
}
const dietName = (k) => ({ vegetarisch: "Vegetarisch", streng: "Streng veggie", vegan: "Vegan" }[k] || "");

// ---------- Satz fürs Personal ----------
function isJapanese() {
  const m = current && current.meta;
  return !m || !m.lang || /^ja/i.test(m.lang);
}
function renderPhrase() {
  const m = (current && current.meta) || {};
  const ja = isJapanese();
  let local, de, lang = ja ? "ja" : m.lang, ok = true;
  if (ja) { local = PHRASES[diet()].jp; de = PHRASES[diet()].de; }
  else if (current.diet === diet() && m.phrase_local) { local = m.phrase_local; de = m.phrase_de || ""; }
  else { ok = false; local = ""; de = `Scanne die Karte mit dieser Ernährung erneut, dann erscheint der passende Satz auf ${m.staff_language || "der Landessprache"}.`; }
  $("phraseLabel").textContent = "Dem Personal zeigen · " + (ja ? "Japanisch" : (m.staff_language || m.language || ""));
  $("phraseJp").textContent = local;
  $("phraseJp").lang = lang || "";
  $("phraseJp").hidden = !ok;
  $("phraseDe").textContent = de;
  $("bigBtn").hidden = $("copyBtn").hidden = !ok;
  $("glossBox").hidden = !ja;
}
function askText(d) {
  const m = (current && current.meta) || {};
  const name = d.jp || d.de;
  if (!isJapanese() && m.ask_local) return { local: `${name}\n${m.ask_local}`, de: m.ask_de || "", lang: m.lang };
  return { local: `「${name}」\n${ASK_JP}`, de: ASK_DE, lang: "ja" };
}
function showBig(jp, de, lang) {
  $("bigText").textContent = jp;
  $("bigText").lang = lang || "";
  $("bigSmall").textContent = de;
  $("overlay").hidden = false;
  $("closeBig").focus();
}
$("closeBig").onclick = () => { $("overlay").hidden = true; };
$("bigBtn").onclick = () => showBig($("phraseJp").textContent, $("phraseDe").textContent, $("phraseJp").lang);
$("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("phraseJp").textContent);
    $("copyBtn").textContent = "Kopiert";
    setTimeout(() => { $("copyBtn").textContent = "Kopieren"; }, 1500);
  } catch {
    const s = getSelection(), r = document.createRange();
    r.selectNodeContents($("phraseJp")); s.removeAllRanges(); s.addRange(r);
  }
};
document.querySelectorAll('input[name="diet"]').forEach((i) => i.addEventListener("change", () => { store.set("diet", diet()); renderPhrase(); }));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("overlay").hidden = true; });

// ---------- Einstellungen ----------
function openSettings() {
  const s = settings();
  $("apiKey").value = s.apiKey;
  $("model").value = s.model;
  $("settingsMsg").textContent = "";
  $("settings").showModal();
}
$("openSettings").onclick = openSettings;
$("closeSettings").onclick = () => $("settings").close();
$("setupBtn").onclick = openSettings;
$("settingsForm").addEventListener("submit", (e) => {
  const btn = e.submitter;
  if (btn && btn.value === "save") {
    const key = $("apiKey").value.trim();
    if (key && !/^sk-ant-/.test(key)) {
      e.preventDefault();
      $("settingsMsg").textContent = "Das sieht nicht nach einem Claude-Schlüssel aus. Er beginnt mit „sk-ant-“.";
      return;
    }
    store.set("apiKey", key);
    store.set("model", $("model").value);
    refreshSetup();
    setStatus(key ? "Gespeichert. Du kannst loslegen." : "");
  }
});
$("clearKey").onclick = () => { store.del("apiKey"); $("apiKey").value = ""; $("settingsMsg").textContent = "Schlüssel gelöscht."; refreshSetup(); };

// ---------- Verlauf ----------
function saveHistory(entry) {
  const h = store.get("history", []);
  const { streaming, ...clean } = entry;
  h.unshift(clean);
  while (h.length > HISTORY_MAX) h.pop();
  if (!store.set("history", h)) { h.forEach((x) => delete x.thumb); store.set("history", h); }
}
function openHistory() {
  const list = $("histList");
  list.replaceChildren();
  const h = store.get("history", []);
  if (!h.length) list.append(el("li", "empty", "Noch keine Scans."));
  h.forEach((e) => {
    const li = el("li"), b = el("button"); b.type = "button";
    const m = e.meta || {};
    const c = { veg: 0, ask: 0, no: 0 }; (e.dishes || []).forEach((d) => { c[norm(d.status)]++; });
    b.append(el("b", null, m.restaurant || "Speisekarte"));
    b.append(el("span", null, `${new Date(e.ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${c.veg} veggie · ${c.ask} nachfragen · ${c.no} nicht`));
    b.onclick = () => { current = e; filter = "all"; render(); $("history").close(); setStatus(""); $("results").scrollIntoView({ block: "start" }); };
    li.append(b); list.append(li);
  });
  $("history").showModal();
}
$("openHistory").onclick = openHistory;
$("closeHistory").onclick = () => $("history").close();
$("clearHistory").onclick = () => { store.del("history"); openHistory(); };

// Tipp aufs Abdunkeln schließt die Blätter
["settings", "history"].forEach((id) => $(id).addEventListener("click", (e) => { if (e.target === $(id)) $(id).close(); }));

// ---------- Start ----------
$("go").onclick = () => (settings().apiKey ? scan() : openSettings());
$("stop").onclick = () => { if (ctl) ctl.abort(); };

const savedDiet = store.get("diet", "vegetarisch");
const radio = document.querySelector(`input[name="diet"][value="${savedDiet}"]`);
if (radio) radio.checked = true;
renderPhrase();
refreshSetup();
renderThumbs();

const last = store.get("history", [])[0];
if (last) { current = last; render(); }

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
})();
