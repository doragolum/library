// Пошук книги на MEGOGO Books (перше джерело) за ISBN або за назвою й автором.
type Row = Record<string, any>;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘" };
export const htmlText = (h: unknown) => String(h ?? "").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m).replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
export async function getHtml(url: string, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "uk,en;q=0.8" }, redirect: "follow", signal: ctl.signal });
    return { code: r.status, html: r.ok ? await r.text() : "" };
  } catch { return { code: 0, html: "" }; } finally { clearTimeout(t); }
}
const norm = (v: unknown) => String(v ?? "").toLowerCase().replace(/ґ/g, "г").normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/['’`"ʼ«»]/g, "").replace(/[-–—]/g, " ").replace(/[.,:;!?()[\]{}#№]/g, " ").replace(/\s+/g, " ").trim();
export function dice(a: unknown, b: unknown) {
  const x = norm(a).replace(/\s+/g, ""), y = norm(b).replace(/\s+/g, "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const bg = (s: string) => { const m: Record<string, number> = {}; for (let i = 0; i < s.length - 1; i++) { const k = s.substr(i, 2); m[k] = (m[k] || 0) + 1; } return m; };
  const X = bg(x), Y = bg(y);
  let inter = 0;
  for (const k in X) if (Y[k]) inter += Math.min(X[k], Y[k]);
  return (2 * inter) / (Math.max(x.length - 1, 1) + Math.max(y.length - 1, 1));
}
export const authorOk = (mine: unknown, theirs: unknown) => {
  if (!String(mine ?? "").trim()) return true;
  const t = norm(theirs);
  return norm(mine).split(" ").filter((w) => w.length > 2).some((w) => t.includes(w.slice(0, Math.max(4, w.length - 2))));
};
const cleanTitle = (t: unknown) => String(t ?? "").replace(/\s*\((?:[^()]*)\)\s*$/, "").replace(/\.\s*Книга\s+\d+\s*$/i, "").trim();

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
export async function mgSearch(q: string) {
  const s = await getHtml("https://mbooks.com.ua/search/?query=" + encodeURIComponent(q));
  if (s.code !== 200) return [] as Row[];
  const t = mgText(s.html), seen = new Set<string>(), out: Row[] = [];
  const re = /"slug":"(\d{6}-[a-z0-9-]+)"/g;
  let m;
  while ((m = re.exec(t)) && out.length < 15) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const o = mgObj(t, m[1], m.index - 1);
    if (o?.title && o.bookType !== "ebook" && o.bookType !== "audiobook") out.push({ slug: o.slug, name: o.title, author: mgAuthor(o) });
  }
  return out;
}
export async function mgBook(slug: string): Promise<Row | null> {
  const p = await getHtml("https://mbooks.com.ua/book/" + slug + "/");
  if (p.code !== 200) return null;
  const o = mgObj(mgText(p.html), slug);
  if (!o?.title) return null;
  let desc = "";
  const ld = p.html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  if (ld) { try { desc = htmlText(JSON.parse(ld[1]).description || ""); } catch { /* */ } }
  const cats: string[] = [];
  (o.additionalCategories || []).concat(o.mainCategory ? [o.mainCategory] : []).forEach((x: Row) => { if (x?.title && !cats.includes(x.title)) cats.push(x.title); });
  const ser = (o.series || [])[0] || null;
  const pu = o.purchases || {};
  const isbn = String(o.isbn || o.barcode || "").replace(/[^0-9Xx]/g, "");
  return {
    source: "MEGOGO Books", url: "https://mbooks.com.ua/book/" + slug + "/",
    title: o.title, author: mgAuthor(o), publisher: o.publisher?.name || null,
    series: ser?.title || null, series_num: Number(ser?.numberInSeries || o.numberInSeries) || null,
    isbn: isbn.length === 13 || isbn.length === 10 ? isbn : null,
    pages: Number(o.pages) || null, year: Number(o.year) || null, cover: o.cover?.frontCover || null,
    price: pu.currentPrice || pu.price || pu.preorderPrice || null,
    avail: o.status === "ready_for_presale" ? "Передзамовлення" : o.status === "ready_for_order" ? "Є у продажу" : "",
    release: pu.preorderDate ? String(pu.preorderDate).slice(0, 10) : null, genres: cats, lang: (o.languages || [])[0] || null,
    rating: Number(o.goodreadsAverageRating) || null, orig_title: o.originalTitle || null, description: desc.slice(0, 2000) || null,
  };
}
/** За ISBN (точний збіг видання), інакше за назвою (+ прізвище автора) з перевіркою автора. */
export async function fromMegogo(isbn: string, title: string, author: string): Promise<Row | null> {
  const surname = String(author || "").split(/[ ,]+/).filter(Boolean).slice(-1)[0] || "";
  const qs: [string, string][] = [];
  if (isbn) qs.push(["isbn", isbn]);
  if (title) { qs.push(["t", cleanTitle(title) + (surname ? " " + surname : "")]); qs.push(["t", cleanTitle(title)]); }
  const seen = new Set<string>();
  const nums = String(title || "").match(/\d+/g) || [];
  for (const [kind, q] of qs) {
    let cands = (await mgSearch(q)).filter((c) => !seen.has(c.slug));
    if (kind !== "isbn" && nums.length) cands = cands.filter((c) => { const cn = String(c.name).match(/\d+/g) || []; return nums.every((n) => cn.includes(n)); });
    for (const c of cands) { c.score = kind === "isbn" ? 1 : dice(cleanTitle(title), cleanTitle(c.name)); if (author && !authorOk(author, c.author)) c.score -= 0.5; }
    cands.sort((a, b) => b.score - a.score);
    for (const c of cands.filter((x) => x.score >= 0.62).slice(0, 2)) {
      seen.add(c.slug);
      const out = await mgBook(c.slug);
      if (!out) continue;
      if (kind === "isbn" ? out.isbn !== isbn && !authorOk(author, out.author) : !authorOk(author, out.author)) continue;
      out.match = kind === "isbn" && out.isbn === isbn ? "isbn" : "назва";
      return out;
    }
  }
  return null;
}
