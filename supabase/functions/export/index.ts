// Нічна копія бази в окрему Google-таблицю «Книги — копія з бази».
// Забирає її Apps Script (lbExportFromDb у LbExport.gs) щоночі: POST {key} — особистий ключ LB_WEB_KEY з Властивостей скрипту.
// Лише читає базу, нічого не змінює.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
type Row = Record<string, any>;
const TZ = "Europe/Kyiv";
const LIB = ["library", "sold", "gifted"], WISH = ["wish", "ordered", "ttn", "shipped", "delivered"];
const STAGE: Record<string, string> = { ordered: "Замовлено", ttn: "Створено ТТН", shipped: "Відправлено", delivered: "Доставлено" };

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}
async function all(table: string, cols = "*"): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const r = await db.from(table).select(cols).order("id").range(from, from + 999);
    if (r.error) throw new Error(`${table}: ${r.error.message}`);
    out.push(...(r.data as Row[]));
    if ((r.data as Row[]).length < 1000) return out;
  }
}
const yn = (v: unknown) => (v === true ? "Так" : v === false ? "Ні" : "");
const dt = (v: unknown) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? "")); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };
const ts = (v: unknown) => (v ? new Date(String(v)).toLocaleString("uk-UA", { timeZone: TZ }) : "");
// захист від формул: текст, що починається з = + @ -, Google-таблиця збереже як текст
const cell = (v: unknown) => { if (v == null) return ""; if (Array.isArray(v)) return v.join(", "); if (typeof v === "number" || typeof v === "boolean") return v; const x = String(v); return /^([=+@]|-\S)/.test(x) ? "'" + x : x; };

Deno.serve(async (req) => {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    const saved = Deno.env.get("LB_WEB_KEY") || "";
    const tok = (await db.from("kv").select("value").eq("key", "import_token").maybeSingle()).data?.value;
    const svc = !!tok && req.headers.get("x-import-token") === tok; // перевірка з самої бази
    if (!svc && (!saved || !same(String(body.key || ""), saved))) return json({ ok: false, error: "Немає доступу." }, 403);
    const [books, series, logs] = await Promise.all([all("books"), all("series"), all("log", "id,at,action,title,author,details")]);
    const ser = new Map(series.map((s) => [s.id, s]));
    const sortKey = (b: Row) => [b.author || "", ser.get(b.series_id)?.name || "", String(Number(b.series_num) || 0).padStart(5, "0"), b.title || ""].join("\u0001");
    books.sort((a, b) => sortKey(a).localeCompare(sortKey(b), "uk"));

    const lib: unknown[][] = [], wish: unknown[][] = [], sold: unknown[][] = [];
    let n = 0;
    for (const b of books) {
      const s = b.series_id ? ser.get(b.series_id) : null, L = b.legacy || {};
      if (L.sold_sheet) { sold.push([b.author, s?.name || "", b.title, b.series_num, b.read_status, b.sold_price, dt(b.sold_on)]); continue; }
      if (LIB.includes(b.stage)) lib.push([++n, b.author, s ? "Серія" : "Одиночна", s?.name || "-", b.title, b.publisher, b.series_num, s?.total, b.genre, b.pages, b.lang, b.read_status,
        s ? yn(s.finished) : "—", s ? yn(s.full_ua) : "—", b.avail, b.place, b.shelf, b.kyiv_prio, b.price, b.isbn, dt(b.bought_on), dt(b.started_on), dt(b.finished_on), b.rating,
        b.lent_to, dt(b.lent_on), dt(b.return_by), b.kyiv_parcel, b.plan_month, b.cur_page, b.tropes, b.moods, b.orig_title, b.source_url, b.cover, L.id]);
      else if (WISH.includes(b.stage)) wish.push([b.author, s?.name || "", b.title, b.price, b.stage === "wish" ? b.wish_kind || "Хочу купити" : STAGE[b.stage], b.publisher, s ? "Так" : "Ні",
        b.sale_status, b.series_num, s?.total, b.release ? dt(b.release) : L.release_text || "", b.shop, b.shop_site, b.order_no, b.ttn, b.np_status, ts(b.np_checked), b.np_error,
        dt(b.ordered_on), b.isbn, b.orig_title, b.source_url, b.cover, L.id]);
    }
    const t = (name: string, header: string[], rows: unknown[][]) => ({ name, header, rows: rows.map((r) => r.map(cell)) });
    return json({ ok: true, data: { at: ts(new Date().toISOString()), tables: [
      t("Облік бібліотеки", ["№", "Автор", "Тип", "Серія", "Назва", "Видавництво", "Номер у серії", "Всього книг", "Жанр", "Сторінок", "Мова", "Статус читання", "Завершена?",
        "Повний переклад укр", "Наявність", "Де фізично", "Де шукати", "Пріоритет Київ", "Ціна", "ISBN", "Дата покупки", "Дата початку", "Дата прочитання", "Оцінка", "Кому позичила",
        "Коли позичила", "Повернути до", "Посилка з Києва", "Планую читати", "Поточна сторінка", "Тропи", "Настрій", "Оригінальна назва", "Джерело", "Обкладинка", "ID книги"], lib),
      t("Бажанки", ["Автор", "Серія", "Назва", "Ціна", "Статус", "Видавництво", "Серія?", "Наявність", "Частина", "Всього", "Дата виходу", "Де замовлено", "Сайт", "Номер замовлення",
        "ТТН", "Статус НП", "НП: остання перевірка", "НП: помилка", "Дата замовлення", "ISBN", "Оригінальна назва", "Джерело", "Обкладинка", "ID книги"], wish),
      t("Продані", ["Автор", "Серія", "Назва", "Номер", "Статус читання", "Ціна продажу", "Дата продажу"], sold),
      t("Серії", ["Автор", "Серія", "Всього книг", "Завершена?", "Повний переклад укр", "Видавництво"],
        series.sort((a, b) => (a.author + a.name).localeCompare(b.author + b.name, "uk")).map((s) => [s.author, s.name, s.total, yn(s.finished), yn(s.full_ua), s.publisher])),
      t("Лог", ["Коли", "Дія", "Назва", "Автор", "Деталі"], logs.reverse().slice(0, 5000).map((r) => [ts(r.at), r.action, r.title, r.author, r.details])),
    ] } });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
