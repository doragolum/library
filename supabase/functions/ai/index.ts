// Усе, що шукає в інтернеті й питає Gemini: скриншот / текст / голосове / посилання → картки, жанри, тропи,
// перевірка серій на MEGOGO, перевірка книги («Знайти обкладинку й дані»), новини серій, фото обкладинки.
// Окремо від api, щоб api лишався швидким. Доступ такий самий, як в api: особистий ключ ?k=, підпис Телеграму або службовий токен бази.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { fromMegogo, megogoVolume } from "../_shared/megogo.ts";
import { fromYakaboo } from "../_shared/yakaboo.ts";
import { fromGoodreads } from "../_shared/goodreads.ts";
import { pubCanon } from "../_shared/pub.ts";
import { gemini, aiBooks, enrichItems, bookFromUrl, AiError, isbnKey, todayKyiv } from "../_shared/ai.ts";
import { tgSend, esc } from "../_shared/tg.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
type Row = Record<string, any>;
class UserError extends Error {}
const fail = (m: string): never => { throw new UserError(m); };
const s = (v: unknown) => String(v ?? "").trim();
const today = todayKyiv;
const human = (iso: string) => { const p = String(iso).split("-"); return `${p[2]}.${p[1]}.${p[0]}`; };
const WISH_KINDS = ["Хочу купити", "Докупити серію", "На майбутнє"];
async function kvGet(k: string, def: any = null) { const r = await db.from("kv").select("value").eq("key", k).maybeSingle(); return r.data?.value ?? def; }
async function kvSet(k: string, value: any) { const r = await db.from("kv").upsert({ key: k, value, updated_at: new Date().toISOString() }); if (r.error) throw new Error("kv: " + r.error.message); }
async function log(action: string, title: unknown, author: unknown, details: unknown) { await db.from("log").insert({ action, title: s(title) || null, author: s(author) || null, details: s(details) || null }); }
/** Бібліотека й бажанки у форматі сайту — від api (службовий токен). */
async function readAll(): Promise<Row> {
  const r = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/api", { method: "POST", headers: { "Content-Type": "application/json", "x-import-token": String(await kvGet("import_token", "")) }, body: JSON.stringify({ fn: "lbApiData", args: [] }) });
  const j = await r.json().catch(() => null);
  if (!j?.ok) throw new Error(j?.error || "База не віддала дані");
  return j.data;
}

/* ---------- доступ (як в api) ---------- */
function same(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function hmac(keyBytes: Uint8Array, data: string) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
}
async function auth(initData: string, k: string) {
  const saved = Deno.env.get("LB_WEB_KEY") || "";
  if (k && saved && same(k, saved)) return;
  if (!initData) fail("Немає доступу. Відкрийте бібліотеку за своїм особистим посиланням або через кнопку в Телеграм-боті.");
  const token = Deno.env.get("LB_TG_TOKEN"), allowed = Deno.env.get("LB_TG_USER_ID");
  if (!token || !allowed) fail("Телеграм у новій базі ще не підключено. Відкрийте бібліотеку за особистим посиланням.");
  const p = new URLSearchParams(initData);
  const hash = (p.get("hash") || "").toLowerCase();
  p.delete("hash");
  const check = [...p.entries()].map(([a, b]) => `${a}=${b}`).sort().join("\n");
  const secret = await hmac(new TextEncoder().encode("WebAppData"), token!);
  const sig = [...(await hmac(secret, check))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!hash || sig !== hash) fail("Телеграм не підтвердив, хто ви. Закрийте й відкрийте бібліотеку в боті заново.");
  if (!(Math.floor(Date.now() / 1000) - Number(p.get("auth_date") || 0) < 24 * 3600)) fail("Сесія застаріла. Закрийте й відкрийте бібліотеку в боті заново.");
  let u: Row = {};
  try { u = JSON.parse(p.get("user") || "{}"); } catch { /* */ }
  if (String(u.id) !== allowed) fail("Цей Телеграм не має доступу до бібліотеки.");
}

/* ---------- Gemini, посилання, новини серій, фото обкладинки (усе в базі, без Apps Script) ---------- */
const aiCtx = async () => { const d: Row = await readAll(); return { books: d.books, wish: d.wish }; };
async function aiCall<T>(f: () => Promise<T>): Promise<T> { try { return await f(); } catch (e) { if (e instanceof AiError) fail(e.message); throw e; } }

async function apiAi(req: Row) {
  req = req || {};
  const parts: Row[] = [];
  for (const b64 of (req.images || []).slice(0, 4)) parts.push({ inline_data: { mime_type: "image/jpeg", data: String(b64) } });
  if (req.text) parts.push({ text: "Текст від користувачки:\n" + String(req.text).slice(0, 6000) });
  if (!parts.length) fail("Немає скриншота чи тексту.");
  return aiCall(async () => aiBooks(parts, await aiCtx()));
}
async function bookDesc(req: Row) {
  let d = s(req.description);
  if (d.length < 80) { try { const y = await fromMegogo(s(req.isbn), s(req.title), s(req.author), s(req.pub)); if (y && !y.pubMismatch && y.description) d = y.description; } catch { /* */ } }
  return d;
}
async function apiGenre(req: Row) {
  req = req || {};
  const list = (req.list || []).map(String).filter(Boolean).slice(0, 80);
  if (!list.length || !req.title) return {};
  const desc = await bookDesc(req);
  const prompt = "Визнач жанри книги для особистого обліку. Обирай ЛИШЕ з цього списку (пиши точно як у списку): " + JSON.stringify(list) + ". " +
    'Поверни JSON {"genre":"основний жанр","genres":["до 3 додаткових"]}. Якщо не впевнена — {"genre":"","genres":[]}.\n' +
    "Книга: «" + s(req.title) + "»" + (req.author ? ", автор " + req.author : "") + (req.series ? ", серія «" + req.series + "»" : "") + "." + (desc ? "\nОпис: " + desc.slice(0, 2500) : "");
  const r = await aiCall(() => gemini([], prompt));
  if (!r) return { nokey: true };
  const ok = (x: unknown) => list.includes(String(x));
  const main = ok(r.genre) ? String(r.genre) : "";
  return { genre: main, genres: (Array.isArray(r.genres) ? r.genres : []).map(String).filter((x: string) => ok(x) && x !== main).slice(0, 3) };
}
async function apiTropes(req: Row) {
  req = req || {};
  if (!req.title) return { tropes: [] };
  const known = (req.known || []).map(String).filter(Boolean).slice(0, 120);
  const desc = await bookDesc(req);
  const prompt = "Визнач літературні тропи книги для особистого обліку, як на українських книжкових сайтах " +
    "(наприклад: вороги до коханців, морально сірий герой, мафія, сильна героїня, повільне горіння, фейкові стосунки, знайдена родина, обраний, академія магії). " +
    "Пиши українською, з малої літери, 1–4 слова. Якщо підходить троп з цього списку — пиши точно як у списку: " + JSON.stringify(known) + ". " +
    'Поверни JSON {"tropes":["до 6 тропів"]}. Якщо не впевнена — {"tropes":[]}.\n' +
    "Книга: «" + s(req.title) + "»" + (req.author ? ", автор " + req.author : "") + (req.series ? ", серія «" + req.series + "»" : "") + "." + (desc ? "\nОпис: " + desc.slice(0, 2500) : "");
  const r = await aiCall(() => gemini([], prompt));
  if (!r) return { nokey: true };
  const out: string[] = [];
  for (const x0 of (Array.isArray(r.tropes) ? r.tropes : [])) {
    const x = String(x0 || "").replace(/[,;]/g, " ").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 40);
    if (x && !out.includes(x)) out.push(x);
  }
  return { tropes: out.slice(0, 6), described: !!desc };
}
async function apiFromLink(req: Row) {
  return aiCall(async () => { const items = await bookFromUrl(s(req?.url)); await enrichItems(items, await aiCtx(), 20000); return { items }; });
}
async function apiSeriesCheck(req: Row) {
  const started = Date.now(), out: Row[] = [];
  for (const w of ((req && req.items) || []).slice(0, 30)) {
    if (Date.now() - started > 40000) { out.push({ row: w.row, skipped: true }); continue; }
    const m = await fromMegogo(s(w.isbn), s(w.title), s(w.author), "").catch(() => null);
    out.push({ row: w.row, series: m?.series || "", part: m?.series_num ? String(m.series_num) : "", title: m?.title || "", url: m?.url || "", isbn: m?.isbn || "" });
  }
  return out;
}
/** Перевірка однієї книги в інтернеті (діалог «Знайти обкладинку й дані»): MEGOGO → Yakaboo, рівна обкладинка — з Goodreads. */
async function apiOfficial(req: Row) {
  req = req || {};
  const isbn = String(req.isbn || "").replace(/[^0-9Xx]/g, "");
  let r: Row | null = await fromMegogo(isbn, s(req.title), s(req.author), s(req.pub)).catch(() => null);
  if (!r || r.pubMismatch) { const y = await fromYakaboo(s(req.title), s(req.author), s(req.pub)).catch(() => null); if (y && !y.pubMismatch) r = y; }
  if (!r || r.pubMismatch) return { notFound: true };
  const out: Row = { title: r.title, titleClean: r.title, author: r.author, pub: r.publisher ? pubCanon(r.publisher) : "", isbn: r.isbn || "", pages: r.pages || null,
    series: r.series || "", part: r.series_num || "", release: r.release || "", avail: r.avail || "", price: r.price || null, url: r.url, lang: r.lang || "", shopCover: r.cover || "", cover: "" };
  const k = isbnKey(out.isbn);
  if (k) { const g = await fromGoodreads(k).catch(() => null); if (g?.cover) { out.cover = g.cover; out.coverFrom = "Goodreads"; } }
  return out;
}
/** Фото обкладинки з телефону → сховище Supabase (папка covers, відкрита лише на перегляд). */
async function apiCoverUpload(req: Row) {
  req = req || {};
  if (!req.data) fail("Немає картинки.");
  const bin = Uint8Array.from(atob(String(req.data)), (c) => c.charCodeAt(0));
  if (bin.length > 5 * 1024 * 1024) fail("Картинка завелика.");
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const up = await db.storage.from("covers").upload(name, bin, { contentType: "image/jpeg", upsert: false });
  if (up.error) fail("Не вдалося зберегти фото: " + up.error.message);
  return { url: db.storage.from("covers").getPublicUrl(name).data.publicUrl };
}

/* ---------- новини серій: лише пропозиції (kv news), підтверджує вона ---------- */
const placeholder = (t: unknown) => /не оголошено|^(книга|частина|том)\s*\d+\s*$/i.test(s(t));
async function newsHash(id: number, ch: Row) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(id + "|" + JSON.stringify(ch))));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 10);
}
async function seriesNews(budgetMs: number) {
  const started = Date.now(), td = today();
  const st: Row = await kvGet("news_state", { seen: [], cur: 0 });
  const items: Row[] = await kvGet("news", []);
  const known = new Set<string>([...items.map((x) => x.id), ...(st.seen || [])]);
  const d: Row = await readAll();
  const list = (d.wish as Row[]).filter((w) => WISH_KINDS.includes(w.status) && w.avail !== "Є у продажу" && !(w.avail === "Передзамовлення" && w.release));
  const added: Row[] = [];
  let checked = 0;
  if (list.length) {
    const start = (st.cur || 0) % list.length;
    for (let n = 0; n < list.length; n++) {
      if (Date.now() - started > budgetMs) break;
      const w = list[(start + n) % list.length];
      st.cur = (start + n + 1) % list.length;
      checked++;
      if (!w.author || (!w.title && !w.series)) continue;
      let f: Row | null = null;
      try {
        f = placeholder(w.title) ? (w.series && w.part ? await megogoVolume(w.series, Number(w.part), w.author) : null) : await fromMegogo(String(w.isbn || "").replace(/\D/g, ""), w.title, w.author, w.pub);
      } catch { f = null; }
      if (!f || f.pubMismatch || (f.lang && !/укр/i.test(f.lang))) continue; // лише українські видання того ж видавництва
      const ch: Row = {};
      if (placeholder(w.title) && f.title && !placeholder(f.title)) ch.title = f.title;
      if (f.release && f.release !== w.release && f.release >= td.slice(0, 4) + "-01-01") ch.release = f.release;
      if (f.avail && f.avail !== w.avail) ch.avail = f.avail;
      if (f.publisher && !w.pub) ch.pub = pubCanon(f.publisher);
      if (!ch.title && !ch.release && !ch.avail) continue;
      const id = await newsHash(w.row, ch);
      if (known.has(id)) continue;
      known.add(id);
      const item = { id, row: w.row, a: w.author, t: w.title, s: w.series, p: w.part, ch, src: f.source || "MEGOGO Books", url: String(f.url || "").slice(0, 300), d: td };
      items.push(item); added.push(item);
    }
  }
  st.last = td;
  await kvSet("news", items.slice(-60));
  await kvSet("news_state", { ...st, seen: (st.seen || []).slice(-200) });
  return { checked, added, items: items.slice(-60) };
}
const newsText = (it: Row) => [it.ch.title ? "назва: «" + it.ch.title + "»" : "", it.ch.release ? "вийде " + human(it.ch.release) : "", it.ch.avail ? String(it.ch.avail).toLowerCase() : "", it.ch.pub || ""].filter(Boolean).join(" · ");
async function apiNews(req: Row) {
  req = req || {};
  if (req.action === "run") return (await seriesNews(25000)).items;
  if (req.action === "cron") {
    // щотижня (понеділок): довший прохід і повідомлення в Телеграм
    const r = await seriesNews(110000);
    await log("📰 Новини серій", "", "", `Перевірено: ${r.checked}, нового: ${r.added.length}`);
    if (r.added.length) await tgSend("📰 <b>Новини серій</b> (" + r.added.length + ")\n" + r.added.slice(0, 15).map((it) =>
      "• " + esc(it.ch.title || it.t) + (it.s ? " <i>(" + esc(it.s) + (it.p ? " #" + esc(it.p) : "") + ")</i>" : "") + " — " + esc(newsText(it))).join("\n") +
      "\n\nПідтвердити або сховати можна в додатку: Бажанки → «Новини серій».");
    return { checked: r.checked, added: r.added.length };
  }
  const items: Row[] = await kvGet("news", []);
  if (req.id) {
    const st: Row = await kvGet("news_state", { seen: [], cur: 0 });
    st.seen = [...(st.seen || []), String(req.id).slice(0, 12)];
    await kvSet("news_state", st);
    const left = items.filter((x) => x.id !== req.id);
    await kvSet("news", left);
    return left;
  }
  return items;
}

const API: Record<string, (req: Row) => Promise<unknown>> = {
  lbApiAi: apiAi,
  lbApiAiParts: async (req: Row) => aiCall(async () => aiBooks(((req && req.parts) || []).slice(0, 4), await aiCtx())),
  lbApiGenre: apiGenre,
  lbApiTropes: apiTropes,
  lbApiFromLink: apiFromLink,
  lbApiSeriesCheck: apiSeriesCheck,
  lbApiOfficial: apiOfficial,
  lbApiCoverUpload: apiCoverUpload,
  lbApiNews: apiNews,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const reply = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const body = JSON.parse((await req.text()) || "{}");
    const fn = s(body.fn);
    if (!API[fn]) fail("Невідома дія.");
    const svc = req.headers.get("x-import-token");
    if (!(svc && svc === String(await kvGet("import_token", "")))) await auth(s(body.initData), s(body.key));
    const args = Array.isArray(body.args) ? body.args : [];
    return reply({ ok: true, data: await API[fn](args[0] || {}) });
  } catch (e) {
    const msg = e instanceof UserError ? e.message : "Помилка: " + String((e as Error)?.message ?? e);
    if (!(e instanceof UserError)) console.error(e);
    return reply({ ok: false, error: msg });
  }
});
