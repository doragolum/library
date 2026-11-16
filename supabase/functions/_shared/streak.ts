// Серія читання (16.11.2026, як у Дуолінго). Та сама логіка є в index.html (streakDays / streakInfo) — міняти разом.
// Дні читання:
//  · від початку до кінця кожної дочитаної книги (дати з календаря читання);
//  · дата початку й дата прочитання будь-якої книги;
//  · для книги «читаю» — дні від початку до запуску серії (kv streak.since), далі лише позначки;
//  · позначки в kv streak.days: закладка (поточна сторінка), «Читала» в боті чи в додатку.
// Пропуски: 2 безкоштовні на календарний місяць, лише від запуску серії (до нього прогалини просто обривають серію). Пропущений день списує пропуск сам; «Використати пропуск» (kv streak.skips) теж рахується.
import { addDays } from "./texts.ts";

type Row = Record<string, any>;
export const SKIPS_PER_MONTH = 2;
export const STREAK_DEFAULT = { on: true, hour: 20 };

const dBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
const low = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function streakDays(books: Row[], st: Row, today: string): Record<string, 1> {
  const set: Record<string, 1> = {}, since = st?.since || today;
  const range = (from: string, to: string) => { const n = Math.min(dBetween(from, to), 400); for (let i = 0; i <= n; i++) set[addDays(from, i)] = 1; };
  for (const b of books || []) {
    if (b.started) set[b.started] = 1;
    if (b.readOn) set[b.readOn] = 1;
    if (b.started && b.readOn && b.readOn >= b.started) range(b.started, b.readOn);
    else if (b.started && !b.readOn && low(b.status) === "читаю") { const to = addDays(since, -1); if (to >= b.started) range(b.started, to < today ? to : today); }
  }
  for (const d of st?.days || []) set[d] = 1;
  for (const d of Object.keys(set)) if (d > today) delete set[d];
  return set;
}

/** Поточна серія: n днів читання поспіль (пропуски тримають серію, але не додають днів). */
export function streakInfo(books: Row[], st: Row, today: string) {
  const set = streakDays(books, st, today), since = st?.since || today, manual: Record<string, 1> = {};
  for (const d of st?.skips || []) manual[d] = 1;
  const used: Record<string, number> = {};
  for (const d of Object.keys(manual)) used[d.slice(0, 7)] = (used[d.slice(0, 7)] || 0) + 1;
  const all = Object.keys(set).sort(), first = all[0] || today;
  const skipped: string[] = [];
  let n = 0, d = set[today] || manual[today] ? today : addDays(today, -1);
  while (d >= first) {
    if (set[d]) n++;
    else if (manual[d]) skipped.push(d);
    else if (d >= since && (used[d.slice(0, 7)] || 0) < SKIPS_PER_MONTH) { used[d.slice(0, 7)] = (used[d.slice(0, 7)] || 0) + 1; skipped.push(d); }
    else break;
    d = addDays(d, -1);
  }
  const ym = today.slice(0, 7);
  if (!n) { skipped.length = 0; used[ym] = Object.keys(manual).filter((x) => x.slice(0, 7) === ym).length; }
  return { n, readToday: !!set[today], skipToday: !!manual[today], skipped, left: Math.max(0, SKIPS_PER_MONTH - (used[ym] || 0)), best: Math.max(n, bestStreak(set, manual, today, since)), set };
}

/** Найдовша серія за всю історію з тими самими пропусками. */
export function bestStreak(set: Record<string, 1>, manual: Record<string, 1>, today: string, since = today) {
  const all = Object.keys(set).sort();
  if (!all.length) return 0;
  let best = 0, cur = 0, used: Record<string, number> = {};
  for (let d = all[0]; d <= today; d = addDays(d, 1)) {
    const ym = d.slice(0, 7);
    if (set[d]) { cur++; if (cur > best) best = cur; continue; }
    if (d === today) break;
    if (manual[d] || (d >= since && (used[ym] || 0) < SKIPS_PER_MONTH)) { used[ym] = (used[ym] || 0) + 1; continue; }
    cur = 0;
  }
  return best;
}

/** Книга, яку читає зараз (остання розпочата зі статусом «читаю»). */
export function currentBook(books: Row[]) {
  return (books || []).filter((b) => low(b.status) === "читаю").sort((a, b) => String(b.started || "").localeCompare(String(a.started || "")))[0] || null;
}

export const dayWord = (n: number) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? "день" : a >= 2 && a <= 4 && (b < 12 || b > 14) ? "дні" : "днів"; };

/** Вечірнє нагадування (варіант A+): серія, поточна книга й сторінка, пропуски; кнопки «Читала», «Закладка», «Використати пропуск», «Нагадати о 22:00». */
export function streakMessage(data: Row, today: string, esc: (s: unknown) => string, late = false) {
  const st = { ...STREAK_DEFAULT, ...(data.streak || {}) }, info = streakInfo(data.books || [], st, today), b = currentBook(data.books || []);
  let t = "Сьогодні ще не читала 📖\n" + (info.n ? "Серія: <b>" + info.n + " " + dayWord(info.n) + "</b>. Не зупиняйся!" : "Почни нову серію сьогодні!");
  if (b) t += "\n\nЗараз читаєш «" + esc(b.title) + "»" + (b.page ? ", стор. " + b.page + (b.pages ? " з " + b.pages : "") : "") + ".";
  t += "\n<i>Пропусків лишилось: " + info.left + " з " + SKIPS_PER_MONTH + "</i>";
  const row2: Row[] = [];
  if (info.left > 0) row2.push({ text: "❄ Використати пропуск", callback_data: "s:skip" });
  if (!late) row2.push({ text: "Нагадати о 22:00", callback_data: "s:later" });
  const kb: Row[][] = [[{ text: "✅ Читала", callback_data: "s:read" }, { text: "📑 Закладка", callback_data: "s:page" }]];
  if (row2.length) kb.push(row2);
  return { text: t, kb, info };
}
