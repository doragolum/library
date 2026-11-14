// Gemini (лише безкоштовний тариф) і все, що з ним пов'язано: скриншот / текст / голосове / сторінка книги → картки книг.
// Ключ — секрет GEMINI_API_KEY у Supabase; модель можна змінити секретом GEMINI_MODEL.
import { fromMegogo, mgBook, getHtml, htmlText, norm, dice, authorOk } from "./megogo.ts";
import { parseGoodreads } from "./goodreads.ts";
import { pubCanon } from "./pub.ts";
type Row = Record<string, any>;

export class AiError extends Error {}

export function geminiModels() {
  const own = (Deno.env.get("GEMINI_MODEL") || "").trim();
  return [...new Set([own, "gemini-flash-latest", "gemini-3.8-flash", "gemini-flash-lite-latest"].filter(Boolean))];
}

/** Повертає розібраний JSON або null, якщо ключа немає. Моделі по черзі, якщо 404/429/500/503. */
export async function gemini(parts: Row[], prompt: string): Promise<any> {
  const key = (Deno.env.get("GEMINI_API_KEY") || "").trim();
  if (!key) return null;
  const body = JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }, ...parts] }], generationConfig: { temperature: 0, responseMimeType: "application/json" } });
  let last = "";
  for (const m of geminiModels()) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
      method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": key }, body,
    }).catch(() => null);
    if (!r) { last = "0 мережа"; continue; }
    if (r.status === 200) {
      const j = await r.json();
      const txt = ((j.candidates || [])[0]?.content?.parts || []).map((p: Row) => p.text || "").join("").replace(/^```(?:json)?\s*|\s*```$/g, "");
      try { return JSON.parse(txt); } catch { throw new AiError("Gemini відповів незрозуміло. Спробуйте ще раз."); }
    }
    last = r.status + " " + (await r.text()).slice(0, 200);
    if (![404, 429, 500, 503].includes(r.status)) break;
  }
  if (/^(400|401|403)/.test(last) && /key|ключ|API_KEY|permission/i.test(last)) throw new AiError("Gemini не прийняв ключ. Перевірте секрет GEMINI_API_KEY у Supabase.");
  if (/^429/.test(last)) throw new AiError("Ліміт Gemini на зараз вичерпано. Спробуйте за хвилину.");
  throw new AiError("Gemini недоступний (" + last.slice(0, 60) + ").");
}

export const AI_PROMPT = () =>
  "Ти допомагаєш вести облік книжок українською. На скриншоті(ах) або в тексті — анонс, сторінка книги чи список книг українського видавництва або книгарні. " +
  'Знайди КОЖНУ книгу і поверни JSON {"items":[{"title":"","author":"","series":"","part":"","total":"","pub":"","price":null,"release":"","avail":"","isbn":""}]}. ' +
  "title — назва книги українською без номера тому і без назви серії; author — автор українською, як на обкладинці (Ім'я Прізвище); series — назва циклу, якщо книга з серії; part — номер тому; " +
  "total — скільки всього томів у серії, якщо відомо; pub — видавництво; price — ціна в гривнях числом (якщо є знижка — кінцева ціна); " +
  "release — дата виходу у форматі YYYY-MM-DD або YYYY-MM, якщо вказана (поточний рік " + new Date().getFullYear() + "); " +
  'avail — одне з: "Передзамовлення", "Є у продажу", "Анонс" або ""; isbn — лише цифри. Чого не видно — залиш порожнім, нічого не вигадуй.';

/* ---------- приватність скриншотів замовлень ---------- */
const PRIV = /\+\s*3\s*8|\b380\d{9}\b|(?:^|\D)\(?0\d{2}\)?[\s-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?:\D|$)|[\w.+-]+@[\w-]+\.[\w.]+|отримувач|одержувач|адрес|відділен|поштомат|телефон|прізвище|піб\b|п\.і\.б|вулиц|вул\.|буд\.|кв\.|індекс|доставк|оплат|способ/i;
export const looksPrivate = (t: string) => String(t || "").split(/\n/).filter((l) => PRIV.test(l)).length >= 2 || /отримувач|одержувач|номер телефону|\+380/i.test(t);
export const redact = (t: string) => String(t || "").split(/\n/).filter((l) => !PRIV.test(l)).join("\n");

/* ---------- дати ---------- */
export const todayKyiv = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Kyiv" });
const MONTHS = ["січ", "лют", "бер", "квіт", "трав", "черв", "лип", "серп", "вер", "жовт", "лист", "груд"];
/** «03.2027», «15.03.2027», «2027-03», «березень», «у березні 2027» → YYYY-MM-DD. */
export function parseRelease(t: string, today = todayKyiv()) {
  t = String(t || "").toLowerCase().trim();
  let m;
  if ((m = t.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/))) return `${m[1]}-${m[2].padStart(2, "0")}-${(m[3] || "1").padStart(2, "0")}`;
  if ((m = t.match(/^(?:(\d{1,2})[.\/])?(\d{1,2})[.\/](\d{2,4})$/))) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return `${y}-${m[2].padStart(2, "0")}-${(m[1] || "1").padStart(2, "0")}`; }
  for (let i = 0; i < 12; i++) {
    if (t.includes(MONTHS[i])) {
      const ym = t.match(/(20\d{2})/), mm = String(i + 1).padStart(2, "0");
      let yr = ym ? ym[1] : today.slice(0, 4);
      if (!ym && `${yr}-${mm}` < today.slice(0, 7)) yr = String(Number(yr) + 1);
      const dm = t.match(/^(\d{1,2})\s/);
      return `${yr}-${mm}-${(dm ? dm[1] : "1").padStart(2, "0")}`;
    }
  }
  return "";
}

export function isbnKey(v: unknown): string {
  let d = String(v ?? "").replace(/[^0-9Xx]/g, "").toUpperCase();
  if (d.length === 10) {
    const b = "978" + d.slice(0, 9);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(b[i]) * (i % 2 ? 3 : 1);
    d = b + ((10 - (sum % 10)) % 10);
  }
  return /^\d{13}$/.test(d) ? d : "";
}

/** MEGOGO → поля картки сайту. */
export const mgItem = (y: Row) => ({ title: y.title, author: y.author, series: y.series || "", part: y.series_num ? String(y.series_num) : "", pub: y.publisher ? pubCanon(y.publisher) : "",
  price: y.price ?? null, release: y.release || "", avail: y.avail || "", isbn: y.isbn || "", orig: y.orig_title || "", src: y.url, cover: y.cover || "" });

/**
 * Доповнює картки: MEGOGO (серія, том, ISBN, дата), прив'язка до вашої серії (схожа назва, той самий автор),
 * статус «Анонс / Передзамовлення / Є у продажу» за датою, дублі (ISBN, потім назва + автор), чого бракує (need).
 * ctx: {books, wish} у форматі readAll сайту.
 */
export async function enrichItems(items: Row[], ctx: { books: Row[]; wish: Row[] }, budgetMs = 20000) {
  const t0 = Date.now(), today = todayKyiv();
  const lib = ctx.books || [], wish = ctx.wish || [];
  for (const x of items) {
    for (const k of ["title", "author", "series", "pub", "avail", "release", "orig"]) x[k] = String(x[k] ?? "").trim();
    x.isbn = String(x.isbn || "").replace(/\D/g, "");
    x.part = x.part == null ? "" : String(x.part).trim(); x.total = x.total == null ? "" : String(x.total).trim();
    if (x.pub) x.pub = pubCanon(x.pub);
    if (/^\d{4}-\d{2}$/.test(x.release)) x.release += "-01";
    if (x.release && !/^\d{4}-\d{2}-\d{2}$/.test(x.release)) x.release = "";
    // 1. MEGOGO — якщо бракує даних
    if (x.title && !/MEGOGO/.test(x.from || "") && (!x.author || !x.isbn || !x.release || (x.series && !x.part) || !x.series) && items.length <= 6 && Date.now() - t0 < budgetMs) {
      try {
        const y = await fromMegogo(x.isbn, x.title, x.author, x.pub);
        if (y && !y.pubMismatch && (!x.author || authorOk(x.author, y.author))) {
          const fill: Row = mgItem(y);
          for (const k of ["author", "series", "part", "isbn", "pub", "release", "avail", "orig", "cover"]) if (!x[k] && fill[k]) x[k] = String(fill[k]);
          if (!x.src) x.src = y.url;
          x.from = x.from ? x.from + " + MEGOGO" : "MEGOGO";
        }
      } catch { /* */ }
    }
    // 2. номер тому з назви
    if (!x.part) { const pm = x.title.match(/(?:книга|том|частина|book)\s*(\d+)\b/i); if (pm && x.series) x.part = pm[1]; }
    // 3. ваша серія: той самий автор + схожа назва
    if (x.series && x.author) {
      let best: Row | null = null, sc = 0;
      for (const b of [...lib, ...wish]) {
        if (!b.series || b.series === "-" || !authorOk(x.author, b.author)) continue;
        const d = dice(b.series, x.series);
        if (d > sc) { sc = d; best = b; }
      }
      if (best && sc >= 0.6) {
        if (best.series !== x.series) x.serWas = x.series;
        x.series = best.series; x.serKnown = true;
        if (!x.total && best.total) x.total = String(best.total);
      }
    }
    // 4. статус за датою
    if (!x.avail && x.release) x.avail = x.release > today ? (x.price ? "Передзамовлення" : "Анонс") : (x.price ? "Є у продажу" : "");
    // 5. дублі
    const k = isbnKey(x.isbn);
    let dup: Row | null = null;
    const same = (b: Row) => norm(b.title) === norm(x.title) && (!x.author || authorOk(x.author, b.author));
    if (k) {
      const b = lib.find((b) => isbnKey(b.isbn) === k); if (b) dup = { kind: "library", row: b.row, title: b.title, status: b.avail || "", by: "ISBN" };
      if (!dup) { const w = wish.find((w) => isbnKey(w.isbn) === k); if (w) dup = { kind: "wish", row: w.row, title: w.title, status: w.status, by: "ISBN" }; }
    }
    if (!dup && x.title) {
      const b = lib.find(same); if (b) dup = { kind: "library", row: b.row, title: b.title, status: b.avail || "", by: "назва" };
      if (!dup) { const w = wish.find(same); if (w) dup = { kind: "wish", row: w.row, title: w.title, status: w.status, by: "назва" }; }
    }
    if (dup) x.dup = dup; else delete x.dup;
    // 6. чого бракує
    x.need = [];
    if (!x.author) x.need.push("author");
    if (x.series && !x.part) x.need.push("part");
    if (!x.release && ["Анонс", "Передзамовлення", ""].includes(x.avail)) x.need.push("release");
  }
  return items;
}

/** Gemini → картки. {nokey:true}, якщо ключа немає. */
export async function aiBooks(parts: Row[], ctx: { books: Row[]; wish: Row[] }) {
  const res = await gemini(parts, AI_PROMPT());
  if (!res) return { nokey: true, items: [] as Row[] };
  let items = res.items || res || [];
  if (!Array.isArray(items)) items = [];
  items = items.filter((x: Row) => x && x.title).slice(0, 30);
  try { await enrichItems(items, ctx, 20000); } catch { /* */ }
  return { items };
}

/** Дані книги зі сторінки за посиланням: MEGOGO і Goodreads — напряму, інші сайти — дані сторінки (+ Gemini, якщо є ключ). */
export async function bookFromUrl(url: string): Promise<Row[]> {
  url = String(url || "").trim().replace(/[)\].,;»]+$/, "");
  if (!/^https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:[\/?#]|$)/i.test(url) || /\/\/(localhost|[\d.]+)(?:[:\/]|$)/i.test(url)) throw new AiError("Це не схоже на посилання на сторінку книги.");
  url = url.replace(/^http:/i, "https:").replace(/([?&])(utm_[^=&]+|fbclid|gclid)=[^&#]*/gi, "$1").replace(/[?&]+(#|$)/, "$1");
  const mg = url.match(/mbooks\.com\.ua\/book\/([^\/?#]+)/i);
  if (mg) {
    const y = await mgBook(mg[1]);
    if (!y) throw new AiError("MEGOGO не віддав сторінку книги. Спробуйте ще раз.");
    return [{ ...mgItem(y), from: "MEGOGO" }];
  }
  if (/goodreads\.com\/book\/show\//i.test(url)) {
    const r = await getHtml(url);
    if (r.code !== 200) throw new AiError("Goodreads зараз не відповідає. Спробуйте за хвилину.");
    const g = parseGoodreads(r.html, url);
    return g?.title ? [{ title: g.title, author: g.author || "", series: g.series || "", part: g.series_num ? String(g.series_num) : "", isbn: String(g.isbn || "").replace(/\D/g, ""),
      orig: g.orig_title || "", src: url.replace(/[?#].*$/, ""), cover: g.cover || "", from: "Goodreads" }] : [];
  }
  const res = await getHtml(url);
  if (res.code !== 200) throw new AiError(`Сайт не віддав сторінку (код ${res.code}). Надішліть скриншот замість посилання.`);
  const html = res.html;
  let ld: Row = {};
  const pick = (o: any): void => {
    if (!o || typeof o !== "object") return;
    if (Array.isArray(o)) return o.forEach(pick);
    if (o["@graph"]) pick(o["@graph"]);
    const t = [].concat(o["@type"] || []).join(" ");
    if (!/Book|Product/i.test(t) || ld.title) return;
    const au = ([] as any[]).concat(o.author || o.brand || []).map((a) => (typeof a === "string" ? a : a?.name)).filter(Boolean);
    const of = ([] as any[]).concat(o.offers || [])[0] || {};
    let cover: any = ([] as any[]).concat(o.image || [])[0] || "";
    if (typeof cover === "object") cover = cover.url || "";
    ld = { title: htmlText(o.name || ""), author: /Book/i.test(t) ? au.join(", ") : "", isbn: String(o.isbn || o.gtin13 || o.gtin || "").replace(/\D/g, ""),
      price: of.price ? Number(String(of.price).replace(",", ".")) : null, cover,
      avail: /PreOrder/i.test(of.availability || "") ? "Передзамовлення" : /InStock/i.test(of.availability || "") ? "Є у продажу" : /OutOfStock|Discontinued/i.test(of.availability || "") ? "Немає у продажу" : "",
      pub: o.publisher ? pubCanon(typeof o.publisher === "string" ? o.publisher : o.publisher.name || "") : "" };
  };
  const re = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) { try { pick(JSON.parse(m[1])); } catch { /* */ } }
  const meta = (p: string) => { const x = html.match(new RegExp('<meta[^>]+(?:property|name)="' + p + '"[^>]+content="([^"]*)"', "i")) || html.match(new RegExp('<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="' + p + '"', "i")); return x ? htmlText(x[1]) : ""; };
  const ogt = meta("og:title") || htmlText((html.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const body = htmlText(html.replace(/<(script|style|noscript|svg|header|footer|nav)[\s\S]*?<\/\1>/gi, " ")).replace(/\s+/g, " ");
  let out: Row | null = null;
  try {
    const ai = await gemini([{ text: "Сторінка книги з сайту " + url.split("/")[2] + ".\nЗаголовок: " + ogt + "\nОпис: " + meta("og:description") +
      (ld.title ? "\nДані сторінки: " + JSON.stringify(ld) : "") + "\nТекст сторінки:\n" + body.slice(0, 7000) }],
      AI_PROMPT() + " Це ОДНА книга — поверни лише її (головну книгу сторінки, не рекомендації).");
    const it = ai && (ai.items || ai);
    if (Array.isArray(it) && it[0]?.title) out = it[0];
  } catch { /* */ }
  if (!out && !ld.title) {
    if (!ogt) return [];
    out = { title: ogt.split(/\s+[|–—-]\s+/)[0] };
  }
  out = out || {};
  for (const k of ["title", "author", "isbn", "pub", "cover", "avail"]) if (ld[k] && (!out[k] || k === "isbn")) out[k] = ld[k];
  if (ld.price != null && !isNaN(ld.price)) out.price = ld.price;
  if (out.pub) out.pub = pubCanon(out.pub);
  out.src = url; out.from = url.split("/")[2].replace(/^www\./, "");
  return [out];
}
