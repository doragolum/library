// Каталог за ISBN: база сама збирає дані про книги з інтернету (MEGOGO Books, далі Goodreads).
// Запускається розкладом (pg_cron) порціями. У записи книг дописує лише ПОРОЖНІ поля (обкладинка, сторінки, оригінальна назва);
// те, що вона вже вписала, не змінюється. Усе знайдене зберігається в таблиці catalog з джерелом.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
type Row = Record<string, any>;

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘" };
const text = (h: unknown) => String(h ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
async function get(url: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "uk,en;q=0.8" }, redirect: "follow", signal: ctl.signal });
    return { code: r.status, html: r.ok ? await r.text() : "" };
  } catch (e) { return { code: 0, html: "", err: String(e) }; } finally { clearTimeout(t); }
}

/* ---------- MEGOGO Books (Next.js: дані в self.__next_f.push) ---------- */
function mgText(html: string) {
  const out: string[] = [];
  const re = /self\.__next_f\.push\(\[1,"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  while ((m = re.exec(html))) { try { out.push(JSON.parse('"' + m[1] + '"')); } catch { /* */ } }
  return out.join("");
}
function mgObj(t: string, slug: string, from = 0): Row | null {
  const i = t.indexOf('"slug":"' + slug + '"', from);
  if (i < 0) return null;
  const j = t.lastIndexOf('{"uid"', i);
  if (j < 0) return null;
  let depth = 0, inStr = false;
  for (let k = j; k < t.length; k++) {
    const c = t[k];
    if (inStr) { if (c === "\\") k++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") { depth--; if (!depth) { try { return JSON.parse(t.slice(j, k + 1)); } catch { return null; } } }
  }
  return null;
}
const mgAuthor = (o: Row) => (o.authors || []).map((a: Row) => [a.firstName, a.lastName].filter(Boolean).join(" ")).join(", ");
async function fromMegogo(isbn: string): Promise<Row | null> {
  const s = await get("https://mbooks.com.ua/search/?query=" + encodeURIComponent(isbn));
  if (s.code !== 200) return null;
  const t = mgText(s.html);
  const re = /"slug":"(\d{6}-[a-z0-9-]+)"/g;
  const seen = new Set<string>();
  let m, tries = 0;
  while ((m = re.exec(t)) && tries < 3) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const c = mgObj(t, m[1], m.index - 1);
    if (!c || !c.title || c.bookType === "ebook" || c.bookType === "audiobook") continue;
    tries++;
    const p = await get("https://mbooks.com.ua/book/" + c.slug + "/");
    if (p.code !== 200) continue;
    const o = mgObj(mgText(p.html), c.slug);
    if (!o?.title) continue;
    const bi = String(o.isbn || o.barcode || "").replace(/[^0-9Xx]/g, "");
    if (bi && bi !== isbn) continue; // інше видання
    let desc = "";
    const ld = p.html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
    if (ld) { try { desc = text(JSON.parse(ld[1]).description || ""); } catch { /* */ } }
    const cats: string[] = [];
    (o.additionalCategories || []).concat(o.mainCategory ? [o.mainCategory] : []).forEach((x: Row) => { if (x?.title && !cats.includes(x.title)) cats.push(x.title); });
    const ser = (o.series || [])[0] || null;
    const pu = o.purchases || {};
    return {
      source: "MEGOGO Books", url: "https://mbooks.com.ua/book/" + c.slug + "/",
      title: o.title, author: mgAuthor(o), publisher: o.publisher?.name || null,
      series: ser?.title || null, series_num: Number(ser?.numberInSeries || o.numberInSeries) || null,
      pages: Number(o.pages) || null, year: Number(o.year) || null, cover: o.cover?.frontCover || null,
      release: pu.preorderDate ? String(pu.preorderDate).slice(0, 10) : null, genres: cats, lang: (o.languages || [])[0] || null,
      rating: Number(o.goodreadsAverageRating) || null, orig_title: o.originalTitle || null, description: desc.slice(0, 2000) || null,
    };
  }
  return null;
}

/* ---------- Goodreads (сторінка видання за ISBN) ---------- */
async function fromGoodreads(isbn: string): Promise<Row | null> {
  const r = await get("https://www.goodreads.com/book/isbn/" + isbn);
  if (r.code !== 200 || !r.html) return null;
  const h = r.html, out: Row = { source: "Goodreads" };
  const m = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const j = JSON.parse(m[1]);
      out.title = j.name; out.cover = j.image; out.pages = Number(j.numberOfPages) || null;
      const au = [].concat(j.author || []) as Row[];
      if (au.length) out.author = au.map((a) => a.name).join(", ");
      if (j.inLanguage) out.lang = j.inLanguage;
      if (j.aggregateRating?.ratingValue) out.rating = Number(j.aggregateRating.ratingValue) || null;
    } catch { /* */ }
  }
  if (!out.cover) { const og = h.match(/<meta property="og:image" content="([^"]+)"/); if (og) out.cover = og[1]; }
  if (out.cover && /nophoto/.test(out.cover)) delete out.cover;
  const om = h.match(/"originalTitle":"((?:[^"\\]|\\.)*)"/);
  if (om) { try { out.orig_title = JSON.parse('"' + om[1] + '"').trim() || null; } catch { /* */ } }
  if (out.title) {
    const sm = String(out.title).match(/\(([^()]*?),?\s*#\s*([\d.,]+)\)\s*$/);
    if (sm) { out.series = sm[1].trim(); out.series_num = Number(sm[2].replace(",", ".")) || null; }
    out.title = String(out.title).replace(/\s*\([^)]*#[^)]*\)\s*$/, "");
  }
  const g: string[] = [];
  const re = /\/genres\/([a-z0-9-]+)/g;
  let gm;
  while ((gm = re.exec(h)) && g.length < 10) if (!g.includes(gm[1]) && gm[1] !== "new_releases") g.push(gm[1]);
  out.genres = g;
  const dm = h.match(/data-testid="description"[\s\S]*?<span class="Formatted">([\s\S]*?)<\/span>/);
  const d = dm ? text(dm[1]) : "";
  if (d) out.description = d.slice(0, 2000);
  out.url = "https://www.goodreads.com/book/isbn/" + isbn;
  return out.cover || out.title ? out : null;
}

const FIELDS = ["title", "author", "series", "series_num", "publisher", "pages", "lang", "year", "release", "cover", "description", "orig_title", "genres", "rating"];

async function enrichOne(c: Row) {
  const found: Row[] = [];
  const mg = await fromMegogo(c.isbn).catch(() => null);
  if (mg) found.push(mg);
  if (!mg || !mg.cover || !mg.description || !mg.orig_title) { const gr = await fromGoodreads(c.isbn).catch(() => null); if (gr) found.push(gr); }
  const upd: Row = { fetched_at: new Date().toISOString() };
  const sources: Row = { ...(c.sources || {}) };
  if (!found.length) { sources.notFound = new Date().toISOString().slice(0, 10); upd.sources = sources; }
  else {
    for (const f of FIELDS) {
      for (const r of found) { const v = r[f]; if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) { upd[f] = v; sources[f] = r.source; break; } }
    }
    sources.urls = found.map((r) => r.url);
    delete sources.notFound;
    upd.sources = sources;
  }
  chk(await db.from("catalog").update(upd).eq("isbn", c.isbn), "catalog");
  // у книги — лише порожні поля
  let filled = 0;
  const books = chk(await db.from("books").select("id,cover,pages,orig_title,title,author").eq("isbn", c.isbn), "books") as Row[];
  for (const b of books) {
    const set: Row = {};
    if (!b.cover && upd.cover) set.cover = upd.cover;
    if (!b.pages && upd.pages) set.pages = upd.pages;
    if (!b.orig_title && upd.orig_title) set.orig_title = upd.orig_title;
    if (Object.keys(set).length) {
      chk(await db.from("books").update(set).eq("id", b.id), "books");
      await db.from("log").insert({ action: "🔎 Доповнено з інтернету", book_id: b.id, title: b.title, author: b.author, details: Object.keys(set).map((k) => k === "cover" ? "обкладинка" : k === "pages" ? `сторінок: ${set[k]}` : `оригінальна назва: ${set[k]}`).join("; ") + ` (${found.map((r) => r.source).join(", ")})` });
      filled++;
    }
  }
  return { isbn: c.isbn, found: found.map((r) => r.source), filled };
}
const chk = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

Deno.serve(async (req) => {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  try {
    const tok = (await db.from("kv").select("value").eq("key", "import_token").maybeSingle()).data?.value;
    if (!tok || req.headers.get("x-import-token") !== tok) return json({ ok: false, error: "forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const n = Math.min(Number(body.n) || 6, 15);
    let list: Row[];
    if (body.isbn) list = chk(await db.from("catalog").select("isbn,sources").eq("isbn", String(body.isbn)), "catalog") as Row[];
    else {
      // спершу ще не перевірені; не знайдені повторюються через 30 днів
      list = chk(await db.from("catalog").select("isbn,sources").is("fetched_at", null).limit(n), "catalog") as Row[];
      if (list.length < n) {
        const old = new Date(Date.now() - 30 * 864e5).toISOString();
        const more = chk(await db.from("catalog").select("isbn,sources").lt("fetched_at", old).not("sources->notFound", "is", null).limit(n - list.length), "catalog") as Row[];
        list = list.concat(more);
      }
    }
    const started = Date.now(), out = [];
    for (const c of list) {
      if (Date.now() - started > 100000) break;
      try { out.push(await enrichOne(c)); } catch (e) { out.push({ isbn: c.isbn, error: String((e as Error).message) }); }
    }
    const left = (await db.from("catalog").select("isbn", { count: "exact", head: true }).is("fetched_at", null)).count;
    return json({ ok: true, done: out, left });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
