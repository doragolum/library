// Тексти для Телеграму: релізи, «ще не відправили», підсумок тижня/місяця, Київ, пошук «чи є в мене».
// data — у форматі readAll сайту (books, wish, sold).
import { esc } from "./tg.ts";
import { norm } from "./megogo.ts";
import { pIn, pFrom } from "./people.ts";
type Row = Record<string, any>;

export const NOT_SENT_DAYS = 5;
export const human = (iso: string) => { const p = String(iso).split("-"); return `${p[2]}.${p[1]}.${p[0]}`; };
export function addDays(iso: string, n: number) { const p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
export const weekday = (iso: string) => { const p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); };
const stars = (r: unknown) => "⭐".repeat(Math.round(Number(r) || 0));
const money = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " грн";
const site = (u: unknown) => String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
// Місця людини (етап 6): data.places з api; без нього — як у власниці.
const homeOf = (d: Row) => String(d.places?.home || "Роттердам");
const awayOf = (d: Row) => (d.places ? String(d.places.away || "") : "Київ");
const inAway = (d: Row) => { const a = awayOf(d); return (b: Row) => !!a && (b.place === a || b.avail === a); };
const inRange = (iso: unknown, a: string, b: string) => !!iso && String(iso) >= a && String(iso) <= b;
const k = (v: unknown) => String(v ?? "").trim().toLowerCase();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function reminderLine(w: Row, withDate = false) {
  let s = "• " + (withDate && w.release ? human(w.release) + " · " : "") + esc(w.author) + " — <b>" + esc(w.title) + "</b>";
  if (w.series) s += " (" + esc(w.series) + (w.part ? " #" + esc(w.part) : "") + ")";
  if (w.pub) s += ", " + esc(w.pub);
  if (w.status) s += " · " + esc(w.status);
  if (w.price != null) s += " · " + w.price + " грн";
  return s;
}
export function releaseText(data: Row, today: string) {
  const tomorrow = addDays(today, 1);
  const active = data.wish.filter((w: Row) => w.release && w.status !== "В бібліотеці");
  const t = active.filter((w: Row) => w.release === today), n = active.filter((w: Row) => w.release === tomorrow);
  const parts: string[] = [];
  if (t.length) parts.push("📚 <b>Сьогодні реліз</b> (" + human(today) + "):\n" + t.map((w: Row) => reminderLine(w)).join("\n"));
  if (n.length) parts.push("⏰ <b>Завтра реліз</b> (" + human(tomorrow) + "):\n" + n.map((w: Row) => reminderLine(w)).join("\n"));
  return parts.join("\n\n");
}
export function notSent(data: Row, today: string) {
  const limit = addDays(today, -NOT_SENT_DAYS);
  return data.wish.filter((w: Row) => w.status === "Замовлено" && !w.ttn && w.release && w.release <= limit).sort((a: Row, b: Row) => (a.release < b.release ? -1 : 1));
}
export function dailyText(data: Row, today: string) {
  const parts: string[] = [];
  const rel = releaseText(data, today);
  if (rel) parts.push(rel);
  const limit = addDays(today, -NOT_SENT_DAYS);
  const ns = notSent(data, today).filter((w: Row) => w.release === limit);
  if (ns.length) parts.push("📦 <b>Вийшло " + NOT_SENT_DAYS + " днів тому, а ТТН досі немає</b>. Може, варто написати магазину:\n" +
    ns.map((w: Row) => reminderLine(w, true) + (w.where || w.site ? " · " + esc(w.where || site(w.site)) : "") + (w.order ? " № " + esc(w.order) : "")).join("\n"));
  const due = data.books.filter((b: Row) => b.avail === "позичена" && b.lentDue === today);
  if (due.length) parts.push("🤝 <b>Сьогодні мають повернути</b>:\n" + due.map((b: Row) => "• " + esc(b.title) + (b.lentTo ? " — " + esc(b.lentTo) : "")).join("\n"));
  return parts.join("\n\n");
}
export function weekText(data: Row, today: string, now: boolean) {
  let from = addDays(today, -7), to = addDays(today, -1);
  if (now) { from = addDays(today, -6); to = today; }
  const read = data.books.filter((b: Row) => inRange(b.readOn, from, to));
  const started = data.books.filter((b: Row) => inRange(b.started, from, to));
  const bought = data.books.filter((b: Row) => inRange(b.bought, from, to));
  const reading = data.books.filter((b: Row) => k(b.status) === "читаю");
  const spent = bought.reduce((a: number, b: Row) => a + (b.price || 0), 0);
  const nextEnd = addDays(today, 7);
  const soon = data.wish.filter((w: Row) => w.release && w.release >= today && w.release <= nextEnd && w.status !== "В бібліотеці").sort((a: Row, b: Row) => (a.release < b.release ? -1 : 1));
  const ns = notSent(data, today);
  const lentLate = data.books.filter((b: Row) => b.avail === "позичена" && b.lentDue && b.lentDue < today);
  const onWay = data.wish.filter((w: Row) => w.ttn && ["Відправлено", "Створено ТТН", "В дорозі"].includes(w.status));
  const kyivParcel = data.books.filter((b: Row) => inAway(data)(b) && b.parcel);
  let s = "🗓 <b>Тиждень " + human(from).slice(0, 5) + "–" + human(to).slice(0, 5) + "</b>\n";
  s += "📖 Прочитано: <b>" + read.length + "</b>" + (read.length ? " (" + read.reduce((a: number, b: Row) => a + (b.pages || 0), 0) + " стор.)" : "") + "\n";
  for (const b of read) s += "   • " + esc(b.title) + (b.rating ? " " + stars(b.rating) : "") + "\n";
  if (started.length) s += "▶️ Почала: " + started.map((b: Row) => esc(b.title)).join(", ") + "\n";
  if (reading.length) s += "📚 Зараз читаю: " + reading.map((b: Row) => esc(b.title)).join(", ") + "\n";
  s += "🛍 Додано книг: <b>" + bought.length + "</b>" + (spent ? " на " + money(spent) : "") + "\n";
  if (onWay.length) s += "🚚 В дорозі: " + onWay.length + " кн.\n";
  if (kyivParcel.length) s += "✈️ Посилка " + esc(pFrom(awayOf(data))) + ": " + kyivParcel.length + " кн.\n";
  if (soon.length) s += "\n⏰ <b>Релізи наступного тижня</b>\n" + soon.map((w: Row) => reminderLine(w, true)).join("\n") + "\n";
  if (ns.length) s += "\n📦 <b>Вийшли, але ще не відправлені</b>\n" + ns.map((w: Row) => reminderLine(w, true) + (w.where || w.site ? " · " + esc(w.where || site(w.site)) : "")).join("\n") + "\n";
  if (lentLate.length) s += "\n🤝 <b>Позичені, час повернути</b>\n" + lentLate.map((b: Row) => "• " + esc(b.title) + (b.lentTo ? " — " + esc(b.lentTo) : "") + " (до " + human(b.lentDue) + ")").join("\n") + "\n";
  return s.trim();
}
export function monthText(data: Row, today: string, now: boolean) {
  const p = today.split("-").map(Number);
  let y = p[0], m = p[1];
  if (!now) { m -= 1; if (m === 0) { m = 12; y -= 1; } }
  const ym = y + "-" + String(m).padStart(2, "0");
  const pm = m === 1 ? (y - 1) + "-12" : y + "-" + String(m - 1).padStart(2, "0");
  const inM = (iso: unknown, key: string) => !!iso && String(iso).slice(0, 7) === key;
  const read = data.books.filter((b: Row) => inM(b.readOn, ym));
  const readPrev = data.books.filter((b: Row) => inM(b.readOn, pm));
  const bought = data.books.filter((b: Row) => inM(b.bought, ym));
  const pages = read.reduce((a: number, b: Row) => a + (b.pages || 0), 0);
  const rated = read.filter((b: Row) => b.rating);
  const avg = rated.length ? rated.reduce((a: number, b: Row) => a + b.rating, 0) / rated.length : 0;
  const best = rated.slice().sort((a: Row, b: Row) => b.rating - a.rating)[0];
  const names = ["", "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
  let s = "📆 <b>" + names[m] + " " + y + "</b>\n";
  s += "📖 Прочитано: <b>" + read.length + "</b> кн., " + pages + " стор." + (readPrev.length || read.length ? " (минулого місяця " + readPrev.length + ")" : "") + "\n";
  if (rated.length) s += "⭐ Середня оцінка: " + avg.toFixed(1) + (best ? ", найкраща: " + esc(best.title) + " " + stars(best.rating) : "") + "\n";
  for (const b of read) s += "   • " + esc(b.title) + " — " + esc(b.author) + (b.rating ? " " + stars(b.rating) : "") + "\n";
  s += "🛍 Додано в бібліотеку: <b>" + bought.length + "</b> на " + money(bought.reduce((a: number, b: Row) => a + (b.price || 0), 0)) + "\n";
  const unread = data.books.filter((b: Row) => k(b.status) === "не читала" && !["продана", "подарована"].includes(b.avail)).length;
  return s + "📚 Непрочитаних у бібліотеці: " + unread;
}
export function kyivText(data: Row) {
  const a = awayOf(data);
  if (!a) return "У тебе немає другого місця. Додати можна в додатку: «Я» → «Мої місця».";
  const kk = data.books.filter(inAway(data));
  if (!kk.length) return cap(pIn(a)) + " книг немає.";
  const groups: Record<string, Row[]> = {};
  for (const b of kk) { const p = b.parcel ? "0" : (b.prio || "9"); (groups[p] = groups[p] || []).push(b); }
  return "🏠 <b>Книги " + esc(pIn(a)) + ": " + kk.length + "</b>\n" + Object.keys(groups).sort().map((p) => {
    const label = p === "0" ? "✈️ У посилці" : p === "9" ? "Без пріоритету" : "Пріоритет " + p;
    return "\n<b>" + label + "</b> (" + groups[p].length + ")\n" + groups[p].map((b) => "• " + esc(b.title) + " — " + esc(b.author) + (b.parcel ? " · " + esc(b.parcel) : "")).join("\n");
  }).join("\n");
}
/** /rotterdam: коротке зведення книг у Роттердамі (повний список із кількох сотень книг задовгий). */
export function rotterdamText(data: Row) {
  const gone = (b: Row) => ["продана", "подарована"].includes(k(b.avail));
  const away = inAway(data), h = homeOf(data);
  const rr = data.books.filter((b: Row) => !away(b) && !gone(b));
  if (!rr.length) return cap(pIn(h)) + " книг немає.";
  const cnt = (f: (b: Row) => boolean) => rr.filter(f).length;
  const st = ["не читала", "читаю", "прочитано", "закинула"].map((s) => [s, cnt((b) => k(b.status) === s)] as [string, number]).filter((x) => x[1]);
  const list = (title: string, xs: Row[], line: (b: Row) => string) => xs.length ? "\n\n<b>" + title + " (" + xs.length + ")</b>\n" + xs.slice(0, 10).map(line).join("\n") + (xs.length > 10 ? "\n…і ще " + (xs.length - 10) : "") : "";
  const lent = rr.filter((b: Row) => k(b.avail) === "позичена");
  const sale = rr.filter((b: Row) => k(b.avail) === "на продаж");
  const shelves: Record<string, number> = {};
  for (const b of rr) { const s = String(b.shelf || "").trim() || "без полиці"; shelves[s] = (shelves[s] || 0) + 1; }
  const sh = Object.keys(shelves).sort((a, b) => a.localeCompare(b, "uk", { numeric: true })).map((s) => esc(s) + " — " + shelves[s]).join(" · ");
  return "📍 <b>Книги " + esc(pIn(h)) + ": " + rr.length + "</b>\n" + st.map((x) => x[0] + " " + x[1]).join(" · ") +
    list("Позичені", lent, (b) => "• " + esc(b.title) + " — " + esc(b.lentTo || "кому, не вказано") + (b.lentDue ? ", повернути до " + human(String(b.lentDue)).slice(0, 5) : "")) +
    list("На продаж", sale, (b) => "• " + esc(b.title) + " — " + esc(b.author)) +
    "\n\n<b>По полицях</b>\n" + sh;
}
export function findText(q: string, data: Row) {
  const words = norm(q).split(" ").filter(Boolean);
  const hit = (parts: unknown[]) => { const s = norm(parts.join(" ")); return words.every((w) => s.includes(w)); };
  const b = data.books.filter((x: Row) => hit([x.title, x.author, x.series, x.pub]));
  const w = data.wish.filter((x: Row) => hit([x.title, x.author, x.series, x.pub]));
  const s = data.sold.filter((x: Row) => hit([x.title, x.author, x.series]));
  if (!b.length && !w.length && !s.length) return "❌ «" + esc(q) + "» ніде немає: ні в бібліотеці, ні в бажанках, ні серед проданих.";
  const out: string[] = [];
  if (b.length) out.push("✅ <b>У бібліотеці (" + b.length + ")</b>\n" + b.slice(0, 10).map((x: Row) => {
    const st = x.avail;
    const where = st === "позичена" ? "позичена" + (x.lentTo ? " (" + esc(x.lentTo) + ")" : "")
      : inAway(data)(x) ? esc(awayOf(data)) + (st !== "у колекції" ? ", " + esc(st) : "") + (x.prio ? ", пріоритет " + esc(x.prio) : "")
      : st !== "у колекції" ? esc(st) + (x.shelf ? ", " + esc(x.shelf) : "")
      : esc(x.shelf || "полицю не вказано");
    return "• <b>" + esc(x.title) + "</b> — " + esc(x.author) + (x.series && x.series !== "-" && x.type === "Серія" ? " (" + esc(x.series) + (x.num ? " #" + esc(x.num) : "") + ")" : "") +
      "\n   📍 " + where + " · " + esc(x.status || "");
  }).join("\n") + (b.length > 10 ? "\n…і ще " + (b.length - 10) : ""));
  if (w.length) out.push("🛒 <b>У бажанках (" + w.length + ")</b>\n" + w.slice(0, 8).map((x: Row) => "• <b>" + esc(x.title) + "</b> — " + esc(x.author) + " · " + esc(x.status || "") + (x.release ? " · реліз " + human(x.release) : "")).join("\n"));
  if (s.length) out.push("💰 <b>Продано (" + s.length + ")</b>\n" + s.slice(0, 5).map((x: Row) => "• " + esc(x.title) + " — " + esc(x.author)).join("\n"));
  return out.join("\n\n");
}
export const helpText = (_owner = true) => "📚 <b>Що я вмію</b>\n" +
  "• Надішли скриншот анонсу чи замовлення, посилання на сторінку книги або голосове («хочу нову книгу Маас, вийде в березні») — я складу картку і запропоную додати в бажанки або як замовлену. Чого бракує — перепитаю.\n" +
  "• Пошук, підсумки й серія читання — у додатку, нагадування приходять сповіщеннями з додатку («Я» → «Сповіщення»).\n" +
  "Кнопка <b>Nookly</b> внизу відкриває весь додаток.";

/* ---------- короткі сповіщення з додатку (16.11, погоджено): одна подія — одне сповіщення, без емодзі ----------
   Кожне: {kind, title, body, tag, id?, actions?}. kind — для перемикачів і панелі з кнопками на сайті. */
export type PushItem = { kind: string; title: string; body: string; tag: string; id?: number; actions?: { action: string; title: string }[] };
const q = (s: unknown) => "«" + String(s ?? "").trim() + "»";
const books = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? "книга" : a >= 2 && a <= 4 && (b < 12 || b > 14) ? "книги" : "книг"; };
const booksAcc = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? "книгу" : books(n); };
const releasesW = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? "реліз" : a >= 2 && a <= 4 && (b < 12 || b > 14) ? "релізи" : "релізів"; };
const pagesW = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? "сторінка" : a >= 2 && a <= 4 && (b < 12 || b > 14) ? "сторінки" : "сторінок"; };
const listT = (xs: Row[], max = 3) => xs.slice(0, max).map((x) => q(x.title)).join(", ") + (xs.length > max ? " і ще " + (xs.length - max) : "");
const LATER = { action: "later", title: "Завтра" };

export function pushMorning(data: Row, today: string, mute: number[] = [], onsale: Row[] = []): PushItem[] {
  const out: PushItem[] = [], tomorrow = addDays(today, 1), m = new Set(mute.map(Number));
  const active = data.wish.filter((w: Row) => w.release && w.status !== "В бібліотеці" && !m.has(Number(w.row)));
  const t = active.filter((w: Row) => w.release === today), n = active.filter((w: Row) => w.release === tomorrow);
  const tail = n.length ? (n.length === 1 ? "Завтра ще " + q(n[0].title) + "." : "Завтра ще " + n.length + " " + releasesW(n.length) + ".") : "";
  if (t.length === 1) out.push({ kind: "release", id: t[0].row, title: "Сьогодні виходить " + q(t[0].title), body: [t[0].author + ".", tail].filter(Boolean).join(" "), tag: "rel-" + t[0].row, actions: [{ action: "ordered", title: "Замовила" }, LATER] });
  else if (t.length > 1) out.push({ kind: "release", title: "Сьогодні " + t.length + " " + releasesW(t.length), body: listT(t) + "." + (tail ? " " + tail : ""), tag: "rel-" + today });
  else if (n.length === 1) out.push({ kind: "release", id: n[0].row, title: "Завтра виходить " + q(n[0].title), body: n[0].author + ".", tag: "rel-" + n[0].row, actions: [{ action: "ordered", title: "Замовила" }, LATER] });
  else if (n.length > 1) out.push({ kind: "release", title: "Завтра " + n.length + " " + releasesW(n.length), body: listT(n) + ".", tag: "rel-" + tomorrow });
  for (const w of notSent(data, today).filter((x: Row) => x.release === addDays(today, -NOT_SENT_DAYS))) {
    const shop = w.where || site(w.site);
    out.push({ kind: "ttn", id: w.row, title: "Немає ТТН уже " + NOT_SENT_DAYS + " днів", body: q(w.title) + (shop ? ", " + shop : "") + (w.order ? " № " + w.order : "") + ". Може, написати магазину?", tag: "ttn-" + w.row, actions: [LATER] });
  }
  for (const b of data.books.filter((x: Row) => x.avail === "позичена" && x.lentDue === today))
    out.push({ kind: "lent", id: b.row, title: (b.lentTo ? b.lentTo + " має повернути " : "Час повернути ") + q(b.title), body: "Сьогодні останній день.", tag: "lent-" + b.row, actions: [{ action: "returned", title: "Повернула" }, LATER] });
  const os = onsale.filter((x) => !m.has(Number(x.id)));
  if (os.length === 1) out.push({ kind: "onsale", id: os[0].id, title: q(os[0].t) + " уже в продажу", body: (os[0].a ? os[0].a + ". " : "") + "Чекала в бажанках як анонс. Можна замовляти.", tag: "sale-" + (os[0].id || today), actions: os[0].id ? [{ action: "ordered", title: "Замовила" }, LATER] : undefined });
  else if (os.length > 1) out.push({ kind: "onsale", title: os.length + " " + books(os.length) + " уже в продажу", body: listT(os.map((x) => ({ title: x.t }))) + ".", tag: "sale-" + today });
  return out;
}
export function pushWeek(data: Row, today: string): PushItem {
  const from = addDays(today, -7), to = addDays(today, -1);
  const read = data.books.filter((b: Row) => inRange(b.readOn, from, to)), pages = read.reduce((a: number, b: Row) => a + (b.pages || 0), 0);
  const bought = data.books.filter((b: Row) => inRange(b.bought, from, to)), spent = bought.reduce((a: number, b: Row) => a + (b.price || 0), 0);
  const soon = data.wish.filter((w: Row) => w.release && w.release >= today && w.release <= addDays(today, 7) && w.status !== "В бібліотеці").length;
  const title = read.length ? "Тиждень: " + read.length + " " + books(read.length) + (pages ? ", " + pages + " " + pagesW(pages) : "") : "Тиждень без дочитаних книг";
  const body = [bought.length ? "Додала " + bought.length + " " + booksAcc(bought.length) + (spent ? " на " + money(spent) : "") + "." : "", soon ? "Наступного тижня " + soon + " " + releasesW(soon) + "." : ""].filter(Boolean).join(" ") || "Нових книг не додавала.";
  return { kind: "week", title, body, tag: "week-" + today };
}
export function pushMonth(data: Row, today: string): PushItem {
  const p = today.split("-").map(Number); let y = p[0], mo = p[1] - 1; if (mo === 0) { mo = 12; y -= 1; }
  const ym = y + "-" + String(mo).padStart(2, "0");
  const names = ["", "Січень", "Лютий", "Березень", "Квітень", "Травень", "Червень", "Липень", "Серпень", "Вересень", "Жовтень", "Листопад", "Грудень"];
  const read = data.books.filter((b: Row) => b.readOn && String(b.readOn).slice(0, 7) === ym);
  const best = read.filter((b: Row) => b.rating).sort((a: Row, b: Row) => b.rating - a.rating)[0];
  const spent = data.books.filter((b: Row) => b.bought && String(b.bought).slice(0, 7) === ym).reduce((a: number, b: Row) => a + (b.price || 0), 0);
  return { kind: "month", title: names[mo] + ": прочитала " + read.length + " " + booksAcc(read.length), body: [best ? "Найкраща — " + q(best.title) + "." : "", spent ? "Витрачено " + money(spent) + "." : ""].filter(Boolean).join(" ") || "Подивись підсумок у додатку.", tag: "month-" + ym };
}
