// API сайту «Моя бібліотека» на базі Supabase. Ті самі назви дій і та сама відповідь, що й у doPost з Apps Script,
// тож сайт змінює лише адресу. Дії, що лише шукають в інтернеті (Gemini, MEGOGO, OCR), поки що виконує Apps Script.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { fromMegogo } from "../_shared/megogo.ts";
import { fromYakaboo } from "../_shared/yakaboo.ts";
import { PUBLISHERS, pubCanon, samePub } from "../_shared/pub.ts";
import { streakInfo, STREAK_DEFAULT } from "../_shared/streak.ts";
import { AsyncLocalStorage } from "node:async_hooks";
import { whoIs, AuthError, randomToken, sha256, type Who } from "../_shared/auth.ts";

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwzMBurJfPgrKJY2H99pHG7BN7axnxWIFC3p1cHjno3Q0bKywZP71_KDC2vBd9qfUi1/exec";
const TZ = "Europe/Kyiv";
const raw = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
/* ---------- чиї дані (етап 4, 16.11) ----------
   Кожен запит виконується від імені однієї людини (ctx.uid). Особисті таблиці автоматично фільтруються за owner_id,
   а нові записи отримують owner_id. Каталог спільний. Службові виклики (боти, крони) — від імені власниці (1). */
const ctx = new AsyncLocalStorage<Who>();
const me = (): Who => ctx.getStore() || { uid: 1, role: "owner", name: "", via: "service" };
const uid = () => me().uid;
const PERSONAL = new Set(["books", "series", "wish_found", "log", "reading_log"]);
const withOwner = (v: any, u: number) => Array.isArray(v) ? v.map((x) => ({ ...x, owner_id: u })) : { ...v, owner_id: u };
const db: any = {
  from(table: string) {
    const q: any = raw.from(table);
    if (!PERSONAL.has(table)) return q;
    const u = uid();
    return {
      select: (...a: any[]) => q.select(...a).eq("owner_id", u),
      update: (v: any, o?: any) => q.update(v, o).eq("owner_id", u),
      delete: (o?: any) => q.delete(o).eq("owner_id", u),
      insert: (v: any, o?: any) => q.insert(withOwner(v, u), o),
      upsert: (v: any, o?: any) => q.upsert(withOwner(v, u), o),
    };
  },
};
/** Особисті ключі kv: у власниці без суфікса (як було), у друзів — key@u<id>. */
const PERSONAL_KV = new Set(["goals", "shelf_marks", "news", "news_state", "options", "profile", "streak", "series_catalog", "streak_sent", "streak_ask", "bot_pending", "onsale_today", "last_remind"]);
const kk = (k: string) => (PERSONAL_KV.has(k) && uid() !== 1 ? `${k}@u${uid()}` : k);
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

/* ---------- доступ: див. _shared/auth.ts ---------- */
const PAGE = "https://doragolum.github.io/library/";
async function botName() {
  const c = (await raw.from("kv").select("value").eq("key", "bot_username").maybeSingle()).data?.value;
  if (c) return String(c);
  const tok = Deno.env.get("LB_TG_TOKEN");
  const r = tok ? await fetch(`https://api.telegram.org/bot${tok}/getMe`).then((x) => x.json()).catch(() => null) : null;
  const n = r?.result?.username || "";
  if (n) await raw.from("kv").upsert({ key: "bot_username", value: n, updated_at: new Date().toISOString() });
  return n;
}
/** Вхід через Телеграм, крок 1: сайт отримує одноразовий код і посилання на бота. Запрошення потрібне лише новим людям. */
async function authStart(p: Row) {
  const code = s(p?.invite);
  if (code) {
    const inv = (await raw.from("invites").select("code,used_by,revoked").eq("code", code).maybeSingle()).data;
    if (!inv || inv.revoked) fail("Запрошення не знайдено або його скасували. Попроси нове посилання.");
  }
  const bot = await botName();
  if (!bot) fail("Бот ще не підключено.");
  const nonce = randomToken(18);
  chk(await raw.from("login_requests").insert({ nonce, invite: code || null }), "login_requests");
  return { nonce, url: `https://t.me/${bot}?start=login_${nonce}`, bot };
}
/** Крок 2: сайт питає, чи бот уже підтвердив вхід. Якщо так — видає сесію (один раз). */
async function authPoll(p: Row) {
  const nonce = s(p?.nonce);
  const r = (await raw.from("login_requests").select("*").eq("nonce", nonce).maybeSingle()).data;
  if (!r || Date.now() - new Date(r.created_at).getTime() > 15 * 60e3) fail("Код входу застарів. Спробуй ще раз.");
  if (r.taken_at) fail("Цей вхід уже використано. Спробуй ще раз.");
  if (!r.confirmed_at || !r.user_id) return { wait: true };
  await raw.from("login_requests").update({ taken_at: new Date().toISOString() }).eq("nonce", nonce);
  return newSession(r.user_id, p?.agent);
}
/** Видає сесію людині (спільне для Телеграму й пошти). */
async function newSession(userId: number, agent: unknown) {
  const token = randomToken(32);
  chk(await raw.from("sessions").insert({ user_id: userId, token_hash: await sha256(token), agent: s(agent).slice(0, 200) || null }), "sessions");
  const u = (await raw.from("app_users").select("id,name,role").eq("id", userId).maybeSingle()).data;
  return { session: token, user: u };
}
/** Вхід поштою, крок 1: Supabase надсилає лист із посиланням (вбудована пошта Supabase, кілька листів на годину).
    Нова людина — лише із запрошенням; той, хто вже є, — просто за поштою. */
async function authEmailStart(p: Row) {
  const email = s(p?.email).toLowerCase(), code = s(p?.invite);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Перевір адресу пошти.");
  const known = (await raw.from("app_users").select("id").ilike("email", email).maybeSingle()).data;
  if (!known) {
    if (!code) fail("Shelfie поки працює за запрошенням. Відкрий посилання-запрошення й увійди звідти.");
    const inv = (await raw.from("invites").select("code,used_by,revoked").eq("code", code).maybeSingle()).data;
    if (!inv || inv.revoked || inv.used_by) fail("Запрошення вже використане або скасоване. Попроси нове посилання.");
  }
  chk(await raw.from("login_requests").insert({ nonce: randomToken(18), invite: known ? null : code, email }), "login_requests");
  const r = await raw.auth.signInWithOtp({ email, options: { emailRedirectTo: PAGE, shouldCreateUser: true } });
  if (r.error) fail(/rate|limit/i.test(r.error.message) ? "Забагато листів за годину. Спробуй трохи пізніше або увійди через Телеграм." : "Лист не надіслано: " + r.error.message);
  return { sent: true };
}
/** Крок 2: людина натиснула посилання в листі; сайт передає токен Supabase, ми перевіряємо його й видаємо свою сесію. */
async function authEmailFinish(p: Row) {
  const g = await raw.auth.getUser(s(p?.access_token));
  const email = s(g.data?.user?.email).toLowerCase();
  if (g.error || !email) fail("Посилання з листа застаріло. Надішли новий лист.");
  let user = (await raw.from("app_users").select("id,name").ilike("email", email).maybeSingle()).data as Row | null;
  if (!user) {
    const reqs = (await raw.from("login_requests").select("invite,created_at").ilike("email", email).not("invite", "is", null).order("created_at", { ascending: false }).limit(1)).data || [];
    const inv = reqs[0] ? (await raw.from("invites").select("*").eq("code", reqs[0].invite).maybeSingle()).data : null;
    if (!inv || inv.revoked || inv.used_by) fail("Shelfie поки працює за запрошенням, а це запрошення вже використане або скасоване.");
    const name = email.split("@")[0].slice(0, 40);
    user = chk(await raw.from("app_users").insert({ name, role: "user", email, invited_by: inv.created_by }).select("id,name").single(), "app_users") as Row;
    await raw.from("invites").update({ used_by: user.id, used_at: new Date().toISOString() }).eq("code", inv.code);
    await raw.from("log").insert({ action: "👥 Нова людина в Shelfie", title: name, details: "Увійшла поштою за запрошенням" + (inv.note ? " (" + inv.note + ")" : ""), owner_id: 1 });
    const tok = Deno.env.get("LB_TG_TOKEN"), chat = Deno.env.get("LB_TG_CHAT_ID") || Deno.env.get("LB_TG_USER_ID");
    if (tok && chat) await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: Number(chat), text: "👥 У Shelfie нова людина (пошта): " + name + (inv.note ? " (запрошення «" + inv.note + "»)" : "") }) }).catch(() => {});
  }
  return newSession(user!.id, p?.agent);
}
function ownerOnly() { if (me().role !== "owner") fail("Це може лише власниця Shelfie."); }
/** Запрошення (лише власниця): list / create {note} / revoke {code}. */
async function apiInvites(p: Row) {
  ownerOnly();
  const act = s(p?.act);
  if (act === "create") {
    const code = randomToken(9);
    chk(await raw.from("invites").insert({ code, created_by: uid(), note: s(p?.note).slice(0, 80) || null }), "invites");
    await log("👥 Запрошення створено", s(p?.note), "", "Посилання для нової людини", null);
  } else if (act === "revoke") {
    chk(await raw.from("invites").update({ revoked: true }).eq("code", s(p?.code)).is("used_by", null), "invites");
    await log("👥 Запрошення скасовано", "", "", s(p?.code).slice(0, 4) + "…", null);
  } else if (act !== "list") fail("Невідома дія.");
  const rows = chk(await raw.from("invites").select("code,note,created_at,used_at,revoked,app_users!invites_used_by_fkey(name)").order("created_at", { ascending: false }).limit(50), "invites") as Row[];
  const users = chk(await raw.from("app_users").select("id,name,role,created_at").order("id"), "app_users") as Row[];
  return { page: PAGE, invites: rows.map((r) => ({ code: r.code, note: r.note || "", created: r.created_at, used: r.used_at, who: r.app_users?.name || "", revoked: r.revoked })), users };
}
async function apiLogout(body: Row) {
  if (body.session) await raw.from("sessions").update({ revoked: true }).eq("token_hash", await sha256(String(body.session)));
  return { ok: true };
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
async function kvGet(k: string, def: any = null) { const r = await db.from("kv").select("value").eq("key", kk(k)).maybeSingle(); return r.data?.value ?? def; }
async function kvSet(k: string, value: any) { chk(await db.from("kv").upsert({ key: kk(k), value, updated_at: new Date().toISOString(), owner_id: PERSONAL_KV.has(k) ? uid() : null }), "kv"); }
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
  const [rows, series, kvRows, logRows, journal] = await Promise.all([
    allRows("books"), allRows("series"),
    db.from("kv").select("key,value").in("key", ["goals", "shelf_marks", "news", "options", "series_catalog", "profile", "streak"].map(kk)),
    db.from("log").select("at,action,title,author,details").order("id", { ascending: false }).limit(30),
    journalAll().catch(() => []),
  ]);
  const kv: Row = Object.fromEntries(((kvRows.data ?? []) as Row[]).map((r) => [String(r.key).replace(/@u\d+$/, ""), r.value]));
  // у нової людини ще немає своїх списків: беремо списки власниці без полиць (полиці в кожного свої)
  if (!kv.options && uid() !== 1) { const o = (await raw.from("kv").select("value").eq("key", "options").maybeSingle()).data?.value || {}; kv.options = JSON.parse(JSON.stringify(o)); if (kv.options.library) kv.options.library.shelf = []; }
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
    me: { uid: uid(), role: me().role }, today: today(), hasBought: true, hasSale: true, cols, options: kv.options || {}, goals: kv.goals || {}, profile: kv.profile || {}, streak: { ...STREAK_DEFAULT, ...(kv.streak || {}) }, shelfMarks: kv.shelf_marks || {},
    news: kv.news || [], pubCanon: PUBLISHERS, db: true,
    books, wish,
    series: series.map((x) => ({ author: x.author, name: x.name, total: x.total, finished: yesNo(x.finished), translated: yesNo(x.full_ua), pub: x.publisher || "" })),
    catalog: kv.series_catalog || [], sold, log: lg, journal,
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
  // закладка = запис у журналі читання й день серії
  if (kind === "library" && upd.cur_page != null && upd.cur_page !== b.cur_page) {
    const td = today();
    const from = b.cur_page ?? (b.started_on === td || upd.started_on === td ? 0 : null);
    const e = chk(await db.from("reading_log").insert({ book_id: b.id, day: td, at: new Date().toISOString(), page_from: from, page_to: upd.cur_page, kind: "page" }).select(JR).single(), "reading_log") as Row;
    const st = await syncStreakDays().catch(() => null);
    return { row: b.id, values, journal: jrow(e), streak: st };
  }
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
/** Профіль «Я» (16.11): ім'я і фото (маленький JPEG у data:-адресі, до ~150 КБ). photo:"" прибирає фото. */
async function apiSetProfile(p: Row) {
  const cur: Row = await kvGet("profile", {}) || {};
  if (p?.name !== undefined) { const n = String(p.name ?? "").trim().slice(0, 40); if (n) cur.name = n; else delete cur.name; }
  if (p?.photo !== undefined) {
    const ph = String(p.photo ?? "");
    if (!ph) delete cur.photo;
    else if (/^data:image\/jpeg;base64,[A-Za-z0-9+\/=]+$/.test(ph) && ph.length < 200000) cur.photo = ph;
    else fail("Фото завелике або не JPEG.");
  }
  await kvSet("profile", cur);
  return cur;
}
/** Спільний каталог (етап 2, 16.11): пошук за назвою, автором чи ISBN. Повертає лише дані про видання, без особистого (ціни, полиці, статуси). */
async function apiCatalogSearch(req: Row) {
  const q = s(req?.q).replace(/[%_,()"\\*]/g, " ").replace(/\s+/g, " ").trim();
  if (q.length < 2) return { items: [] };
  const digits = q.replace(/[^0-9Xx]/g, "");
  let rows: Row[] = [];
  if (digits.length >= 10 && digits.length === q.replace(/[\s-]/g, "").length) {
    rows = (chk(await db.from("catalog").select("*").eq("isbn", digits.toUpperCase()).limit(1), "catalog") || []) as Row[];
  } else {
    const words = q.split(" ").filter((w) => w.length > 1).slice(0, 4);
    let qq = db.from("catalog").select("*").not("title", "is", null);
    for (const w of words) qq = qq.or(`title.ilike."%${w}%",author.ilike."%${w}%",series.ilike."%${w}%"`);
    rows = (chk(await qq.limit(12), "catalog") || []) as Row[];
  }
  const isbns = rows.map((r) => r.isbn);
  const mine = isbns.length ? ((chk(await db.from("books").select("isbn,stage").in("isbn", isbns), "books") || []) as Row[]) : [];
  const own = new Map(mine.map((m) => [m.isbn, m.stage]));
  return { items: rows.map((r) => ({ isbn: r.isbn, title: r.title, author: r.author, pub: r.publisher, pages: r.pages, cover: r.cover, seriesName: r.series, seriesNum: r.series_num,
    total: r.series_total, genresRaw: r.genres || [], language: r.lang, year: r.year, orig: r.orig_title, description: r.description, sources: ["Каталог Shelfie"],
    mine: own.has(r.isbn) ? (LIB_STAGES.includes(own.get(r.isbn)) ? "library" : "wish") : "" })) };
}
/** Серія читання (16.11): read — сьогодні читала; skip — використати пропуск на сьогодні; set — увімкнути/вимкнути, година нагадування. */
async function streakMark(act: string, p: Row = {}) {
  const st: Row = { ...STREAK_DEFAULT, ...((await kvGet("streak", {})) || {}) }, td = today();
  if (!st.since) st.since = td;
  st.days = Array.isArray(st.days) ? st.days : []; st.skips = Array.isArray(st.skips) ? st.skips : [];
  if (act === "read") {
    if (!st.days.includes(td)) st.days.push(td);
    st.skips = st.skips.filter((d: string) => d !== td);
    // «Читала» — запис у журналі (з поточною книгою), якщо сьогодні ще нічого не відмічено
    const has = chk(await db.from("reading_log").select("id").eq("day", td).limit(1), "reading_log") as Row[];
    if (!has.length) {
      const cur = chk(await db.from("books").select("id").eq("read_status", "читаю").in("stage", LIB_STAGES).order("started_on", { ascending: false, nullsFirst: false }).limit(1), "books") as Row[];
      await db.from("reading_log").insert({ book_id: cur[0]?.id ?? null, day: td, at: new Date().toISOString(), kind: "read" });
    }
  }
  else if (act === "skip") {
    const rows = await allRows("books");
    const books = rows.filter((b) => LIB_STAGES.includes(b.stage)).map((b) => ({ started: b.started_on, readOn: b.finished_on, status: b.read_status }));
    const info = streakInfo(books, st, td);
    if (info.readToday) fail("Сьогодні ти вже читала, пропуск не потрібен.");
    if (!info.skipToday) { if (info.left < 1) fail("Пропусків цього місяця вже немає."); st.skips.push(td); }
  } else if (act === "set") {
    if (p.on !== undefined) st.on = !!p.on;
    if (p.hour !== undefined) { const h = Number(p.hour); if (!(h >= 6 && h <= 23)) fail("Час від 6 до 23."); st.hour = Math.round(h); }
  } else fail("Невідома дія серії.");
  const cut = (a: string[]) => a.filter((d) => /^\d{4}-\d\d-\d\d$/.test(d)).sort().slice(-500);
  st.days = cut(st.days); st.skips = cut(st.skips);
  await kvSet("streak", st);
  return act === "read" ? { ...st, journal: await journalAll() } : st;
}
/* ---------- журнал читання (16.11) ---------- */
const JR = "id,book_id,day,at,page_from,page_to,kind";
const jrow = (r: Row) => ({ id: r.id, row: r.book_id, day: r.day, at: r.at, from: r.page_from, to: r.page_to, kind: r.kind });
async function journalAll() {
  const r = chk(await db.from("reading_log").select(JR).order("day", { ascending: false }).order("at", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(3000), "reading_log") as Row[];
  return r.map(jrow);
}
/** Дні серії = дні з записами в журналі (сам журнал — джерело правди). */
async function syncStreakDays() {
  const rows = chk(await db.from("reading_log").select("day").order("day", { ascending: false }).limit(5000), "reading_log") as Row[];
  const st: Row = { ...STREAK_DEFAULT, ...((await kvGet("streak", {})) || {}) };
  if (!st.since) st.since = today();
  st.days = [...new Set(rows.map((r) => String(r.day)))].sort().slice(-500);
  st.skips = (Array.isArray(st.skips) ? st.skips : []).filter((d: string) => !st.days.includes(d));
  await kvSet("streak", st);
  return st;
}
/** Поточна сторінка книги «читаю» = «до сторінки» з останнього запису. */
async function syncPage(bookId: number, removed?: Row) {
  const b = chk(await db.from("books").select("id,title,author,cur_page,read_status").eq("id", bookId).maybeSingle(), "books") as Row | null;
  if (!b || b.read_status !== "читаю") return null;
  const last = (chk(await db.from("reading_log").select("page_to").eq("book_id", bookId).not("page_to", "is", null).order("day", { ascending: false }).order("at", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(1), "reading_log") as Row[])[0];
  const page = last ? last.page_to : removed && removed.page_to === b.cur_page ? removed.page_from : b.cur_page;
  if ((page ?? null) !== (b.cur_page ?? null)) {
    chk(await db.from("books").update({ cur_page: page ?? null }).eq("id", bookId), "books");
    await log("✏️ Змінено в додатку", b.title, b.author, `Поточна сторінка: ${b.cur_page ?? "—"} → ${page ?? "—"} (журнал читання)`, bookId);
  }
  return { row: bookId, page: page ?? null };
}
/** Дії журналу: add / edit / del. Відповідь: увесь журнал, серія й нові поточні сторінки. */
async function apiJournal(p: Row) {
  const act = s(p?.act), td = today();
  const pg = (v: unknown) => { if (v === "" || v == null) return null; const n = Math.round(Number(v)); if (!(n >= 0 && n < 100000)) fail("Сторінка — це число."); return n; };
  const fields = async () => {
    const day = isoDate(p.day);
    if (!day) fail("Вкажи дату.");
    if (day! > td) fail("Дата ще не настала.");
    const bookId = p.row ? Number(p.row) : null;
    let pages = 0;
    if (bookId) { const bk = await getBook(bookId, LIB_STAGES); pages = Number(bk.pages) || 0; }
    const from = pg(p.from), to = pg(p.to);
    if (from != null && to != null && to < from) fail("«До сторінки» менше, ніж «зі сторінки».");
    if (pages && to != null && to > pages + 50) fail(`У книзі ${pages} стор.`);
    let at: string | null = null;
    if (p.at) { const d = new Date(String(p.at)); if (isNaN(+d)) fail("Невірний час."); at = d.toISOString(); }
    return { book_id: bookId, day, at, page_from: from, page_to: to, kind: to != null ? "page" : "read" };
  };
  const touched = new Set<number>(); let removed: Row | undefined;
  const bookName = async (id: number | null) => id ? (chk(await db.from("books").select("title,author").eq("id", id).maybeSingle(), "books") as Row | null) : null;
  const say = (r: Row) => `${human(r.day)}${r.page_to != null ? `, стор. ${r.page_from ?? "—"} → ${r.page_to}` : ", «Читала»"}`;
  if (act === "add") {
    const f = await fields();
    const e = chk(await db.from("reading_log").insert(f).select(JR).single(), "reading_log") as Row;
    if (e.book_id) touched.add(e.book_id);
    const bn = await bookName(e.book_id);
    await log("📖 Журнал читання: додано", bn?.title, bn?.author, say(e), e.book_id);
  } else if (act === "edit" || act === "del") {
    const id = Number(p.id);
    const old = chk(await db.from("reading_log").select(JR).eq("id", id).maybeSingle(), "reading_log") as Row | null;
    if (!old) fail("Запис не знайдено. Оновіть сторінку.");
    if (old!.book_id) touched.add(old!.book_id);
    const bn = await bookName(old!.book_id);
    if (act === "del") {
      chk(await db.from("reading_log").delete().eq("id", id), "reading_log");
      removed = old!;
      await log("📖 Журнал читання: видалено", bn?.title, bn?.author, say(old!), old!.book_id);
    } else {
      const f = await fields();
      const e = chk(await db.from("reading_log").update(f).eq("id", id).select(JR).single(), "reading_log") as Row;
      if (e.book_id) touched.add(e.book_id);
      await log("📖 Журнал читання: виправлено", bn?.title, bn?.author, `${say(old!)} → ${say(e)}`, old!.book_id);
    }
  } else fail("Невідома дія журналу.");
  const pages: Row[] = [];
  for (const b of touched) { const r = await syncPage(b, removed && removed.book_id === b ? removed : undefined); if (r) pages.push(r); }
  const streak = await syncStreakDays();
  return { journal: await journalAll(), streak, pages };
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
  lbApiSetProfile: (p: Row) => apiSetProfile(p),
  lbApiCatalogSearch: (q: Row) => apiCatalogSearch(q),
  lbApiStreak: (p: Row) => streakMark(String(p?.act || ""), p || {}),
  lbApiJournal: (p: Row) => apiJournal(p || {}),
  lbApiMe: async () => { const w = me(); const u = (await raw.from("app_users").select("id,name,role").eq("id", w.uid).maybeSingle()).data; return { uid: w.uid, role: w.role, name: u?.name || "", via: w.via }; },
  lbApiInvites: (p: Row) => apiInvites(p || {}),
  lbApiAutoFill: async () => ({ started: false, note: "У новій базі дані про книги доповнюються самі, кнопка не потрібна." }),
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const reply = (o: unknown) => new Response(JSON.stringify(o), { headers: { ...CORS, "Content-Type": "application/json" } });
  try {
    const body = JSON.parse((await req.text()) || "{}");
    const fn = s(body.fn);
    const args = Array.isArray(body.args) ? body.args : [];
    if (fn === "lbAuthStart") return reply({ ok: true, data: await authStart(args[0] || {}) });
    if (fn === "lbAuthPoll") return reply({ ok: true, data: await authPoll(args[0] || {}) });
    if (fn === "lbAuthEmailStart") return reply({ ok: true, data: await authEmailStart(args[0] || {}) });
    if (fn === "lbAuthEmailFinish") return reply({ ok: true, data: await authEmailFinish(args[0] || {}) });
    if (!API[fn] && !PROXY.includes(fn) && fn !== "lbApiLogout") fail("Невідома дія.");
    // службова перевірка (лише з самої бази через pg_net): заголовок x-import-token = kv.import_token; тоді — від імені власниці
    const svc = req.headers.get("x-import-token");
    let who: Who = { uid: 1, role: "owner", name: "", via: "service" };
    if (!(svc && svc === (await kvGet("import_token", "")))) who = await whoIs(raw, body);
    else if (Number(body.asUser) > 0) who = { uid: Number(body.asUser), role: Number(body.asUser) === 1 ? "owner" : "user", name: "", via: "service" };
    if (fn === "lbApiLogout") return reply({ ok: true, data: await apiLogout(body) });
    const data = await ctx.run(who, () => API[fn] ? API[fn](...args) : proxy(fn, args));
    return reply({ ok: true, data });
  } catch (e) {
    const msg = e instanceof UserError || e instanceof AuthError ? e.message : "Помилка бази: " + String((e as Error)?.message ?? e);
    if (!(e instanceof UserError || e instanceof AuthError)) console.error(e);
    return reply({ ok: false, error: msg });
  }
});
