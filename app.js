(() => {
"use strict";

const $ = (id) => document.getElementById(id);
const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_IMAGES = 5;
const MAX_EDGE = 1800;
const HISTORY_MAX = 25;

// ---------- Storage (this device only) ----------
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} }
};
const settings = () => ({
  apiKey: store.get("apiKey", ""),
  model: store.get("model", "claude-sonnet-5")
});

// ---------- Texts ----------
const PHRASES = {
  vegetarisch: { jp: "私はベジタリアンです。肉（鶏肉、牛肉など、どんな動物の肉も）、魚、鰹節やだし（魚のスープ）も食べられません。昆布だしは大丈夫です。", en: "I'm vegetarian. I don't eat meat (chicken, beef, any animal), fish, bonito flakes or fish-based dashi. Kombu dashi is fine." },
  pesce: { jp: "私はペスカタリアンです。肉（鶏肉、牛肉、豚肉など、どんな動物の肉も）は食べられませんが、魚とだしは大丈夫です。", en: "I'm pescatarian. I don't eat meat (chicken, beef, pork, any animal), but fish and dashi are fine." },
  vegan: { jp: "私はヴィーガンです。肉（鶏肉、牛肉など、どんな動物の肉も）、魚、だし、卵、乳製品は食べられません。", en: "I'm vegan. I don't eat meat (chicken, beef, any animal), fish, dashi, eggs or dairy." }
};
const ASK = {
  vegetarisch: { jp: "この料理に肉、魚、またはだし（鰹節）は入っていますか？", en: "“Does this dish contain meat, fish or dashi (bonito)?”" },
  pesce: { jp: "この料理に肉や肉のスープ（豚骨・鶏ガラなど）は入っていますか？", en: "“Does this dish contain meat or meat broth (pork, chicken)?”" },
  vegan: { jp: "この料理に肉、魚、だし、卵、乳製品は入っていますか？", en: "“Does this dish contain meat, fish, dashi, eggs or dairy?”" }
};
const LABEL = { veg: "OK for you", ask: "Ask first", no: "Not OK" };
const VENUE_LABEL = { veg: "Good fit. ", ask: "Limited. ", no: "Difficult. " };
const DIET_RULES = {
  vegetarisch: "The person is vegetarian: no meat of any animal, no fish, no seafood, and no hidden animal ingredients (fish or meat stock such as bonito dashi, fish sauce, shrimp paste, oyster sauce, anchovies, lard, gelatine). Eggs and dairy are fine. Pure seaweed or vegetable stock is fine. If a dish probably contains one of these, mark it \"ask\".",
  pesce: "The person is pescatarian: no meat or poultry of any animal, no meat or chicken stock (e.g. tonkotsu, torigara), no lard, no gelatine. Fish, seafood, dashi, fish sauce, eggs and dairy are fine. If a dish probably contains meat stock, lard or small pieces of meat (e.g. ramen, gyoza, chāhan, okonomiyaki with pork), mark it \"ask\".",
  vegan: "The person is vegan: no animal products at all, so also no eggs, dairy or honey, and no hidden animal ingredients (fish or meat stock, fish sauce, shrimp paste, oyster sauce, anchovies, lard, gelatine, ghee)."
};
const DIET_NAME_PROMPT = { vegetarisch: "vegetarian (eggs and dairy fine, but no fish and no fish or meat stock)", pesce: "pescatarian (no meat and no meat stock, but fish, seafood and fish stock are fine)", vegan: "vegan" };

function buildPrompt(diet) {
  return `You are an expert in international cuisine helping travellers in restaurants. The photos show a menu in any language (often Japanese, but also Chinese, Korean, Thai, Italian, etc.), printed or handwritten on a board. Several photos are pages of the same menu.

Task: list every readable dish (do not invent any). Translate it into English and assess it for this diet:
${DIET_RULES[diet]}

Think about the typical hidden ingredients of each cuisine, for example:
Japan: dashi (bonito) in miso soup, udon, soba, nimono, chawanmushi, tempura dip, mentsuyu, agedashi; katsuobushi topping; lard or chicken stock in ramen, gyoza, chāhan.
China/Taiwan: oyster sauce, lard, chicken stock, minced meat in vegetable dishes (e.g. mapo tofu, aubergine).
Korea: anchovy stock in soups and stews, fish sauce and shrimp in kimchi.
Southeast Asia: fish sauce, shrimp paste, dried shrimp.
Europe: anchovies, bacon or meat stock in sauces, soups and risotto, gelatine in desserts, cheese with animal rennet (for vegetarians only as a note).
For course menus (kaiseki, omakase, tasting menu) each course is one entry. For sets (teishoku, bentō, set menu) mention the usual sides in the reason. Only include drinks if they matter for the diet.
status: "veg" = definitely fits, "ask" = probably fits or unclear, ask the staff, "no" = clearly contains something unsuitable.
If something is hard to read, give your best reading and note the uncertainty in the reason.

Staff language: decide which language to use with the staff. This is usually the local language of the country, not necessarily the language of the menu (an English tourist menu in Japan still means Japanese). Write in it politely and naturally, the way a native speaker would. When saying what the person cannot eat, spell out meat explicitly, like "meat (chicken, beef, any animal)".

OUTPUT FORMAT: newline-delimited JSON. Every line is exactly one JSON object. No other text, no code fences.
Line 1:
{"type":"meta","restaurant":"type of place in English (e.g. izakaya, ramen shop, trattoria, street food stall)","language":"language of the menu in English","staff_language":"language for the staff in English, e.g. Japanese","lang":"BCP-47 code of the staff language, e.g. ja, zh-TW, ko, th, it","phrase_local":"1 to 2 short polite sentences in the staff language: I am ${DIET_NAME_PROMPT[diet]}, and exactly what I cannot eat, including the hidden ingredients typical for this country","phrase_en":"English translation of phrase_local","ask_local":"a short polite question in the staff language asking whether this dish contains the ingredients critical for this diet (concrete for this cuisine, e.g. fish sauce)","ask_en":"English translation of ask_local","venue":{"status":"veg|ask|no","text":"1 sentence: can you eat well here with this diet? For fixed course menus, suggest mentioning the diet when booking."},"summary":"1 to 2 sentences: what fits best here or what to order"}
Then one line per dish, first all "veg", then "ask", then "no":
{"type":"dish","jp":"original name as on the menu","romaji":"romanisation (empty if the menu is already in Latin script)","en":"English name","desc":"short description, at most 12 words","price":"price as on the menu or empty","status":"veg|ask|no","reason":"short reason; for ask, exactly what to check","hidden":["hidden ingredient in the original + English"]}
If no menu is readable: only the meta line, with the reason in summary.`;
}

// ---------- State ----------
let photos = [];          // [{blob, url}]
let current = null;       // {meta, dishes, ts, diet, model, sample?}
let filter = "all";
let ctl = null;

const diet = () => (document.querySelector('input[name="diet"]:checked') || {}).value || "vegetarisch";

// ---------- DOM helpers ----------
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
  $("go").textContent = settings().apiKey ? "Analyse menu" : "Analyse menu (API key missing)";
}

// ---------- Photos ----------
function addFiles(list) {
  const imgs = Array.from(list || []).filter((f) => /^image\//.test(f.type) || /\.(heic|heif|jpe?g|png|webp)$/i.test(f.name));
  for (const f of imgs) {
    if (photos.length >= MAX_IMAGES) { setStatus(`At most ${MAX_IMAGES} photos per scan.`, "err"); break; }
    photos.push({ blob: f, url: URL.createObjectURL(f) });
  }
  renderThumbs();
}
function renderThumbs() {
  const t = $("thumbs");
  t.replaceChildren();
  photos.forEach((p, i) => {
    const w = el("div", "thumb");
    const im = new Image(); im.src = p.url; im.alt = `Page ${i + 1}`;
    const x = el("button", null, "✕"); x.type = "button"; x.setAttribute("aria-label", `Remove page ${i + 1}`);
    x.onclick = () => { URL.revokeObjectURL(p.url); photos.splice(i, 1); renderThumbs(); };
    w.append(im, x); t.append(w);
  });
  $("pickHint").textContent = photos.length
    ? `${photos.length} ${photos.length === 1 ? "page" : "pages"} ready. Add more pages by taking another photo.`
    : `Several pages? Take one photo after another, up to ${MAX_IMAGES}.`;
  updateGo();
}
$("camInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });
$("libInput").addEventListener("change", (e) => { addFiles(e.target.files); e.target.value = ""; });

function loadImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("Could not open the photo.")); };
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

// ---------- Claude request (streaming) ----------
async function scan() {
  const { apiKey, model } = settings();
  if (!apiKey) { openSettings(); return; }
  if (!photos.length) return;

  ctl = new AbortController();
  $("stop").hidden = false;
  updateGo();
  setStatus("Preparing photos …", "busy");

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

    setStatus("Claude is reading the menu …", "busy");
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
      else if (obj.type === "dish" || obj.jp || obj.en) { current.dishes.push(obj); appendDish(obj); updateHead(); }
      setStatus(`Claude is reading the menu … ${current.dishes.length} ${current.dishes.length === 1 ? "dish" : "dishes"} so far`, "busy");
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

    if (!current.meta && !current.dishes.length) throw new Error("Claude did not return a usable answer. Try again with a sharper photo.");

    const order = { veg: 0, ask: 1, no: 2 };
    current.dishes.sort((a, b) => (order[a.status] ?? 1) - (order[b.status] ?? 1));
    current.streaming = false;
    current.thumb = thumb;
    render();
    saveHistory(current);

    const n = current.dishes.length;
    setStatus(n
      ? `Done. ${n} ${n === 1 ? "dish" : "dishes"} found.` + (truncated ? " The menu was very long, some dishes may be missing." : "")
      : (current.meta && current.meta.summary) || "No dishes found.");
    // Clear photos after a successful scan so the next menu starts fresh
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    photos = [];
    renderThumbs();
  } catch (e) {
    if (e && e.name === "AbortError") {
      setStatus(current.dishes.length ? "Stopped. The dishes found so far stay visible." : "Stopped.");
    } else {
      setStatus((e && e.message) || "Something went wrong. Please try again.", "err");
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
  if (res.status === 401) return new Error("The API key was not accepted. Check it in Settings.");
  if (res.status === 403) return new Error("This key has no access to this model. Pick another one in Settings.");
  if (res.status === 404) return new Error("This model is not available. Pick another one in Settings.");
  if (res.status === 413) return new Error("The photos are too large. Use fewer pages at once.");
  if (res.status === 400 && /credit|balance/i.test(msg)) return new Error("Your API credit is used up. Top it up at console.anthropic.com.");
  return friendly(type, msg, res.status);
}
function friendly(type, msg, status) {
  if (type === "rate_limit_error" || status === 429) return new Error("Too many requests in a short time. Wait a minute and try again.");
  if (type === "overloaded_error" || status === 529) return new Error("Claude is very busy right now. Try again in a moment.");
  return new Error("Error from Claude" + (status ? ` (${status})` : "") + (msg ? `: ${msg}` : "."));
}

// ---------- Results ----------
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
  if (!current.streaming && current.dishes.length && !list.children.length) list.append(el("p", "empty", "No dishes in this category."));
}

function updateHead() {
  const head = $("rhead");
  if (!head || !current) return;
  head.replaceChildren();
  const m = current.meta || {};
  const when = new Date(current.ts).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  head.append(el("span", "meta", [when, m.language, dietName(current.diet)].filter(Boolean).join(" · ")));
  head.append(el("h2", null, (m.restaurant ? m.restaurant + " · " : "") + current.dishes.length + (current.dishes.length === 1 ? " dish" : " dishes")));
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
    [["all", "All", current.dishes.length], ["veg", "OK", c.veg], ["ask", "Ask first", c.ask], ["no", "Not OK", c.no]].forEach(([k, l, n]) => {
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
  const en = d.en || d.de || "";
  left.append(el("div", "jp", d.jp || en));
  if (d.romaji) left.append(el("div", "romaji", d.romaji));
  c.append(left, el("div", "price", d.price || ""));
  if (en && en !== d.jp) c.append(el("div", "de", en));
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
    const a = el("button", "askbtn", "Ask the staff"); a.type = "button";
    a.onclick = () => { const t = askText(d); showBig(t.local, t.en, t.lang); };
    c.append(a);
  }
  return c;
}
const dietName = (k) => ({ pesce: "Pescatarian", vegetarisch: "Vegetarian", streng: "Vegetarian", vegan: "Vegan" }[k] || "");

// ---------- Phrase for the staff ----------
function isJapanese() {
  const m = current && current.meta;
  return !m || !m.lang || /^ja/i.test(m.lang);
}
function renderPhrase() {
  const m = (current && current.meta) || {};
  const ja = isJapanese();
  let local, en, lang = ja ? "ja" : m.lang, ok = true;
  if (ja) { local = PHRASES[diet()].jp; en = PHRASES[diet()].en; }
  else if (current.diet === diet() && m.phrase_local) { local = m.phrase_local; en = m.phrase_en || m.phrase_de || ""; }
  else { ok = false; local = ""; en = `Scan the menu again with this diet to get the matching sentence in ${m.staff_language || "the local language"}.`; }
  $("phraseLabel").textContent = "Show the staff · " + (ja ? "Japanese" : (m.staff_language || m.language || ""));
  $("phraseJp").textContent = local;
  $("phraseJp").lang = lang || "";
  $("phraseJp").hidden = !ok;
  $("phraseDe").textContent = en;
  $("bigBtn").hidden = $("copyBtn").hidden = !ok;
  $("glossBox").hidden = !ja;
}
function askText(d) {
  const m = (current && current.meta) || {};
  const name = d.jp || d.en || d.de;
  if (!isJapanese() && m.ask_local) return { local: `${name}\n${m.ask_local}`, en: m.ask_en || m.ask_de || "", lang: m.lang };
  const q = ASK[diet()] || ASK.vegetarisch;
  return { local: `「${name}」\n${q.jp}`, en: q.en, lang: "ja" };
}
function showBig(local, en, lang) {
  $("bigText").textContent = local;
  $("bigText").lang = lang || "";
  $("bigSmall").textContent = en;
  $("overlay").hidden = false;
  $("closeBig").focus();
}
$("closeBig").onclick = () => { $("overlay").hidden = true; };
$("bigBtn").onclick = () => showBig($("phraseJp").textContent, $("phraseDe").textContent, $("phraseJp").lang);
$("copyBtn").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("phraseJp").textContent);
    $("copyBtn").textContent = "Copied";
    setTimeout(() => { $("copyBtn").textContent = "Copy"; }, 1500);
  } catch {
    const s = getSelection(), r = document.createRange();
    r.selectNodeContents($("phraseJp")); s.removeAllRanges(); s.addRange(r);
  }
};
document.querySelectorAll('input[name="diet"]').forEach((i) => i.addEventListener("change", () => { store.set("diet", diet()); renderPhrase(); }));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("overlay").hidden = true; });

// ---------- Settings ----------
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
      $("settingsMsg").textContent = "That does not look like a Claude API key. It starts with “sk-ant-”.";
      return;
    }
    store.set("apiKey", key);
    store.set("model", $("model").value);
    refreshSetup();
    setStatus(key ? "Saved. You are ready to scan." : "");
  }
});
$("clearKey").onclick = () => { store.del("apiKey"); $("apiKey").value = ""; $("settingsMsg").textContent = "Key deleted."; refreshSetup(); };

// ---------- History ----------
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
  if (!h.length) list.append(el("li", "empty", "No scans yet."));
  h.forEach((e) => {
    const li = el("li"), b = el("button"); b.type = "button";
    const m = e.meta || {};
    const c = { veg: 0, ask: 0, no: 0 }; (e.dishes || []).forEach((d) => { c[norm(d.status)]++; });
    b.append(el("b", null, m.restaurant || "Menu"));
    b.append(el("span", null, `${new Date(e.ts).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${c.veg} OK · ${c.ask} ask first · ${c.no} not OK`));
    b.onclick = () => { current = e; filter = "all"; render(); $("history").close(); setStatus(""); $("results").scrollIntoView({ block: "start" }); };
    li.append(b); list.append(li);
  });
  $("history").showModal();
}
$("openHistory").onclick = openHistory;
$("closeHistory").onclick = () => $("history").close();
$("clearHistory").onclick = () => { store.del("history"); openHistory(); };

// Tapping the backdrop closes the sheets
["settings", "history"].forEach((id) => $(id).addEventListener("click", (e) => { if (e.target === $(id)) $(id).close(); }));

// ---------- Start ----------
$("go").onclick = () => (settings().apiKey ? scan() : openSettings());
$("stop").onclick = () => { if (ctl) ctl.abort(); };

let savedDiet = store.get("diet", "vegetarisch");
if (savedDiet === "streng") savedDiet = "vegetarisch";
if (!PHRASES[savedDiet]) savedDiet = "vegetarisch";
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
