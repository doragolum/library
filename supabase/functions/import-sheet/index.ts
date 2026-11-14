// Разове (і повторюване до переходу) копіювання даних з Google-таблиці в базу.
// Бере дані через наявний API Apps Script (lbApiData) з ключем LB_WEB_KEY (секрет функцій, вписує користувачка).
// Захист: заголовок x-import-token має збігатися з kv.import_token. Після переходу (kv.source = 'supabase') — відмова.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbwzMBurJfPgrKJY2H99pHG7BN7axnxWIFC3p1cHjno3Q0bKywZP71_KDC2vBd9qfUi1/exec";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const norm = (v: unknown) =>
  String(v ?? "").toLowerCase().replace(/ґ/g, "г").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/['’`"ʼ«»]/g, "").replace(/[-–—]/g, " ").replace(/[.,:;!?()[\]{}#№]/g, " ").replace(/\s+/g, " ").trim();
const txt = (v: unknown) => { const s = String(v ?? "").trim(); return s && s !== "-" ? s : null; };
const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", ".").replace(/[^\d.\-]/g, ""));
  return isFinite(n) ? n : null;
};
const int = (v: unknown) => { const n = num(v); return n === null ? null : Math.round(n); };
const iso = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null);
const list = (v: unknown) => String(v ?? "").split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean);
const yes = (v: unknown) => { const s = norm(v); return s ? /^(так|yes|true|1|завершена|повний)/.test(s) : null; };
function isbn13(v: unknown): string | null {
  const d = String(v ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (d.length === 13 && /^\d{13}$/.test(d)) return d;
  if (d.length === 10) {
    const core = "978" + d.slice(0, 9);
    let s = 0;
    for (let i = 0; i < 12; i++) s += Number(core[i]) * (i % 2 ? 3 : 1);
    return core + ((10 - (s % 10)) % 10);
  }
  return null;
}
const AVAIL: Record<string, string> = {
  "у колекції": "у колекції", "бібліотека": "у колекції", "київ": "у колекції", "на продаж": "на продаж",
  "на розподілення": "на розподілення", "позичена": "позичена", "продана": "продана", "подарована": "подарована",
};
const READ = ["не читала", "читаю", "прочитано", "закинула"];
const SALE = ["Є у продажу", "Анонс", "Передзамовлення", "Немає у продажу", "Не видана"];
const WISH_STAGE: Record<string, string> = {
  "Хочу купити": "wish", "Докупити серію": "wish", "На майбутнє": "wish", "Замовлено": "ordered",
  "Створено ТТН": "ttn", "Відправлено": "shipped", "Доставлено": "delivered", "В бібліотеці": "library",
};
const sameAuthor = (a: string, b: string) => {
  const t = norm(b);
  return !norm(a) || norm(a).split(" ").filter((w) => w.length > 2).some((w) => t.includes(w.slice(0, Math.max(4, w.length - 2))));
};

Deno.serve(async (req) => {
  const json = (o: unknown, status = 200) =>
    new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  try {
    const { data: kvRows } = await db.from("kv").select("key,value").in("key", ["import_token", "source"]);
    const kv: Record<string, unknown> = Object.fromEntries((kvRows ?? []).map((r) => [r.key, r.value]));
    if (!kv.import_token || req.headers.get("x-import-token") !== kv.import_token) return json({ ok: false, error: "forbidden" }, 403);
    if (kv.source === "supabase") return json({ ok: false, error: "База вже головна — копіювання з таблиці вимкнено." }, 409);
    const key = Deno.env.get("LB_WEB_KEY");
    if (!key) return json({ ok: false, error: "Немає секрету LB_WEB_KEY." }, 400);

    const r = await fetch(APPS_SCRIPT_URL, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ fn: "lbApiData", args: [], key }) });
    const body = await r.json();
    if (!body.ok) return json({ ok: false, error: "Apps Script: " + body.error }, 502);
    const D = body.data;

    // очистка (до переходу таблиця — головна, тож копія повністю перезаписується). Каталог з інтернету лишається.
    for (const t of ["log", "books", "series"]) {
      const { error } = await db.from(t).delete().gte("id", 0);
      if (error) throw new Error(t + ": " + error.message);
    }

    // серії
    const seriesMap = new Map<string, number>();
    const serRows: Record<string, unknown>[] = [];
    const addSer = (name: string | null, author: string, extra: Record<string, unknown> = {}) => {
      if (!name) return;
      const k = norm(name) + "|" + norm(author);
      if (seriesMap.has(k) || serRows.some((s) => norm(s.name) + "|" + norm(s.author) === k)) return;
      serRows.push({ name, author: author || "", ...extra });
    };
    for (const s of D.series ?? []) addSer(txt(s.name), String(s.author ?? ""), { total: int(s.total), finished: yes(s.finished), full_ua: yes(s.translated), publisher: txt(s.pub) });
    for (const b of D.books ?? []) if (b.type === "Серія" || (txt(b.series) && b.type !== "Одиночна")) addSer(txt(b.series), String(b.author ?? ""), { total: int(b.total), finished: yes(b.finished), full_ua: yes(b.translated) });
    for (const w of D.wish ?? []) if (txt(w.series)) addSer(txt(w.series), String(w.author ?? ""), { total: int(w.total) });
    for (let i = 0; i < serRows.length; i += 200) {
      const { data, error } = await db.from("series").insert(serRows.slice(i, i + 200)).select("id,name,author");
      if (error) throw new Error("series: " + error.message);
      for (const s of data!) seriesMap.set(norm(s.name) + "|" + norm(s.author), s.id);
    }
    const serId = (name: unknown, author: unknown) => {
      const n = txt(name); if (!n) return null;
      const exact = seriesMap.get(norm(n) + "|" + norm(author));
      if (exact) return exact;
      for (const [k, id] of seriesMap) { const [sn, sa] = k.split("|"); if (sn === norm(n) && sameAuthor(String(author), sa)) return id; }
      return null;
    };

    // каталог (заготовки за ISBN — далі доповнюється з інтернету)
    const cat = new Map<string, Record<string, unknown>>();
    const addCat = (isbn: string | null, b: Record<string, unknown>) => {
      if (!isbn || cat.has(isbn)) return;
      cat.set(isbn, { isbn, title: txt(b.title), author: txt(b.author), publisher: txt(b.pub), pages: int(b.pages), cover: txt(b.cover), orig_title: txt(b.orig),
        series: txt(b.series), series_num: num(b.num ?? b.part), sources: txt(b.src) ? { first: b.src } : {} });
    };

    const report = { books: 0, wish: 0, sold: 0, mergedWish: [] as string[], orphans: [] as string[], dupIsbn: [] as string[], fixed: [] as string[] };
    const usedIsbn = new Set<string>();
    const rows: Record<string, unknown>[] = [];

    // бібліотека
    const lib = (D.books ?? []).map((b: Record<string, unknown>) => {
      const av0 = String(b.avail ?? "").toLowerCase().trim();
      const avail = AVAIL[av0] ?? "у колекції";
      if (b.avail && !AVAIL[av0]) report.fixed.push(`${b.author} — «${b.title}»: наявність «${b.avail}» → «у колекції»`);
      const stage = avail === "продана" ? "sold" : avail === "подарована" ? "gifted" : "library";
      let isbn = isbn13(b.isbn);
      if (isbn && stage !== "sold" && stage !== "gifted") { if (usedIsbn.has(isbn)) { report.dupIsbn.push(`${b.author} — «${b.title}» (ISBN ${isbn})`); isbn = null; } else usedIsbn.add(isbn); }
      addCat(isbn, b);
      const rs = String(b.status ?? "").toLowerCase().trim();
      const row = {
        stage, isbn, author: txt(b.author) ?? "?", title: txt(b.title) ?? "?", orig_title: txt(b.orig),
        series_id: b.type === "Одиночна" ? null : serId(b.series, b.author), series_num: num(b.num),
        publisher: txt(b.pub), lang: txt(b.lang), pages: int(b.pages), genre: txt(b.genre), genres: list(b.genres),
        tropes: list(b.tropes), moods: list(b.moods), cover: txt(b.cover), source_url: txt(b.src), price: num(b.price),
        bought_on: iso(b.bought), avail, place: av0 === "київ" || b.place === "Київ" ? "Київ" : "Роттердам",
        shelf: txt(b.shelf), kyiv_prio: txt(b.prio), kyiv_parcel: txt(b.parcel), lent_to: txt(b.lentTo), lent_on: iso(b.lentOn), return_by: iso(b.lentDue),
        read_status: READ.includes(rs) ? rs : "не читала", started_on: iso(b.started), finished_on: iso(b.readOn), rating: num(b.rating),
        cur_page: int(b.page), plan_month: txt(b.plan),
        legacy: { lib_row: b.row, id: txt(b.bid), n: txt(b.n), status_raw: rs && !READ.includes(rs) ? b.status : undefined },
      };
      if (rs && !READ.includes(rs)) report.fixed.push(`${b.author} — «${b.title}»: статус «${b.status}» → «не читала»`);
      rows.push(row);
      report.books++;
      return { row, b };
    });

    const findLib = (w: Record<string, unknown>) => {
      const k = isbn13(w.isbn);
      if (txt(w.bid)) { const hit = lib.find((x: { b: Record<string, unknown> }) => txt(x.b.bid) === txt(w.bid)); if (hit) return hit; }
      if (k) { const hit = lib.find((x: { row: Record<string, unknown> }) => x.row.isbn === k); if (hit) return hit; }
      return lib.find((x: { b: Record<string, unknown> }) => norm(x.b.title) === norm(w.title) && sameAuthor(String(w.author), String(x.b.author)));
    };

    // бажанки й замовлення
    for (const w of D.wish ?? []) {
      const status = String(w.status ?? "").trim();
      const stage = WISH_STAGE[status] ?? "wish";
      const hit = findLib(w);
      const order = { shop: txt(w.where), shop_site: txt(w.site), order_no: txt(w.order), ordered_on: iso(w.ordered), ttn: txt(w.ttn), np_status: txt(w.np), np_error: txt(w.npErr) };
      if (hit && (stage === "library" || stage === "delivered")) {
        // отримана книга: дані замовлення переходять у запис бібліотеки
        for (const [k, v] of Object.entries(order)) if (v && !hit.row[k]) hit.row[k] = v;
        if (hit.row.price == null && w.price != null) hit.row.price = num(w.price);
        (hit.row.legacy as Record<string, unknown>).wish_row = w.row;
        report.mergedWish.push(`«${w.title}» → бібліотека`);
        continue;
      }
      if (stage === "library") { report.orphans.push(`${w.author} — «${w.title}» («В бібліотеці», але в бібліотеці не знайдено)`); continue; }
      let isbn = isbn13(w.isbn);
      if (isbn && usedIsbn.has(isbn)) { report.dupIsbn.push(`бажанка ${w.author} — «${w.title}» (ISBN ${isbn} уже є)`); isbn = null; }
      if (isbn) usedIsbn.add(isbn);
      addCat(isbn, w);
      if (hit) report.dupIsbn.push(`бажанка «${w.title}» (${status}) схожа на книгу з бібліотеки «${hit.b.title}»`);
      rows.push({
        stage, wish_kind: stage === "wish" && ["Хочу купити", "Докупити серію", "На майбутнє"].includes(status) ? status : stage === "wish" ? "Хочу купити" : null,
        isbn, author: txt(w.author) ?? "?", title: txt(w.title) ?? "?", orig_title: txt(w.orig), series_id: serId(w.series, w.author), series_num: num(w.part),
        publisher: txt(w.pub), cover: txt(w.cover), source_url: txt(w.src), price: num(w.price),
        sale_status: SALE.includes(String(w.avail)) ? w.avail : null, release: iso(w.release), ...order,
        avail: "у колекції", place: "Роттердам", read_status: "не читала", legacy: { wish_row: w.row, id: txt(w.bid), status_raw: status, release_text: w.release ? undefined : txt(w.releaseText), np_check: txt(w.npCheck) },
      });
      report.wish++;
    }

    // продані (окремий лист)
    for (const s of D.sold ?? []) {
      rows.push({ stage: "sold", author: txt(s.author) ?? "?", title: txt(s.title) ?? "?", series_id: serId(s.series, s.author), series_num: num(s.num),
        avail: "продана", read_status: READ.includes(String(s.status)) ? s.status : "не читала", sold_on: iso(s.date), sold_price: num(s.price), legacy: { sold_sheet: true } });
      report.sold++;
    }

    const catRows = [...cat.values()];
    for (let i = 0; i < catRows.length; i += 200) { const { error } = await db.from("catalog").upsert(catRows.slice(i, i + 200), { onConflict: "isbn", ignoreDuplicates: true }); if (error) throw new Error("catalog: " + error.message); }
    for (let i = 0; i < rows.length; i += 200) { const { error } = await db.from("books").insert(rows.slice(i, i + 200)); if (error) throw new Error("books: " + error.message); }

    await db.from("kv").upsert([
      { key: "goals", value: D.goals ?? null }, { key: "shelf_marks", value: D.shelfMarks ?? null }, { key: "news", value: D.news ?? [] },
      { key: "options", value: D.options ?? null }, { key: "series_catalog", value: D.catalog ?? [] }, { key: "import_report", value: { at: new Date().toISOString(), ...report } },
    ]);
    await db.from("log").insert({ action: "⇄ Скопійовано з таблиці", details: `бібліотека ${report.books}, бажанки ${report.wish}, продані ${report.sold}` });
    return json({ ok: true, report });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
