// Тексти для Телеграму: релізи, «ще не відправили», підсумок тижня/місяця, Київ, пошук «чи є в мене».
// data — у форматі readAll сайту (books, wish, sold).
import { esc } from "./tg.ts";
import { norm } from "./megogo.ts";
type Row = Record<string, any>;

export const NOT_SENT_DAYS = 5;
export const human = (iso: string) => { const p = String(iso).split("-"); return `${p[2]}.${p[1]}.${p[0]}`; };
export function addDays(iso: string, n: number) { const p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10); }
export const weekday = (iso: string) => { const p = iso.split("-").map(Number); return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay(); };
const stars = (r: unknown) => "⭐".repeat(Math.round(Number(r) || 0));
const money = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") + " грн";
const site = (u: unknown) => String(u || "").replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*$/, "");
const inKyiv = (b: Row) => b.place === "Київ" || b.avail === "Київ";
const inRange = (iso: unknown, a: string, b: string) => !!iso && String(iso) >= a && String(iso) <= b;
const k = (v: unknown) => String(v ?? "").trim().toLowerCase();

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
  const kyivParcel = data.books.filter((b: Row) => inKyiv(b) && b.parcel);
  let s = "🗓 <b>Тиждень " + human(from).slice(0, 5) + "–" + human(to).slice(0, 5) + "</b>\n";
  s += "📖 Прочитано: <b>" + read.length + "</b>" + (read.length ? " (" + read.reduce((a: number, b: Row) => a + (b.pages || 0), 0) + " стор.)" : "") + "\n";
  for (const b of read) s += "   • " + esc(b.title) + (b.rating ? " " + stars(b.rating) : "") + "\n";
  if (started.length) s += "▶️ Почала: " + started.map((b: Row) => esc(b.title)).join(", ") + "\n";
  if (reading.length) s += "📚 Зараз читаю: " + reading.map((b: Row) => esc(b.title)).join(", ") + "\n";
  s += "🛍 Додано книг: <b>" + bought.length + "</b>" + (spent ? " на " + money(spent) : "") + "\n";
  if (onWay.length) s += "🚚 В дорозі: " + onWay.length + " кн.\n";
  if (kyivParcel.length) s += "✈️ Посилка з Києва: " + kyivParcel.length + " кн.\n";
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
  const kk = data.books.filter(inKyiv);
  if (!kk.length) return "У Києві книг немає.";
  const groups: Record<string, Row[]> = {};
  for (const b of kk) { const p = b.parcel ? "0" : (b.prio || "9"); (groups[p] = groups[p] || []).push(b); }
  return "🏠 <b>Книги в Києві: " + kk.length + "</b>\n" + Object.keys(groups).sort().map((p) => {
    const label = p === "0" ? "✈️ У посилці" : p === "9" ? "Без пріоритету" : "Пріоритет " + p;
    return "\n<b>" + label + "</b> (" + groups[p].length + ")\n" + groups[p].map((b) => "• " + esc(b.title) + " — " + esc(b.author) + (b.parcel ? " · " + esc(b.parcel) : "")).join("\n");
  }).join("\n");
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
      : inKyiv(x) ? "Київ" + (st !== "у колекції" ? ", " + esc(st) : "") + (x.prio ? ", пріоритет " + esc(x.prio) : "")
      : st !== "у колекції" ? esc(st) + (x.shelf ? ", " + esc(x.shelf) : "")
      : esc(x.shelf || "полицю не вказано");
    return "• <b>" + esc(x.title) + "</b> — " + esc(x.author) + (x.series && x.series !== "-" && x.type === "Серія" ? " (" + esc(x.series) + (x.num ? " #" + esc(x.num) : "") + ")" : "") +
      "\n   📍 " + where + " · " + esc(x.status || "");
  }).join("\n") + (b.length > 10 ? "\n…і ще " + (b.length - 10) : ""));
  if (w.length) out.push("🛒 <b>У бажанках (" + w.length + ")</b>\n" + w.slice(0, 8).map((x: Row) => "• <b>" + esc(x.title) + "</b> — " + esc(x.author) + " · " + esc(x.status || "") + (x.release ? " · реліз " + human(x.release) : "")).join("\n"));
  if (s.length) out.push("💰 <b>Продано (" + s.length + ")</b>\n" + s.slice(0, 5).map((x: Row) => "• " + esc(x.title) + " — " + esc(x.author)).join("\n"));
  return out.join("\n\n");
}
export const helpText = () => "📚 <b>Що я вмію</b>\n" +
  "• Напишіть назву, автора або серію, і я скажу, чи є книга в бібліотеці, де вона стоїть, чи є в бажанках або серед проданих.\n" +
  "• Надішліть скриншот анонсу чи замовлення, посилання на сторінку книги або голосове («хочу нову книгу Маас, вийде в березні») — я складу картку і запропоную додати в бажанки або як замовлену. Чого бракує — перепитаю.\n" +
  "• /week — підсумок тижня, /month — підсумок місяця, /kyiv — книги в Києві за пріоритетом.\n" +
  "• Сама нагадую про релізи, позичені книги і замовлення, які вийшли, але ще не відправлені.\n" +
  "Кнопка <b>Бібліотека</b> внизу відкриває весь додаток.";
