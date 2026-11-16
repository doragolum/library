// Розклад (pg_cron): нагадування в Телеграм і сповіщеннями в додатку (push, 16.11) о 9:00 за часом людини (у Даші — Роттердам; етап 6: кожному, хто має Телеграм), нічне «вийшли з друку → Є у продажу», новини серій щопонеділка.
// Тіло: {job:"remind"} | {job:"night"} | {job:"news"} | {job:"streak"} (щогодини: вечірнє нагадування про серію читання); {job:"remind", test:true} — надіслати зараз релізи на 14 днів і тиждень (перевірка).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { tgSend, tgApi, tgChat, esc } from "../_shared/tg.ts";
import { streakMessage, STREAK_DEFAULT } from "../_shared/streak.ts";
import { todayKyiv } from "../_shared/ai.ts";
import { person, people, curUid, kvKey, hourIn, type Person } from "../_shared/people.ts";
import { pushHtml, pushTo } from "../_shared/push.ts";
import { dailyText, weekText, monthText, weekday, addDays, reminderLine } from "../_shared/texts.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
type Row = Record<string, any>;
async function kvGet(k: string, def: any = null) { const r = await db.from("kv").select("value").eq("key", kvKey(k, curUid())).maybeSingle(); return r.data?.value ?? def; }
async function kvSet(k: string, value: any, uid = curUid()) { const key = kvKey(k, uid); await db.from("kv").upsert({ key, value, updated_at: new Date().toISOString(), ...(key !== k ? { owner_id: uid } : {}) }); }
async function api(fn: string, arg: unknown) {
  const r = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/" + (fn === "lbApiNews" ? "ai" : "api"), { method: "POST", headers: { "Content-Type": "application/json", "x-import-token": String(await kvGet("import_token", "")) }, body: JSON.stringify({ fn, args: [arg], asUser: curUid() }) });
  const j = await r.json().catch(() => ({ ok: false, error: "База не відповіла" }));
  if (!j.ok) throw new Error(j.error || "Не вдалося");
  return j.data;
}
async function pushDevices(uid: number) { return ((await db.from("push_subs").select("id").eq("owner_id", uid)).data || []).length; }
const REMIND_HOUR = 9; // за часом людини
const here = () => person.getStore() as Person;
/** Робота для кожної людини по черзі (етап 6); помилка в одного не зупиняє інших. */
async function forEach(fn: () => Promise<Row>, onlyOwner = false) {
  const out: Row[] = [];
  for (const p of await people(db)) {
    if (onlyOwner && p.uid !== 1) continue;
    try { out.push({ uid: p.uid, ...(await person.run(p, fn)) }); } catch (e) { out.push({ uid: p.uid, error: String((e as Error)?.message ?? e) }); }
  }
  return { people: out };
}

async function remind(test: boolean) {
  const today = todayKyiv();
  if (!test) {
    if (hourIn(here().tz) < REMIND_HOUR) return { skipped: "ще рано" };
    if ((await kvGet("last_remind", "")) === today) return { skipped: "сьогодні вже надсилали" };
  }
  const data = await api("lbApiData", null);
  const msgs: string[] = [];
  if (test) {
    const end = addDays(today, 14);
    const list = data.wish.filter((w: Row) => w.release && w.release >= today && w.release <= end && w.status !== "В бібліотеці").sort((a: Row, b: Row) => (a.release < b.release ? -1 : 1));
    msgs.push("🔔 <b>Тест нагадувань.</b> Релізи найближчих 14 днів:\n" + (list.length ? list.map((w: Row) => reminderLine(w, true)).join("\n") : "немає"));
    msgs.push(weekText(data, today, true));
  } else {
    const d = dailyText(data, today);
    if (d) msgs.push(d);
    const os: Row = (await kvGet("onsale_today", {})) || {};
    if (os.date === today && os.items?.length) msgs.push("📗 <b>Вийшли й уже є у продажу</b>:\n" + os.items.map((x: Row) => "• " + esc(x.a) + " — <b>" + esc(x.t) + "</b>").join("\n"));
    if (weekday(today) === 1) msgs.push(weekText(data, today, false));
    if (today.slice(8) === "01") msgs.push(monthText(data, today, false));
  }
  // і в Телеграм (поки він є), і сповіщенням у додатку (16.11)
  // 16.11: нагадування — лише сповіщеннями з додатку; у Телеграм тільки поки в людини немає жодного пристрою зі сповіщеннями
  const tg = !(await pushDevices(curUid()));
  for (const m of msgs) { if (tg) await tgSend(m); await pushHtml(db, curUid(), m, { tag: "day-" + today }).catch((e) => console.error(e)); }
  if (!test) await kvSet("last_remind", today);
  return { sent: msgs.length };
}

/** Серія читання: увечері (година з «Я», за часом людини), лише якщо сьогодні ще не читала; «Нагадати о 22:00» — ще раз. */
async function streak(test: boolean) {
  const today = todayKyiv(), h = hourIn(here().tz);
  const st: Row = { ...STREAK_DEFAULT, ...((await kvGet("streak", {})) || {}) };
  const sent: Row = (await kvGet("streak_sent", {})) || {};
  if (!test) {
    if (!st.on) return { skipped: "вимкнено" };
  }
  const late = !test && st.snooze?.date === today && h >= Number(st.snooze.hour || 22) && sent.late !== today;
  if (!test && !late && (h < Number(st.hour) || sent.date === today)) return { skipped: "не час або вже надсилали" };
  const data = await api("lbApiData", null);
  if (curUid() !== 1 && !(data.books || []).length) return { skipped: "ще немає книг" };
  const m = streakMessage(data, today, esc, late);
  if (!test && (m.info.readToday || m.info.skipToday)) return { skipped: "сьогодні вже читала" };
  if (tgChat() && !(await pushDevices(curUid()))) await tgSend(m.text); // запасний варіант без кнопок, поки сповіщення не ввімкнені
  // у сповіщенні кнопок немає: натиск відкриває додаток одразу на «Серії читання»
  const plain = m.text.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  await pushTo(db, curUid(), { title: "🔥 " + plain.split("\n")[0], body: plain.split("\n").slice(1).join("\n").trim(), tag: "streak", open: "streak" }).catch((e) => console.error(e));
  if (!test) await kvSet("streak_sent", late ? { ...sent, late: today } : { ...sent, date: today });
  return { sent: 1, late };
}

/** Бажанки «Передзамовлення»/«Анонс», у яких настала дата релізу (точний день), → «Є у продажу». */
async function night() {
  const today = todayKyiv();
  const r = await db.from("books").select("id,owner_id,author,title,release,sale_status").eq("stage", "wish").in("sale_status", ["Передзамовлення", "Анонс"]).lte("release", today);
  if (r.error) throw new Error(r.error.message);
  const rows = (r.data || []) as Row[];
  for (const b of rows) await db.from("books").update({ sale_status: "Є у продажу" }).eq("id", b.id).eq("sale_status", b.sale_status);
  // по людях: журнал і ранкове повідомлення (remind) — кожному про свої книги
  const by: Record<number, Row[]> = { 1: [] };
  for (const b of rows) (by[b.owner_id || 1] = by[b.owner_id || 1] || []).push(b);
  for (const [o, xs] of Object.entries(by)) {
    if (xs.length) await db.from("log").insert({ action: "📗 Вийшли з друку", details: "Наявність → «Є у продажу»: " + xs.map((b) => b.author + " — " + b.title).join("; "), owner_id: Number(o) });
    await kvSet("onsale_today", { date: today, items: xs.map((b) => ({ a: b.author, t: b.title })) }, Number(o));
  }
  return { onSale: rows.length };
}

Deno.serve(async (req) => {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  try {
    if (req.headers.get("x-import-token") !== String(await kvGet("import_token", ""))) return json({ ok: false }, 403);
    const b = await req.json().catch(() => ({}));
    if (b.job === "remind") return json({ ok: true, ...(await forEach(() => remind(!!b.test), !!b.test)) });
    if (b.job === "streak") return json({ ok: true, ...(await forEach(() => streak(!!b.test), !!b.test)) });
    if (b.job === "night") return json({ ok: true, ...(await night()) });
    if (b.job === "news") return json({ ok: true, ...(await api("lbApiNews", { action: "cron" })) });
    return json({ ok: false, error: "невідома робота" });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
