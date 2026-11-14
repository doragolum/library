// Бажанки без ISBN: база сама шукає книгу за назвою й автором (MEGOGO Books, далі Yakaboo)
// і дописує ЛИШЕ ПОРОЖНІ поля (ISBN, обкладинка, сторінки, видавництво, оригінальна назва, реліз, ціна, наявність, джерело).
// Певні збіги (назва майже та сама, автор і видавництво збігаються) записуються самі, сумнівні лише зберігаються як підказка.
// Усе знайдене лежить у таблиці wish_found і переживає повторне копіювання з Google-таблиці.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { fromMegogo, megogoVolume, authorOk } from "../_shared/megogo.ts";
import { fromYakaboo } from "../_shared/yakaboo.ts";
import { pubCanon, samePub } from "../_shared/pub.ts";
import { wishKey, volumeOnly, mergeFound } from "../_shared/wishfill.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
type Row = Record<string, any>;
const chk = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const WISH_STAGES = ["wish", "ordered", "ttn", "shipped", "delivered"];
const isbn13 = (v: unknown) => { const d = String(v ?? "").replace(/[^0-9]/g, ""); return d.length === 13 ? d : null; };

async function search(w: Row, series: string | null) {
  const vol = volumeOnly(w.title);
  let f: Row | null = null;
  if (vol && series) f = await megogoVolume(series, vol, w.author).catch(() => null);
  else if (!vol) {
    f = await fromMegogo("", w.title, w.author, w.publisher || "").catch(() => null);
    if (!f || !isbn13(f.isbn) || f.pubMismatch) {
      const y = await fromYakaboo(w.title, w.author, w.publisher || "").catch(() => null);
      if (y && f?.pubMismatch && !y.pubMismatch) f = y;
      else if (y && (!f || (isbn13(y.isbn) && samePub(f.publisher, y.publisher)))) f = f ? { ...y, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v != null && v !== "")), isbn: y.isbn, source: f.source + " + Yakaboo" } : y;
    }
  }
  return f;
}

async function fillOne(w: Row, series: string | null, used: Set<string>) {
  const f = await search(w, series);
  const key = wishKey(w.author, w.title);
  if (!f) {
    chk(await db.from("wish_found").upsert({ key, status: "none", data: { author: w.author, title: w.title }, tried_at: new Date().toISOString() }), "wish_found");
    return { id: w.id, title: w.title, status: "none" };
  }
  const pubOk = !w.publisher || !f.publisher || samePub(w.publisher, f.publisher);
  const sure = (f.score ?? 0) >= 0.85 && authorOk(w.author, f.author) && pubOk;
  const data: Row = {
    author: w.author, title: w.title, found_title: f.title, found_author: f.author, found_series: f.series || null, found_num: f.series_num || null,
    source: f.source, match: f.match, score: Math.round((f.score ?? 0) * 100) / 100, why: !pubOk ? `інше видавництво: ${f.publisher}` : !sure ? "назва не зовсім збігається" : "",
    isbn: isbn13(f.isbn), cover: f.cover || null, pages: f.pages || null, publisher: f.publisher ? pubCanon(f.publisher) : null,
    orig_title: f.orig_title || null, release: f.release || null, price: f.price || null, sale_status: f.avail || null, source_url: f.url || null,
  };
  chk(await db.from("wish_found").upsert({ key, status: sure ? "auto" : "doubt", data, tried_at: new Date().toISOString() }), "wish_found");
  if (data.isbn) await db.from("catalog").upsert({ isbn: data.isbn, title: f.title, author: f.author, publisher: data.publisher, pages: data.pages, cover: data.cover,
    series: f.series || null, series_num: f.series_num || null, description: f.description || null, orig_title: data.orig_title, genres: f.genres || [], lang: f.lang || null,
    year: f.year || null, release: data.release, rating: f.rating || null, sources: { title: f.source, urls: [f.url].filter(Boolean) }, fetched_at: new Date().toISOString() }, { onConflict: "isbn", ignoreDuplicates: true });
  if (!sure) return { id: w.id, title: w.title, status: "doubt", found: f.title, why: data.why };
  const set: Row = {};
  const cur: Row = { ...w };
  // ціна й наявність магазину потрібні лише ще не замовленим
  const notes = mergeFound(cur, w.stage === "wish" ? data : { ...data, price: null, sale_status: null }, (i) => !used.has(i));
  for (const k of Object.keys(cur)) if (cur[k] !== w[k]) set[k] = cur[k];
  if (Object.keys(set).length) {
    chk(await db.from("books").update(set).eq("id", w.id), "books");
    if (set.isbn) used.add(set.isbn);
    await db.from("log").insert({ action: "🔎 Бажанку доповнено з інтернету", book_id: w.id, title: w.title, author: w.author, details: notes.join("; ") + ` (${f.source})` });
  }
  return { id: w.id, title: w.title, status: "auto", filled: notes };
}

Deno.serve(async (req) => {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  try {
    const tok = (await db.from("kv").select("value").eq("key", "import_token").maybeSingle()).data?.value;
    if (!tok || req.headers.get("x-import-token") !== tok) return json({ ok: false, error: "forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const n = Math.min(Number(body.n) || 5, 12);
    const [wishes, found, series, isb] = await Promise.all([
      db.from("books").select("id,stage,author,title,series_id,series_num,publisher,isbn,cover,pages,orig_title,release,price,sale_status,source_url").in("stage", WISH_STAGES).is("isbn", null),
      db.from("wish_found").select("key,status,tried_at"),
      db.from("series").select("id,name"),
      db.from("books").select("isbn").not("isbn", "is", null).not("stage", "in", "(sold,gifted)"),
    ]);
    const done = new Map(((chk(found, "wish_found") as Row[])).map((r) => [r.key, r]));
    const ser = new Map(((chk(series, "series") as Row[])).map((r) => [r.id, r.name]));
    const used = new Set(((chk(isb, "books") as Row[])).map((r) => r.isbn));
    const retry = Date.now() - 14 * 864e5;
    const todo = (chk(wishes, "books") as Row[]).filter((w) => {
      if (body.id) return w.id === Number(body.id);
      const d = done.get(wishKey(w.author, w.title));
      return !d || (d.status === "none" && new Date(d.tried_at).getTime() < retry);
    });
    const started = Date.now(), out = [];
    for (const w of todo.slice(0, n)) {
      if (Date.now() - started > 95000) break;
      try { out.push(await fillOne(w, w.series_id ? ser.get(w.series_id) || null : null, used)); } catch (e) { out.push({ id: w.id, error: String((e as Error).message) }); }
    }
    return json({ ok: true, done: out, left: todo.length - out.length });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
