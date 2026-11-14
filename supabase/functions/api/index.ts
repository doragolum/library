// API сайту «Моя бібліотека» на базі Supabase. Ті самі назви дій і та сама відповідь, що й у doPost з Apps Script,
// тож сайт змінює лише адресу. Дії, що лише шукають в інтернеті (Gemini, MEGOGO, OCR), поки що виконує Apps Script.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { fromMegogo } from "../_shared/megogo.ts";
import { fromYakaboo } from "../_shared/yakaboo.ts";
import { PUBLISHERS, pubCanon, samePub } from "../_shared/pub.ts";

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwzMBurJfPgrKJY2H99pHG7BN7axnxWIFC3p1cHjno3Q0bKywZP71_KDC2vBd9qfUi1/exec";
const TZ = "Europe/Kyiv";
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };

class UserError extends Error {}
const fail = (m: string): never => { throw new UserError(m); };
type Row = Record<string, any>;

/* ---------- дрібні помічники ---------- */
const s = (v: unknown) => String(v ?? "").trim();
const norm = (v: unknown) =>
  String(v ?? "").toLowerCase().replace(/ґ/g, "г").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/['’`"ʼ«»]/g, "").replace(/[-–—]/g, " ").replace(/[.,:;!?()[\]{}#№]/g, " ").replace(/\s+/g, " ").trim();
const key = (v: unknown) => s(v).toLowerCase().replace(/\s+/g, " ");
const num = (v: unknown) => {
  const t = String(v ?? "").replace(/[\s ₴]|грн/g, "").replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return isFinite(n) ? n : null;
};
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
function isoDate(v: unknown): string | null {
  const t = s(v);
  let m = t.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function isoMonth(v: unknown): string | null {
  const t = s(v).replace(/^'/, "");
  let m = t.match(/^(\d{1,2})[.\/](\d{4})$/);
  if (m) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = t.match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  const d = isoDate(t);
  return d ? d.slice(0, 7) : null;
}
const human = (iso: string) => { const p = iso.split("-"); return `${p[2]}.${p[1]}.${p[0]}`; };
function isbnKey(v: unknown): string {
  let d = String(v ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (d.length === 10) {
    const b = "978" + d.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(b[i]) * (i % 2 ? 3 : 1);
    d = b + ((10 - (sum % 10)) % 10);
  }
  return /^\d{13}$/.test(d) ? d : "";
}
const WISH_KINDS = ["Хочу купити", "Докупити серію", "На майбутнє"];
const STAGE_STATUS: Record<string, string> = { ordered: "Замовлено", ttn: "Створено ТТН", shipped: "Відправлено", delivered: "Доставлено", library: "В бібліотеці" };
const STATUS_STAGE: Record<string, string> = { "Замовлено": "ordered", "Створено ТТН": "ttn", "Відправлено": "shipped", "Доставлено": "delivered", "В бібліотеці": "library" };
const WISH_STAGES = ["wish", "ordered", "ttn", "shipped", "delivered"];
const LIB_STAGES = ["library", "sold", "gifted"];

/* ---------- поля, які можна змінювати з сайту (як LB_FIELDS) ---------- */
type FD = { col?: string; type: string; def?: string[]; label: string };
const FIELDS: Record<string, Record<string, FD>> = {
  library: {
    status: { col: "read_status", type: "list", def: ["прочитано", "не читала", "читаю", "закинула"], label: "Статус" },
    avail: { col: "avail", type: "list", def: ["у колекції", "на продаж", "на розподілення", "позичена", "продана", "подарована"], label: "Наявність" },
    place: { col: "place", type: "list", def: ["Роттердам", "Київ"], label: "Де фізично" },
    shelf: { col: "shelf", type: "text", label: "Де шукати" },
    prio: { col: "kyiv_prio", type: "list", def: ["1", "2", "3", "4"], label: "Пріорітет" },
    genre: { col: "genre", type: "text", label: "Жанр" },
    lang: { col: "lang", type: "text", label: "Мова" },
    genres: { col: "genres", type: "tags", label: "Додаткові жанри" },
    pages: { col: "pages", type: "number", label: "Кількість сторінок" },
    price: { col: "price", type: "number", label: "Ціна, грн" },
    isbn: { col: "isbn", type: "isbn", label: "ISBN" },
    cover: { col: "cover", type: "url", label: "Обкладинка" },
    bought: { col: "bought_on", type: "date", label: "Дата покупки" },
    started: { col: "started_on", type: "date", label: "Дата початку" },
    readOn: { col: "finished_on", type: "date", label: "Дата прочитання" },
    rating: { col: "rating", type: "rating", label: "Оцінка" },
    lentTo: { col: "lent_to", type: "text", label: "Кому позичила" },
    lentOn: { col: "lent_on", type: "date", label: "Коли позичила" },
    lentDue: { col: "return_by", type: "date", label: "Повернути до" },
    parcel: { col: "kyiv_parcel", type: "list", def: ["в списку", "в дорозі"], label: "Посилка з Києва" },
    plan: { col: "plan_month", type: "month", label: "Планую читати" },
    page: { col: "cur_page", type: "number", label: "Поточна сторінка" },
    tropes: { col: "tropes", type: "tags", label: "Тропи" },
    moods: { col: "moods", type: "tags", label: "Враження" },
    orig: { col: "orig_title", type: "text", label: "Оригінальна назва" },
    src: { col: "source_url", type: "url", label: "Джерело" },
    author: { col: "author", type: "text", label: "Автор" },
    title: { col: "title", type: "text", label: "Назва книги" },
    type: { type: "list", def: ["Серія", "Одиночна"], label: "Серія" },
    series: { type: "text", label: "Назва серії" },
    num: { col: "series_num", type: "number", label: "№ серії" },
    total: { type: "number", label: "Всього" },
    pub: { col: "publisher", type: "text", label: "Видавництво" },
  },
  wish: {
    status: { type: "list", def: ["Хочу купити", "На майбутнє", "Докупити серію", "Замовлено", "Створено ТТН", "Відправлено", "Доставлено", "В бібліотеці"], label: "Статус" },
    avail: { col: "sale_status", type: "list", def: ["Є у продажу", "Анонс", "Передзамовлення", "Немає у продажу", "Не видана"], label: "Наявність" },
    cover: { col: "cover", type: "url", label: "Обкладинка" },
    author: { col: "author", type: "text", label: "Автор" },
    title: { col: "title", type: "text", label: "Назва" },
    pub: { col: "publisher", type: "text", label: "Видавництво" },
    price: { col: "price", type: "number", label: "Ціна" },
    release: { col: "release", type: "date", label: "Реліз" },
    ordered: { col: "ordered_on", type: "date", label: "Дата замовлення" },
    series: { type: "text", label: "Назва серії" },
    isSer: { type: "list", def: ["Так", "Ні"], label: "Серія" },
    part: { col: "series_num", type: "number", label: "Яка частина" },
    total: { type: "number", label: "Всього книг" },
    isbn: { col: "isbn", type: "isbn", label: "ISBN" },
    orig: { col: "orig_title", type: "text", label: "Оригінальна назва" },
    src: { col: "source_url", type: "url", label: "Джерело" },
    where: { col: "shop", type: "text", label: "Де замовлено" },
    site: { col: "shop_site", type: "text", label: "Сайт" },
    order: { col: "order_no", type: "text", label: "Номер замовлення" },
    ttn: { col: "ttn", type: "ttn", label: "ТТН" },
  },
};

/** Перевіряє значення за типом. Повертає {db: що записати в базу, show: як показати}. */
function clean(kind: string, f: string, fd: FD, value: unknown, options: Row) {
  const v = s(value);
  if (v === "") return { db: fd.type === "tags" ? [] : null, show: "" };
  switch (fd.type) {
    case "list": {
      const allowed: string[] = (options?.[kind]?.[f]) || fd.def || [];
      if (allowed.length && !allowed.includes(v)) fail(`«${v}» немає у списку для «${fd.label}».`);
      return { db: v, show: v };
    }
    case "date": { const d = isoDate(v); if (!d) fail("Дата має бути у вигляді 31.12.2026."); return { db: d, show: d, date: true }; }
    case "month": { const m = isoMonth(v); if (!m) fail("Місяць має бути у вигляді 11.2026."); return { db: m, show: m }; }
    case "rating": {
      const r = Number(v.replace(",", "."));
      if (!(r >= 1 && r <= 5) || Math.round(r * 2) !== r * 2) fail("Оцінка: від 1 до 5 (можна з половинкою).");
      return { db: r, show: r };
    }
    case "number": { const n = num(v); if (n == null || n < 0 || n > 100000) fail(`«${fd.label}»: потрібне число.`); return { db: n, show: n }; }
    case "isbn": {
      const d = v.replace(/[^0-9Xx]/g, "").toUpperCase();
      if (!(d.length === 10 || d.length === 13)) fail("ISBN має 10 або 13 цифр.");
      return { db: isbnKey(d) || d, show: d };
    }
    case "url":
      if (!/^https:\/\/[^\s"'<>]+$/.test(v) || v.length > 500) fail(`${fd.label}: потрібне посилання https://…`);
      return { db: v, show: v };
    case "ttn": {
      const d = v.replace(/[\s-]/g, "");
      if (!/^\d{14}$/.test(d)) fail("ТТН Нової пошти — це 14 цифр (наприклад 20451234567890).");
      return { db: d, show: d };
    }
    case "tags": return { db: v.split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean), show: v };
    default: return { db: v.slice(0, 200), show: v.slice(0, 200) };
  }
}

/* ---------- доступ ---------- */
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function hmac(keyBytes: Uint8Array, data: string) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
}
async function auth(initData: string, k: string) {
  const saved = Deno.env.get("LB_WEB_KEY") || "";
  if (k && saved && same(k, saved)) return "browser";
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
  return "telegram";
}

/* ---------- база ---------- */
const chk = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
async function allRows(table: string, cols = "*", filter?: (q: any) => any): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(cols).order("id").range(from, from + 999);
    if (filter) q = filter(q);
    const part = chk(await q, table) as Row[];
    out.push(...part);
    if (part.length < 1000) return out;
  }
}
async function kvGet(k: string, def: any = null) { const r = await db.from("kv").select("value").eq("key", k).maybeSingle(); return r.data?.value ?? def; }
async function kvSet(k: string, value: any) { chk(await db.from("kv").upsert({ key: k, value, updated_at: new Date().toISOString() }), "kv"); }
async function log(action: string, title: unknown, author: unknown, details: unknown, bookId?: number | null) {
  await db.from("log").insert({ action, title: s(title), author: s(author), details: s(details).slice(0, 1000), book_id: bookId ?? null });
}
async function getBook(id: unknown, kinds: string[]) {
  const n = Number(id);
  if (!n) fail("Не знайшла книгу. Оновіть сторінку.");
  const b = chk(await db.from("books").select("*").eq("id", n).maybeSingle(), "books") as Row | null;
  if (!b || !kinds.includes(b.stage)) fail("Книгу не знайдено: можливо, її перенесли або видалили. Оновіть сторінку.");
  return b!;
}
async function ensureCatalog(isbn: string | null, b: Row) {
  if (!isbn) return;
  await db.from("catalog").upsert({ isbn, title: b.title ?? null, author: b.author ?? null, publisher: b.publisher ?? null }, { onConflict: "isbn", ignoreDuplicates: true });
}
/** Серія за назвою й автором; створює, якщо немає. */
async function seriesId(name: unknown, author: unknown, total?: unknown): Promise<number | null> {
  const n = s(name);
  if (!n || n === "-") return null;
  const list = chk(await db.from("series").select("id,name,author,total").ilike("name", n), "series") as Row[];
  const a = norm(author);
  const hit = list.find((x) => norm(x.author) === a) || list.find((x) => a.split(" ").some((w) => w.length > 3 && norm(x.author).includes(w.slice(0, -2)))) || (list.length === 1 ? list[0] : null);
  const t = num(total);
  if (hit) { if (t && t !== hit.total) await db.from("series").update({ total: t }).eq("id", hit.id); return hit.id; }
  const made = chk(await db.from("series").insert({ name: n, author: s(author), total: t }).select("id").single(), "series") as Row;
  await log("📚 Створено серію", n, author, "Додано з додатку");
  return made.id;
}
/** Чи вільний ISBN (у живих записах він має бути один). */
async function isbnOwner(isbn: string, exceptId?: number) {
  if (!isbn) return null;
  const r = chk(await db.from("books").select("id,stage,title,author,wish_kind").eq("isbn", isbn).not("stage", "in", "(sold,gifted)"), "books") as Row[];
  return r.find((x) => x.id !== exceptId) || null;
}

/* ---------- читання: та сама форма, що lbReadAll_ ---------- */
const yesNo = (v: boolean | null | undefined) => (v === true ? "Так" : v === false ? "Ні" : "");
const tags = (a: unknown) => (Array.isArray(a) ? a.join(", ") : s(a));
async function readAll() {
  const [rows, series, kvRows, logRows] = await Promise.all([
    allRows("books"), allRows("series"),
    db.from("kv").select("key,value").in("key", ["goals", "shelf_marks", "news", "options", "series_catalog"]),
    db.from("log").select("at,action,title,author,details").order("id", { ascending: false }).limit(30),
  ]);
  const kv: Row = Object.fromEntries(((kvRows.data ?? []) as Row[]).map((r) => [r.key, r.value]));
  const ser = new Map<number, Row>(series.map((x) => [x.id, x]));
  const books: Row[] = [], wish: Row[] = [], sold: Row[] = [];
  let n = 0;
  rows.sort((a, b) => (a.author || "").localeCompare(b.author || "", "uk") || (ser.get(a.series_id)?.name || "").localeCompare(ser.get(b.series_id)?.name || "", "uk") || (Number(a.series_num) || 0) - (Number(b.series_num) || 0) || (a.title || "").localeCompare(b.title || "", "uk"));
  for (const b of rows) {
    const sr = b.series_id ? ser.get(b.series_id) : null;
    const L = b.legacy || {};
    if (L.sold_sheet) {
      sold.push({ author: b.author, series: sr?.name || "", title: b.title, num: b.series_num ?? "", status: b.read_status, price: b.sold_price, date: b.sold_on });
      continue;
    }
    if (LIB_STAGES.includes(b.stage)) {
      books.push({
        row: b.id, bid: L.id || "", n: String(++n), author: b.author, type: sr ? "Серія" : "Одиночна", series: sr?.name || "-", title: b.title,
        pub: b.publisher || "", num: b.series_num ?? "", total: sr?.total ?? "", genre: b.genre || "", genres: tags(b.genres), pages: b.pages,
        lang: b.lang || "", status: b.read_status, finished: sr ? yesNo(sr.finished) : "—", translated: sr ? yesNo(sr.full_ua) : "—",
        avail: b.avail, place: b.place, shelf: b.shelf || "", prio: b.kyiv_prio || "", price: b.price == null ? null : Number(b.price),
        isbn: b.isbn || "", cover: b.cover || "", bought: b.bought_on, started: b.started_on, readOn: b.finished_on,
        rating: b.rating == null ? null : Number(b.rating), lentTo: b.lent_to || "", lentOn: b.lent_on, lentDue: b.return_by,
        parcel: b.kyiv_parcel || "", plan: b.plan_month || null, page: b.cur_page, tropes: tags(b.tropes), moods: tags(b.moods),
        orig: b.orig_title || "", src: b.source_url || "",
      });
    } else if (WISH_STAGES.includes(b.stage)) {
      wish.push({
        row: b.id, author: b.author, series: sr?.name || "", title: b.title, price: b.price == null ? null : Number(b.price),
        status: b.stage === "wish" ? b.wish_kind || "Хочу купити" : STAGE_STATUS[b.stage], pub: b.publisher || "", isSeries: sr ? "Так" : "Ні",
        avail: b.sale_status || "", part: b.series_num ?? "", total: sr?.total ?? "", release: b.release, releaseText: b.release ? human(b.release) : (L.release_text || ""),
        where: b.shop || "", site: b.shop_site || "", order: b.order_no || "", ttn: b.ttn || "", np: b.np_status || "",
        npCheck: b.np_checked ? new Date(b.np_checked).toLocaleString("uk-UA", { timeZone: TZ }) : L.np_check || "", npErr: b.np_error || "",
        cover: b.cover || "", ordered: b.ordered_on, isbn: b.isbn || "", orig: b.orig_title || "", src: b.source_url || "", bid: L.id || "",
      });
    }
  }
  const lg = ((logRows.data ?? []) as Row[]).map((r) => [new Date(r.at).toLocaleString("uk-UA", { timeZone: TZ }), r.action, r.title || "", r.author || "", r.details || ""]);
  const cols: Row = {};
  for (const f of ["place", "isbn", "cover", "bought", "started", "readOn", "rating", "lentTo", "lentOn", "lentDue", "parcel", "plan", "page", "tropes", "moods", "orig", "src"]) cols[f] = true;
  Object.assign(cols, { wishCover: true, wishOrdered: true, wishIsbn: true, wishOrig: true, wishSrc: true });
  return {
    today: today(), hasBought: true, hasSale: true, cols, options: kv.options || {}, goals: kv.goals || {}, shelfMarks: kv.shelf_marks || {},
    news: kv.news || [], pubCanon: PUBLISHERS, db: true,
    books, wish,
    series: series.map((x) => ({ author: x.author, name: x.name, total: x.total, finished: yesNo(x.finished), translated: yesNo(x.full_ua), pub: x.publisher || "" })),
    catalog: kv.series_catalog || [], sold, log: lg,
  };
}

/* ---------- зміни ---------- */
async function saveOne(options: Row, ch: Row) {
  const kind = ch?.kind;
  const cfg = FIELDS[kind];
  if (!cfg) fail("Невідомий лист.");
  const b = await getBook(ch.row, kind === "wish" ? WISH_STAGES : LIB_STAGES);
  const upd: Row = {}, values: Row = {}, notes: string[] = [];
  const set: Row = ch.set || {};
  let serName: string | null | undefined, serTotal: unknown, serOff = false;
  for (const f of Object.keys(set)) {
    const fd = cfg[f];
    if (!fd) fail(`Поле «${f}» не можна змінювати з додатку.`);
    const c = clean(kind, f, fd, f === "pub" ? pubCanon(set[f]) : set[f], options);
    values[f] = c.show;
    if (f === "status" && kind === "wish") {
      const v = s(c.db);
      if (!v || WISH_KINDS.includes(v)) { upd.stage = "wish"; upd.wish_kind = v || "Хочу купити"; }
      else { upd.stage = STATUS_STAGE[v]; upd.wish_kind = null; }
      notes.push(`Статус: ${b.stage === "wish" ? b.wish_kind : STAGE_STATUS[b.stage]} → ${v || "—"}`);
      continue;
    }
    if (f === "avail" && kind === "library") { upd.stage = c.db === "продана" ? "sold" : c.db === "подарована" ? "gifted" : "library"; }
    if (f === "series") { serName = s(c.db); continue; }
    if (f === "total") { serTotal = c.db; continue; }
    if (f === "type" || f === "isSer") { if (c.db === "Одиночна" || c.db === "Ні") serOff = true; continue; }
    if (f === "isbn" && c.db) {
      const own = await isbnOwner(String(c.db), b.id);
      if (own) fail(`ISBN ${c.db} уже має «${own.title}».`);
      await ensureCatalog(String(c.db), { ...b, ...upd });
    }
    const old = b[fd.col!];
    upd[fd.col!] = c.db;
    const oldShow = Array.isArray(old) ? old.join(", ") : old == null ? "" : String(old);
    if (f !== "cover" && oldShow !== String(c.show)) notes.push(`${fd.label}: ${oldShow ? (c.date ? human(oldShow) : oldShow) : "—"} → ${c.show === "" ? "—" : c.date ? human(String(c.show)) : c.show}`);
  }
  if (serOff) upd.series_id = null;
  else if (serName !== undefined || serTotal !== undefined) {
    const cur = b.series_id ? (chk(await db.from("series").select("name").eq("id", b.series_id).maybeSingle(), "series") as Row | null)?.name : null;
    const name = serName !== undefined ? serName : cur;
    upd.series_id = await seriesId(name, upd.author ?? b.author, serTotal);
    if (serName !== undefined && name !== cur) notes.push(`Назва серії: ${cur || "—"} → ${name || "—"}`);
  }
  if (kind === "wish" && upd.stage === "ordered" && !("ordered_on" in upd) && !b.ordered_on) {
    upd.ordered_on = today(); values.ordered = upd.ordered_on; notes.push(`Дата замовлення: ${human(upd.ordered_on)}`);
  }
  // ТТН додали вручну: скидаємо старий статус НП; замовлена/бажана книга стає «Створено ТТН», далі статус веде Нова пошта
  const newTtn = kind === "wish" && "ttn" in upd && upd.ttn !== (b.ttn ?? null);
  if (newTtn) {
    upd.np_status = null; upd.np_error = null; upd.np_checked = null;
    if (upd.ttn && ["wish", "ordered"].includes(upd.stage ?? b.stage)) { upd.stage = "ttn"; upd.wish_kind = null; values.status = STAGE_STATUS.ttn; notes.push(`Статус → ${STAGE_STATUS.ttn}`); }
  }
  if (Object.keys(upd).length) chk(await db.from("books").update(upd).eq("id", b.id), "books");
  if (newTtn && upd.ttn) {
    // одразу питаємо Нову пошту (якщо ключ NP_API_KEY уже додано), щоб у картці був свіжий статус
    try {
      const tok = await kvGet("import_token", "");
      await Promise.race([
        fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/np", { method: "POST", headers: { "Content-Type": "application/json", "x-import-token": String(tok) }, body: JSON.stringify({ ids: [b.id] }) }).then((r) => r.text()),
        new Promise((r) => setTimeout(r, 15000)),
      ]);
      const fresh = chk(await db.from("books").select("stage,np_status,np_checked,np_error").eq("id", b.id).maybeSingle(), "books") as Row | null;
      if (fresh) { values.status = STAGE_STATUS[fresh.stage] || values.status; values.np = fresh.np_status || ""; values.npErr = fresh.np_error || ""; }
    } catch { /* статус підтягнеться щогодини */ }
  }
  if (notes.length) await log("✏️ Змінено в додатку", upd.title ?? b.title, upd.author ?? b.author, notes.join("; "), b.id);
  return { row: b.id, values };
}

async function apiSave(changes: Row[]) {
  if (!changes?.length) fail("Немає що зберігати.");
  if (changes.length > 60) fail("Забагато книг за раз (до 60).");
  const options = await kvGet("options", {});
  const out = [];
  for (const ch of changes) out.push(await saveOne(options, ch));
  return out;
}

async function apiAddBook(req: Row) {
  const b: Row = req?.book || {};
  if (!s(b.author) || !s(b.title)) fail("Заповніть автора і назву.");
  const options = await kvGet("options", {});
  const isSeries = b.type === "Серія";
  const sid = isSeries ? await seriesId(b.series, b.author, b.total) : null;
  // дублікат: той самий автор + назва + серія (+ видавництво)
  const lib = chk(await db.from("books").select("id,author,title,series_id,publisher,isbn,legacy").in("stage", LIB_STAGES), "books") as Row[];
  if (!req.force) {
    const dup = lib.find((r) => norm(r.author) === norm(b.author) && norm(r.title) === norm(b.title) && (r.series_id ?? null) === (sid ?? null) && (!b.pub || norm(r.publisher) === norm(pubCanon(b.pub))));
    if (dup) return { duplicate: true, row: dup.id };
    const ik = isbnKey(b.isbn);
    const ih = ik && lib.find((r) => r.isbn === ik);
    if (ih) return { duplicate: true, row: ih.id, byIsbn: true, title: ih.title };
  }
  // запис бажанки стає книгою бібліотеки (один запис на книгу)
  let target: Row | null = null;
  if (req.wish?.row) { try { target = await getBook(req.wish.row, WISH_STAGES); } catch { target = null; } }
  const ik = isbnKey(b.isbn);
  if (!target && ik) { const own = await isbnOwner(ik); if (own && WISH_STAGES.includes(own.stage)) target = await getBook(own.id, WISH_STAGES); }
  const row: Row = {
    stage: "library", wish_kind: null, author: s(b.author), title: s(b.title), series_id: sid, series_num: isSeries ? num(b.num) : null,
    publisher: pubCanon(b.pub) || null, read_status: b.status || "не читала",
  };
  const F = FIELDS.library;
  for (const f of ["genre", "lang", "genres", "pages", "price", "avail", "place", "shelf", "prio", "isbn", "cover", "bought", "status", "plan", "orig", "src"]) {
    if (b[f] === "" || b[f] == null) continue;
    row[F[f].col!] = clean("library", f, F[f], b[f], options).db;
  }
  if (row.avail === "продана") row.stage = "sold";
  if (row.avail === "подарована") row.stage = "gifted";
  if (target && !row.bought_on && target.ordered_on) row.bought_on = target.ordered_on;
  if (row.isbn) {
    const own = await isbnOwner(row.isbn, target?.id);
    if (own) row.isbn = null; else await ensureCatalog(row.isbn, row);
  }
  let id: number, wishNote = "";
  if (target) {
    for (const k of Object.keys(row)) if (row[k] == null && target[k] != null && k !== "wish_kind") delete row[k];
    chk(await db.from("books").update(row).eq("id", target.id), "books");
    id = target.id; wishNote = req.removeWish ? "removed" : "marked";
  } else {
    row.legacy = { id: await newId() };
    id = (chk(await db.from("books").insert(row).select("id").single(), "books") as Row).id;
    if (req.wish?.title) wishNote = "not-found";
  }
  await log("➕ Додано з додатку", b.title, b.author, [b.avail, b.place, b.shelf, b.prio ? "пріоритет " + b.prio : ""].filter(Boolean).join(", "), id);
  return { row: id, wish: wishNote, tidy: { done: [], skipped: [] } };
}

/** ID книги у форматі K00001 (як у v13). */
async function newId() {
  let seq = Number(await kvGet("id_seq", 0));
  if (!seq) {
    const all = await allRows("books", "id,legacy");
    seq = all.reduce((m, r) => Math.max(m, Number(String(r.legacy?.id || "").replace(/\D/g, "")) || 0), 0);
  }
  seq++;
  await kvSet("id_seq", seq);
  return "K" + String(seq).padStart(5, "0");
}

async function apiAddWish(req: Row) {
  req = req || {};
  if (!s(req.title) || !s(req.author)) fail("Потрібні автор і назва.");
  const wishes = chk(await db.from("books").select("id,author,title,series_id,series_num").in("stage", WISH_STAGES), "books") as Row[];
  const sid = req.series ? await seriesId(req.series, req.author, req.total) : null;
  const dup = wishes.find((r) => norm(r.author) === norm(req.author) && (norm(r.title) === norm(req.title) || (sid && r.series_id === sid && String(r.series_num) === String(num(req.part)))));
  if (dup) return { duplicate: true, row: dup.id };
  const ik = isbnKey(req.isbn);
  if (ik) {
    const own = await isbnOwner(ik);
    if (own && LIB_STAGES.includes(own.stage) && !req.force) return { inLibrary: true, row: own.id, title: own.title };
    if (own && WISH_STAGES.includes(own.stage)) return { duplicate: true, row: own.id, byIsbn: true, title: own.title };
  }
  const status = s(req.status) || (req.series ? "Докупити серію" : "Хочу купити");
  const row: Row = {
    stage: WISH_KINDS.includes(status) ? "wish" : STATUS_STAGE[status] || "wish", wish_kind: WISH_KINDS.includes(status) ? status : null,
    author: s(req.author), title: s(req.title), series_id: sid, series_num: num(req.part), publisher: pubCanon(req.pub) || null,
    isbn: ik || null, legacy: { id: await newId() },
  };
  if (row.stage === "wish" && !row.wish_kind) row.wish_kind = "Хочу купити";
  await ensureCatalog(row.isbn, row);
  const id = (chk(await db.from("books").insert(row).select("id").single(), "books") as Row).id;
  await log("🛒 Додано в бажанки з додатку", req.title, req.author, req.series ? req.series + (req.part ? " #" + req.part : "") : "", id);
  return { ok: true, row: id };
}

async function apiOrder(req: Row) {
  req = req || {};
  const items: Row[] = (req.items || []).filter((x: Row) => x && s(x.title));
  if (!items.length) fail("Немає жодної книги в замовленні.");
  for (const x of items) if (!s(x.author)) fail(`Вкажіть автора для «${x.title}».`);
  const isWish = req.mode === "wish";
  const od = /^\d{4}-\d{2}-\d{2}$/.test(s(req.date)) ? s(req.date) : today();
  const wishes = chk(await db.from("books").select("id,author,title,isbn,ordered_on,orig_title,source_url,stage").in("stage", WISH_STAGES), "books") as Row[];
  const out = { updated: 0, added: 0, rows: [] as number[], inLib: [] as string[] };
  for (const x of items) {
    const xk = isbnKey(x.isbn);
    let w = wishes.find((r) => r.id === Number(x.row) && norm(r.title) === norm(x.title)) ||
      wishes.find((r) => norm(r.title) === norm(x.title) && (!x.author || norm(r.author) === norm(x.author))) ||
      (xk ? wishes.find((r) => r.isbn === xk) : undefined);
    if (xk) { const own = await isbnOwner(xk); if (own && LIB_STAGES.includes(own.stage)) out.inLib.push(own.title); }
    const set: Row = {};
    if (!isWish) { set.stage = "ordered"; set.wish_kind = null; }
    if (x.price !== "" && x.price != null) set.price = num(x.price);
    const av = x.avail || req.avail; if (av) set.sale_status = av;
    const rel = s(x.release).match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/); if (rel) set.release = `${rel[1]}-${rel[2]}-${rel[3] || "01"}`;
    if (req.where) set.shop = s(req.where);
    if (req.site) set.shop_site = s(req.site);
    if (req.num) set.order_no = s(req.num);
    const src = /^https:\/\//.test(s(x.src)) ? s(x.src) : "";
    const detail = [req.where, req.num ? "№" + req.num : "", set.price != null ? set.price + " грн" : ""].filter(Boolean).join(" · ");
    if (w) {
      if (!isWish && (req.date || !w.ordered_on)) set.ordered_on = od;
      if (xk && !w.isbn && !(await isbnOwner(xk, w.id))) { await ensureCatalog(xk, { title: w.title, author: w.author }); set.isbn = xk; }
      if (s(x.orig) && !w.orig_title) set.orig_title = s(x.orig);
      if (src && !w.source_url) set.source_url = src;
      chk(await db.from("books").update(set).eq("id", w.id), "books");
      out.updated++; out.rows.push(w.id);
      await log(isWish ? "＋ Бажанка оновлена (з додатку)" : "🧾 Замовлено (з додатку)", x.title, w.author, detail, w.id);
    } else {
      const row: Row = {
        stage: isWish ? "wish" : "ordered", wish_kind: isWish ? "Хочу купити" : null, author: s(x.author), title: s(x.title),
        series_id: x.series ? await seriesId(x.series, x.author, x.total) : null, series_num: num(x.part), publisher: pubCanon(x.pub) || null,
        orig_title: s(x.orig) || null, source_url: src || null, ...set, legacy: { id: await newId() },
      };
      row.stage = isWish ? "wish" : "ordered";
      row.wish_kind = isWish ? "Хочу купити" : null;
      if (!isWish) row.ordered_on = od;
      if (xk && !(await isbnOwner(xk))) { await ensureCatalog(xk, row); row.isbn = xk; }
      const id = (chk(await db.from("books").insert(row).select("id").single(), "books") as Row).id;
      wishes.push({ id, ...row });
      out.added++; out.rows.push(id);
      await log(isWish ? "＋ Нова бажанка (з додатку)" : "🧾 Замовлено, додано в бажанки (з додатку)", x.title, x.author, [req.where, req.num ? "№" + req.num : ""].filter(Boolean).join(" · "), id);
    }
  }
  return out;
}

async function apiDelete(req: Row, kinds: string[], action: string) {
  const b = await getBook(req?.row, kinds);
  const snap = Object.entries(b).filter(([k, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length) && !["created_at", "updated_at"].includes(k))
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(" | ").slice(0, 1000);
  chk(await db.from("books").delete().eq("id", b.id), "books");
  await log(action, b.title, b.author, req?.reason ? s(req.reason).slice(0, 100) + " | " + snap : snap);
  return { row: b.id };
}

async function apiShelfMark(req: Row) {
  const sh = s(req?.shelf).slice(0, 80);
  if (!sh) fail("Немає полиці.");
  const m: Row = await kvGet("shelf_marks", {}) || {};
  if (!req.k || req.k === "none") delete m[sh];
  else if (["open", "full", "only"].includes(req.k)) m[sh] = { k: req.k, note: s(req.note).slice(0, 60) };
  await kvSet("shelf_marks", m);
  return m;
}
async function apiSetGoals(g: Row) {
  const out: Row = {};
  for (const k of ["month", "year"]) { const n = Math.round(Number(g?.[k])); if (n > 0 && n < 1000) out[k] = n; }
  await kvSet("goals", out);
  return out;
}

/** Пошукові дії поки що виконує Apps Script (нічого не пише в базу, лише відповідає). */
const PROXY = ["lbApiOcr", "lbApiAi", "lbApiGenre", "lbApiCoverUpload", "lbApiOfficial", "lbApiTropes", "lbApiSeriesCheck", "lbApiFromLink", "lbApiNews"];
async function proxy(fn: string, args: unknown[]) {
  const k = Deno.env.get("LB_WEB_KEY");
  const r = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ fn, args, key: k }) });
  const res = await r.json();
  if (!res?.ok) fail(res?.error || "Не вдалося");
  if (fn === "lbApiNews" && Array.isArray(res.data)) await kvSet("news", res.data);
  return res.data;
}

/** Дані про книгу: спершу каталог бази, потім MEGOGO Books (за ISBN або назвою й автором), а чого бракує — пошук Apps Script (Goodreads, Google Books). */
async function apiLookup(q: Row) {
  q = q || {};
  const isbn = isbnKey(q.isbn) || String(q.isbn || "").replace(/[^0-9Xx]/g, "");
  const title = s(q.title), author = s(q.author);
  const out: Row = {}, sources: string[] = [];
  const add = (r: Row | null, src: string) => {
    if (!r) return;
    const map: Row = { title: r.title, author: r.author, cover: r.cover, pages: r.pages, isbn: r.isbn, pub: r.publisher ? pubCanon(r.publisher) : r.pub,
      seriesName: r.series ?? r.seriesName, seriesNum: r.series_num ?? r.seriesNum, description: r.description, language: r.lang ?? r.language,
      orig: r.orig_title ?? r.orig, release: r.release, price: r.price, avail: r.avail, url: r.url, genresRaw: r.genresRaw };
    let used = false;
    for (const [k, v] of Object.entries(map)) if (v != null && v !== "" && !(Array.isArray(v) && !v.length) && (out[k] == null || out[k] === "")) { out[k] = v; used = true; }
    if (used && !sources.includes(src)) sources.push(src);
  };
  if (isbn) {
    const c = chk(await db.from("catalog").select("*").eq("isbn", isbn).maybeSingle(), "catalog") as Row | null;
    if (c?.fetched_at && c.sources?.urls) add({ ...c, url: c.sources.urls[0] }, (c.sources.title || "каталог") + " (каталог)");
  }
  const pub = isbn ? "" : s(q.pub); // вписаний ISBN точніший за видавництво
  if (!out.cover || !out.title) {
    let mg = await fromMegogo(isbn, title, author, pub).catch(() => null);
    if (!mg || mg.pubMismatch) {
      const y = await fromYakaboo(title, author, pub).catch(() => null);
      if (y && !y.pubMismatch) mg = y;
    }
    if (mg?.pubMismatch) {
      // знайшлося лише видання іншого видавництва: ISBN, обкладинку, ціну не підставляємо — лише те, що спільне для твору
      add({ orig_title: mg.orig_title, description: mg.description }, mg.source);
      out.otherEdition = { pub: pubCanon(mg.publisher), title: mg.title, url: mg.url };
      out.sources = sources.length ? sources : [mg.source];
      return out;
    }
    if (mg) {
      add(mg, mg.source || "MEGOGO Books");
      const k = isbnKey(mg.isbn);
      if (k) await db.from("catalog").upsert({ isbn: k, title: mg.title, author: mg.author, publisher: mg.publisher, pages: mg.pages, cover: mg.cover, series: mg.series, series_num: mg.series_num,
        description: mg.description, orig_title: mg.orig_title, genres: mg.genres || [], lang: mg.lang, year: mg.year, release: mg.release, rating: mg.rating,
        sources: { title: mg.source || "MEGOGO Books", urls: [mg.url] }, fetched_at: new Date().toISOString() }, { onConflict: "isbn" });
    }
  }
  if (pub && out.pub && !samePub(pub, out.pub)) { out.otherEdition = { pub: out.pub, title: out.title, url: out.url }; return { orig: out.orig, description: out.description, otherEdition: out.otherEdition, sources }; }
  if (!out.cover || !out.description || !out.pages) {
    try { const r = await proxy("lbApiLookup", [{ isbn: out.isbn || isbn, title: out.title || title, author: author || out.author }]) as Row; if (r && !r.notFound && !(pub && r.pub && !samePub(pub, r.pub))) add(r, (r.sources || []).join(", ") || "Goodreads"); } catch { /* */ }
  }
  if (!sources.length) return { notFound: true, sources: ["MEGOGO Books", "Goodreads"] };
  out.sources = sources;
  return out;
}

const API: Record<string, (...a: any[]) => Promise<unknown>> = {
  lbApiLookup: (q: Row) => apiLookup(q),
  lbApiData: () => readAll(),
  lbApiSave: (changes: Row[]) => apiSave(changes),
  lbApiUpdate: async (ch: Row) => {
    const r = await apiSave([{ kind: ch?.kind, row: ch?.row, author: ch?.author, title: ch?.title, set: { [ch?.field]: ch?.value ?? "" } }]);
    return { row: r[0].row, value: r[0].values[ch.field] };
  },
  lbApiAddBook: (req: Row) => apiAddBook(req),
  lbApiAddWish: (req: Row) => apiAddWish(req),
  lbApiOrder: (req: Row) => apiOrder(req),
  lbApiDeleteWish: (req: Row) => apiDelete(req, WISH_STAGES, "🗑 Видалено з бажанок"),
  lbApiDeleteBook: (req: Row) => apiDelete(req, LIB_STAGES, "🗑 Видалено з бібліотеки"),
  lbApiShelfMark: (req: Row) => apiShelfMark(req),
  lbApiSetGoals: (g: Row) => apiSetGoals(g),
  lbApiAutoFill: async () => ({ started: false, note: "У новій базі дані про книги доповнюються самі, кнопка не потрібна." }),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const reply = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const body = JSON.parse((await req.text()) || "{}");
    const fn = s(body.fn);
    const args = Array.isArray(body.args) ? body.args : [];
    if (!API[fn] && !PROXY.includes(fn)) fail("Невідома дія.");
    // службова перевірка (лише з самої бази через pg_net): заголовок x-import-token = kv.import_token
    const svc = req.headers.get("x-import-token");
    if (!(svc && svc === (await kvGet("import_token", "")))) await auth(s(body.initData), s(body.key));
    const data = API[fn] ? await API[fn](...args) : await proxy(fn, args);
    return reply({ ok: true, data });
  } catch (e) {
    const msg = e instanceof UserError ? e.message : "Помилка бази: " + String((e as Error)?.message ?? e);
    if (!(e instanceof UserError)) console.error(e);
    return reply({ ok: false, error: msg });
  }
});
