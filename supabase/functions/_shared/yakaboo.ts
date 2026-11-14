// Yakaboo: пошук паперової книги за назвою й автором. Дані беруться з __INITIAL_STATE__ сторінки пошуку.
import { getHtml, dice, authorOk, cleanTitle } from "./megogo.ts";
import { samePub } from "./pub.ts";
type Row = Record<string, any>;

/** Вирізає JSON-масив, що починається з позиції i (рядки з лапками враховуються). */
function sliceArray(t: string, i: number): string | null {
  let depth = 0, inStr = false;
  for (let k = i; k < t.length; k++) {
    const c = t[k];
    if (inStr) { if (c === "\\") k++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") { depth--; if (!depth) return t.slice(i, k + 1); }
  }
  return null;
}
const lab = (a: unknown) => (Array.isArray(a) ? a.map((x: Row) => x?.label).filter(Boolean).join(", ") : "");

export async function ybSearch(q: string): Promise<Row[]> {
  const r = await getHtml("https://www.yakaboo.ua/ua/search?q=" + encodeURIComponent(q), 15000);
  if (r.code !== 200) return [];
  const out: Row[] = [], seen = new Set<number>();
  let from = 0;
  for (;;) {
    const i = r.html.indexOf('"products":[', from);
    if (i < 0) break;
    from = i + 12;
    const raw = sliceArray(r.html, i + 11);
    if (!raw) continue;
    let arr: Row[] = [];
    try { arr = JSON.parse(raw); } catch { continue; }
    for (const p of arr) {
      if (!p?.name || seen.has(p.id)) continue;
      seen.add(p.id);
      const type = lab(p.book_publication_label);
      if (type && !/паперов/i.test(type)) continue;
      const isbn = String(p.barcode || lab(p.book_isbn_label)).replace(/[^0-9Xx]/g, "");
      const img = p.image || p.small_image || "";
      const inStock = (p.stock || []).some((x: Row) => x?.is_in_stock);
      out.push({
        source: "Yakaboo", url: p.url_path ? "https://www.yakaboo.ua/ua/" + p.url_path : null,
        title: p.name, author: lab(p.author_label), publisher: lab(p.book_publisher_label) || null,
        isbn: isbn.length === 13 || isbn.length === 10 ? isbn : null,
        cover: img ? "https://static.yakaboo.ua/media/catalog/product" + img : null,
        price: Number(p.final_price || p.price) || null, avail: inStock ? "Є у продажу" : "",
        release: p.published_at && p.published_at > new Date().toISOString().slice(0, 10) ? String(p.published_at).slice(0, 10) : null,
      });
    }
  }
  return out;
}

/** Найкращий збіг за назвою (і автором). */
export async function fromYakaboo(title: string, author: string, pub = ""): Promise<Row | null> {
  const surname = String(author || "").split(/[ ,]+/).filter(Boolean).slice(-1)[0] || "";
  const nums = String(title || "").match(/\d+/g) || [];
  for (const q of [cleanTitle(title) + (surname ? " " + surname : ""), cleanTitle(title)]) {
    let c = await ybSearch(q);
    if (nums.length) c = c.filter((x) => { const cn = String(x.title).match(/\d+/g) || []; return nums.every((n) => cn.includes(n)); });
    for (const x of c) { x.score = dice(cleanTitle(title), cleanTitle(x.title)); if (author && !authorOk(author, x.author)) x.score -= 0.5; }
    c.sort((a, b) => b.score - a.score);
    c = c.filter((x) => x.score >= 0.62);
    // видання потрібного видавництва; якщо його немає, інше — з позначкою pubMismatch
    const best = (pub && c.find((x) => samePub(pub, x.publisher))) || c[0];
    if (best) { best.match = "назва"; if (pub && !samePub(pub, best.publisher)) best.pubMismatch = true; return best; }
  }
  return null;
}
