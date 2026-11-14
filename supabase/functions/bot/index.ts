// Телеграм-бот «Моєї бібліотеки» на вебхуку (замість опитування lbBotPoll в Apps Script).
// Пошук «чи є в мене», /week /month /kyiv /help, скриншот / посилання / голосове → картка «У бажанки / Замовила / ✕» з уточненнями.
// Відповідає лише вам (LB_TG_USER_ID). Телеграм підписує кожен запит секретом, виведеним з ключа бота.
// Налаштування вебхука: POST {setup:true} із заголовком x-import-token (з самої бази) або функція lbSwitchToDb в Apps Script.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { tgApi, tgSend, tgChat, tgToken, esc, hookSecret } from "../_shared/tg.ts";
import { looksPrivate, redact, parseRelease, todayKyiv } from "../_shared/ai.ts";
import { findText, weekText, monthText, kyivText, helpText, human } from "../_shared/texts.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const BASE = Deno.env.get("SUPABASE_URL")!;
const PAGE = "https://doragolum.github.io/library/";
type Row = Record<string, any>;

async function kvGet(k: string, def: any = null) { const r = await db.from("kv").select("value").eq("key", k).maybeSingle(); return r.data?.value ?? def; }
async function kvSet(k: string, value: any) { await db.from("kv").upsert({ key: k, value, updated_at: new Date().toISOString() }); }
/** Виклик API бази від імені бота (службовий токен, як у кронів). Gemini й пошук в інтернеті — функція ai. */
const AI_FNS = ["lbApiAi", "lbApiAiParts", "lbApiFromLink", "lbApiNews"];
async function api(fn: string, arg: unknown) {
  const tok = await kvGet("import_token", "");
  const r = await fetch(BASE + "/functions/v1/" + (AI_FNS.includes(fn) ? "ai" : "api"), { method: "POST", headers: { "Content-Type": "application/json", "x-import-token": String(tok) }, body: JSON.stringify({ fn, args: [arg] }) });
  const j = await r.json().catch(() => ({ ok: false, error: "База не відповіла" }));
  if (!j.ok) throw new Error(j.error || "Не вдалося");
  return j.data;
}
async function tgFile(fileId: string): Promise<Uint8Array> {
  const f = await tgApi("getFile", { file_id: fileId });
  if (!f.ok) throw new Error("Телеграм не віддав файл.");
  const r = await fetch(`https://api.telegram.org/file/bot${tgToken()}/${f.result.file_path}`);
  return new Uint8Array(await r.arrayBuffer());
}
function b64(bytes: Uint8Array) { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }

/* ---------- картка з уточненнями (стан у kv bot_pending) ---------- */
const ASK: Record<string, (x: Row) => string> = {
  author: (x) => "✍️ Хто автор «" + esc(x.title) + "»?",
  part: (x) => "🔢 Який номер тому «" + esc(x.title) + "» у серії «" + esc(x.series) + "»?",
  release: (x) => "📅 Коли виходить «" + esc(x.title) + "»? Напишіть, наприклад, <b>03.2027</b> або <b>березень</b>.",
};
async function pendGet(): Promise<Row> { return await kvGet("bot_pending", {}); }
async function pendSave(p: Row) { const keys = Object.keys(p).sort(); while (keys.length > 10) delete p[keys.shift()!]; await kvSet("bot_pending", p); }

async function card(chat: number, items: Row[], note = "") {
  const lean = items.slice(0, 12).map((x) => {
    const o: Row = {};
    for (const k of ["title", "author", "series", "part", "total", "pub", "price", "release", "avail", "isbn", "orig", "src", "dup", "need", "serWas"]) if (x[k] != null && x[k] !== "" && !(Array.isArray(x[k]) && !x[k].length)) o[k] = x[k];
    return o;
  });
  const pend = await pendGet(), id = String(Date.now()).slice(-8);
  pend[id] = { items: lean, asked: {}, n: 0, note, chat };
  await pendSave(pend);
  await next(id);
}
async function next(id: string) {
  const pend = await pendGet(), p = pend[id];
  if (!p) return;
  if (p.n < 4) {
    for (let i = 0; i < p.items.length; i++) {
      const x = p.items[i];
      if (x.dup && x.dup.kind === "library") continue; // уже є — не мучимо запитаннями
      for (const f of (x.need || [])) {
        if (p.asked[i + ":" + f] || x[f]) continue;
        p.asked[i + ":" + f] = 1; p.n++; p.ask = { i, f };
        const kb: Row[][] = [[{ text: f === "release" ? "Не знаю" : "Пропустити", callback_data: "a:" + id + ":skip" }]];
        if (f === "release") kb[0].unshift({ text: "Вже у продажу", callback_data: "a:" + id + ":sale" });
        const r = await tgApi("sendMessage", { chat_id: p.chat, parse_mode: "HTML", text: ASK[f](x) + "\n<i>Відповідайте на це повідомлення (свайп вліво або «Відповісти»).</i>", reply_markup: { inline_keyboard: kb } });
        p.q = r?.result?.message_id || 0;
        pend[id] = p; await pendSave(pend);
        return;
      }
    }
  }
  delete p.ask; delete p.q; pend[id] = p; await pendSave(pend);
  await showCard(id, p);
}
async function showCard(id: string, p: Row) {
  const lines = p.items.map((x: Row) => {
    const dup = x.dup ? "\n   ⚠️ " + (x.dup.kind === "library" ? "уже є в бібліотеці" : "уже в бажанках · " + esc(x.dup.status || "")) + " (за " + esc(x.dup.by) + ")" : "";
    return "📖 <b>" + esc(x.title) + "</b>" + (x.author ? " — " + esc(x.author) : " — <i>автор невідомий</i>") +
      (x.series ? "\n   " + esc(x.series) + (x.part ? " #" + esc(x.part) : "") + (x.total ? " з " + esc(x.total) : "") + (x.serWas ? " (як у вашій бібліотеці)" : "") : "") +
      [x.pub, x.price ? x.price + " грн" : "", x.release ? "реліз " + human(x.release) : "", x.avail].filter(Boolean).map((s) => "\n   " + esc(s)).join("") +
      (x.src ? '\n   <a href="' + esc(x.src) + '">джерело</a>' : "") + dup;
  });
  const miss = p.items.some((x: Row) => !x.author);
  await tgApi("sendMessage", { chat_id: p.chat, parse_mode: "HTML", disable_web_page_preview: true,
    text: lines.join("\n\n") + (miss ? "\n\n⚠️ Без автора книгу не збережу — допишіть потім у додатку." : "") + (p.note ? "\n\n" + p.note : ""),
    reply_markup: { inline_keyboard: [[{ text: "✓ У бажанки", callback_data: "w:" + id }, { text: "🧾 Замовила", callback_data: "o:" + id }, { text: "✕", callback_data: "x:" + id }]] } });
}
async function answerAsk(m: Row): Promise<boolean> {
  const pend = await pendGet(), qid = m.reply_to_message.message_id;
  const id = Object.keys(pend).find((k) => pend[k]?.q === qid && pend[k].ask);
  if (!id) return false;
  const p = pend[id], x = p.items[p.ask.i], f = p.ask.f;
  let t = String(m.text).trim();
  if (/^(не знаю|-|пропустити|нема|немає)$/i.test(t)) { await next(id); return true; }
  const retry = async (msg: string) => { await tgSend(msg); delete p.asked[p.ask.i + ":" + f]; p.n--; pend[id] = p; await pendSave(pend); await next(id); return true; };
  if (f === "author") x.author = t.slice(0, 120);
  if (f === "part") {
    const ORD = ["перш", "друг", "трет", "четв", "пʼят", "шост", "сьом", "восьм", "девʼят", "десят"], tw = t.toLowerCase().replace(/['’]/g, "ʼ");
    ORD.forEach((w, i) => { if (!/\d/.test(t) && tw.includes(w)) t = String(i + 1); });
    const n = t.match(/\d+(?:[.,]\d+)?/);
    if (!n) return retry("Напишіть номер тому цифрою, наприклад <b>2</b>.");
    x.part = n[0].replace(",", ".");
  }
  if (f === "release") {
    const r = parseRelease(t);
    if (!r) return retry("Не зрозуміла дату. Напишіть, наприклад, <b>03.2027</b>.");
    x.release = r; if (!x.avail || x.avail === "Анонс") x.avail = r > todayKyiv() ? (x.avail || "Анонс") : "Є у продажу";
  }
  pend[id] = p; await pendSave(pend);
  await next(id);
  return true;
}
async function button(q: Row) {
  const [act, id, what] = String(q.data || "").split(":");
  const pend = await pendGet(), p = pend[id];
  if (act === "a") {
    await tgApi("editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
    if (!p || !p.ask) return tgApi("answerCallbackQuery", { callback_query_id: q.id, text: "Це запитання вже неактуальне." });
    if (what === "sale") { p.items[p.ask.i].avail = "Є у продажу"; pend[id] = p; await pendSave(pend); }
    await tgApi("answerCallbackQuery", { callback_query_id: q.id, text: what === "sale" ? "Добре: вже у продажу" : "Пропускаю" });
    return next(id);
  }
  const done = async (txt: string) => {
    await tgApi("answerCallbackQuery", { callback_query_id: q.id, text: txt.slice(0, 190) });
    await tgApi("editMessageReplyMarkup", { chat_id: q.message.chat.id, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } });
    await tgApi("sendMessage", { chat_id: q.message.chat.id, text: txt, reply_to_message_id: q.message.message_id });
  };
  if (!p) return tgApi("answerCallbackQuery", { callback_query_id: q.id, text: "Ця картка вже неактуальна." });
  delete pend[id]; await pendSave(pend);
  if (act === "x") return done("Добре, нічого не зберігаю.");
  const ok = p.items.filter((x: Row) => x.author);
  if (!ok.length) return done("Немає автора — додайте книгу в додатку.");
  const rel = (s: unknown) => { const t = String(s || ""); return /^\d{4}-\d{2}$/.test(t) ? t + "-01" : t; };
  const out = await api("lbApiOrder", { mode: act === "o" ? "order" : "wish", items: ok.map((x: Row) => ({
    title: x.title, author: x.author, series: x.series, part: x.part, total: x.total, pub: x.pub, price: x.price, release: rel(x.release), avail: x.avail,
    isbn: String(x.isbn || "").replace(/\D/g, ""), orig: x.orig || "", src: x.src || "" })) });
  return done((act === "o" ? "🧾 Записала як замовлені" : "✓ Додала в бажанки") + ": " + ok.length + (out?.updated ? " (оновлено " + out.updated + ")" : "") + ".");
}

/* ---------- скриншот, голосове, посилання, текст ---------- */
async function photo(m: Row) {
  const fileId = m.photo ? m.photo[m.photo.length - 1].file_id : m.document.file_id;
  const bytes = await tgFile(fileId), data = b64(bytes);
  // спершу звичайне розпізнавання тексту (Google Диск через Apps Script): якщо це замовлення з адресою й телефоном,
  // у Gemini йде лише текст без цих рядків, а не сама картинка
  let txt = "";
  try { txt = String((await api("lbApiOcr", { data, mime: "image/jpeg" }))?.text || ""); } catch { txt = ""; }
  const priv = !!txt && looksPrivate(txt);
  const req: Row = priv ? { text: "Текст скриншота замовлення (особисті дані прибрано):\n" + redact(txt).slice(0, 6000) } : { images: [data] };
  if (m.caption) req.text = (req.text ? req.text + "\n" : "") + "Підпис користувачки: " + m.caption;
  const r = await api("lbApiAi", req);
  if (r.nokey) return tgSend("Щоб я читала скриншоти, додайте секрет GEMINI_API_KEY у Supabase.");
  if (!r.items?.length) return tgSend("На скриншоті не знайшла книг. Спробуйте інший або додайте через кнопку «Бібліотека».");
  await card(m.chat.id, r.items, priv ? "🔒 Це схоже на замовлення: у Gemini пішов лише текст без адреси й телефону." : "");
}
async function voice(m: Row) {
  const v = m.voice || m.audio;
  if (v.file_size && v.file_size > 10 * 1024 * 1024) return tgSend("Голосове задовге — до хвилини-двох вистачить.");
  const bytes = await tgFile(v.file_id);
  const mime = String(v.mime_type || "audio/ogg").replace(/;.*$/, "");
  const r = await api("lbApiAiParts", { parts: [{ text: "Це голосове повідомлення користувачки українською: вона називає книгу(и), які хоче купити або вже замовила. Імена й назви пиши так, як вони звучать українською." },
    { inline_data: { mime_type: mime, data: b64(bytes) } }] });
  if (r.nokey) return tgSend("Щоб я розуміла голосові, додайте секрет GEMINI_API_KEY у Supabase.");
  if (!r.items?.length) return tgSend("Не розчула назви книги. Спробуйте ще раз або напишіть текстом.");
  await card(m.chat.id, r.items);
}
async function link(m: Row, url: string) {
  const r = await api("lbApiFromLink", { url });
  if (!r.items?.length) return tgSend("На сторінці не знайшла книги. Надішліть скриншот або назву.");
  await card(m.chat.id, r.items);
}
async function text(m: Row) {
  const t = String(m.text).trim(), cmd = t.toLowerCase();
  if (/^\/(start|help|допомога)\b/.test(cmd)) return tgSend(helpText());
  const data = await api("lbApiData", null);
  const td = todayKyiv();
  if (/^\/(week|тиждень)\b/.test(cmd)) return tgSend(weekText(data, td, true));
  if (/^\/(month|місяць)\b/.test(cmd)) return tgSend(monthText(data, td, true));
  if (/^\/(kyiv|київ)\b/.test(cmd)) return tgSend(kyivText(data));
  const q = t.replace(/^\/(є|e|find|пошук)\s*/i, "").trim();
  if (q.length < 2) return tgSend("Напишіть назву, автора або серію, наприклад: <b>Четверте крило</b>");
  return tgSend(findText(q, data));
}

async function handle(u: Row) {
  const chat = tgChat();
  const q = u.callback_query;
  if (q?.message && String(q.message.chat.id) === chat) {
    try { await button(q); } catch (e) { await tgApi("answerCallbackQuery", { callback_query_id: q.id, text: "Не вийшло: " + String((e as Error).message || e).slice(0, 150) }); }
    return;
  }
  const m = u.message;
  if (!m || String(m.chat?.id) !== chat) return; // чужим не відповідаємо
  try {
    if (m.photo || (m.document && /^image\//.test(m.document.mime_type || ""))) return await photo(m);
    if (m.voice || m.audio) return await voice(m);
    if (!m.text) return;
    if (m.reply_to_message && await answerAsk(m)) return;
    const url = String(m.text).match(/https?:\/\/[^\s<>"]+/);
    if (url && !/^\//.test(m.text)) return await link(m, url[0]);
    await text(m);
  } catch (e) {
    await tgSend("Не вийшло: " + esc((e as Error)?.message || e));
  }
}

async function setup() {
  const me = await tgApi("getMe");
  if (!me.ok) return { ok: false, error: "Бот не відповів: " + (me.description || "перевірте секрет LB_TG_TOKEN") };
  const hook = await tgApi("setWebhook", { url: BASE + "/functions/v1/bot", secret_token: await hookSecret(), allowed_updates: ["message", "callback_query"], drop_pending_updates: false });
  const chat = tgChat();
  const menu = chat ? await tgApi("setChatMenuButton", { chat_id: Number(chat), menu_button: { type: "web_app", text: "Бібліотека", web_app: { url: PAGE + "?tg=1" } } }) : { ok: false };
  await tgApi("setMyCommands", { commands: [{ command: "week", description: "Підсумок тижня" }, { command: "month", description: "Підсумок місяця" }, { command: "kyiv", description: "Що чекає в Києві" }, { command: "help", description: "Що я вмію" }] });
  return { ok: !!hook.ok, bot: "@" + me.result.username, webhook: hook.description || hook.ok, menu: menu.ok };
}

Deno.serve(async (req) => {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ ok: false }, 405);
  if (!tgToken()) return json({ ok: false, error: "немає LB_TG_TOKEN" });
  // службові дії з самої бази
  const svc = req.headers.get("x-import-token");
  if (svc) {
    if (svc !== String(await kvGet("import_token", ""))) return json({ ok: false }, 403);
    const b = await req.json().catch(() => ({}));
    if (b.setup) return json(await setup());
    if (b.info) return json(await tgApi("getWebhookInfo"));
    if (b.send) return json(await tgSend(String(b.send)));
    return json({ ok: false, error: "невідома дія" });
  }
  if (req.headers.get("x-telegram-bot-api-secret-token") !== await hookSecret()) return json({ ok: false }, 403);
  const u = await req.json().catch(() => null);
  if (!u) return json({ ok: true });
  // одне й те саме оновлення Телеграм може надіслати двічі — пам'ятаємо останні
  const seen: number[] = await kvGet("bot_seen", []);
  if (seen.includes(u.update_id)) return json({ ok: true });
  await kvSet("bot_seen", [...seen, u.update_id].slice(-50));
  // відповідаємо Телеграму одразу, а роботу (Gemini, MEGOGO) робимо у фоні
  // @ts-ignore EdgeRuntime є в Supabase
  EdgeRuntime.waitUntil(handle(u));
  return json({ ok: true });
});
