// Goodreads: сторінка книги за ISBN або за посиланням → назва, автор, серія, обкладинка, опис.
import { getHtml, htmlText } from "./megogo.ts";
type Row = Record<string, any>;

export function parseGoodreads(h: string, url: string): Row | null {
  const out: Row = { source: "Goodreads", url };
  const m = h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const j = JSON.parse(m[1]);
      out.title = j.name; out.cover = j.image; out.pages = Number(j.numberOfPages) || null;
      const au = [].concat(j.author || []) as Row[];
      if (au.length) out.author = au.map((a) => a.name).join(", ");
      if (j.isbn) out.isbn = String(j.isbn).replace(/[^0-9Xx]/g, "");
      if (j.inLanguage) out.lang = j.inLanguage;
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
  const dm = h.match(/data-testid="description"[\s\S]*?<span class="Formatted">([\s\S]*?)<\/span>/);
  const d = dm ? htmlText(dm[1]) : "";
  if (d) out.description = d.slice(0, 2500);
  return out.cover || out.title ? out : null;
}

export async function fromGoodreads(isbn: string): Promise<Row | null> {
  const url = "https://www.goodreads.com/book/isbn/" + isbn;
  const r = await getHtml(url);
  return r.code === 200 && r.html ? parseGoodreads(r.html, url) : null;
}
