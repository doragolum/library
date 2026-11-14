// Розклад (pg_cron): нагадування в Телеграм о ~9:00 за Києвом, нічне «вийшли з друку → Є у продажу», новини серій щопонеділка.
// Тіло: {job:"remind"} | {job:"night"} | {job:"news"}; {job:"remind", test:true} — надіслати зараз релізи на 14 днів і тиждень (перевірка).
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { tgSend } from "../_shared/tg.ts";
import { todayKyiv } from "../_shared/ai.ts";
import { dailyText, weekText, monthText, weekday, addDays, reminderLine } from "../_shared/texts.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
type Row = Record<string, any>;
async function kvGet(k: string, def: any = null) { const r = await db.from("kv").select("value").eq("key", k).maybeSingle(); return r.data?.value ?? def; }
async function kvSet(k: string, value: any) { await db.from("kv").upsert({ key: k, value, updated_at: new Date().toISOString() }); }
async function api(fn: string, arg: unknown) {
  const r = await fetch(Deno.env.get("SUPABASE_URL") + "/functions/v1/" + (fn === "lbApiNews" ? "ai" : "api"), { method: "POST", headers: { "Content-Type": "application/json", "x-import-token": String(await kvGet("import_token", "")) }, body: JSON.stringify({ fn, args: [arg] }) });
  const j = await r.json().catch(() => ({ ok: false, error: "База не відповіла" }));
  if (!j.ok) throw new Error(j.error || "Не вдалося");
  return j.data;
}
const kyivHour = () => Number(new Date().toLocaleString("en-GB", { timeZone: "Europe/Kyiv", hour: "2-digit", hour12: false }));

async function remind(test: boolean) {
  const today = todayKyiv();
  if (!test) {
    if (kyivHour() < 9) return { skipped: "ще рано" };
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
    if (weekday(today) === 1) msgs.push(weekText(data, today, false));
    if (today.slice(8) === "01") msgs.push(monthText(data, today, false));
  }
  for (const m of msgs) await tgSend(m);
  if (!test) await kvSet("last_remind", today);
  return { sent: msgs.length };
}

/** Бажанки «Передзамовлення»/«Анонс», у яких настала дата релізу (точний день), → «Є у продажу». */
async function night() {
  const today = todayKyiv();
  const r = await db.from("books").select("id,author,title,release,sale_status").eq("stage", "wish").in("sale_status", ["Передзамовлення", "Анонс"]).lte("release", today);
  if (r.error) throw new Error(r.error.message);
  const rows = (r.data || []) as Row[];
  for (const b of rows) await db.from("books").update({ sale_status: "Є у продажу" }).eq("id", b.id).eq("sale_status", b.sale_status);
  if (rows.length) await db.from("log").insert({ action: "📗 Вийшли з друку", details: "Наявність → «Є у продажу»: " + rows.map((b) => b.author + " — " + b.title).join("; ") });
  return { onSale: rows.length };
}

Deno.serve(async (req) => {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  try {
    if (req.headers.get("x-import-token") !== String(await kvGet("import_token", ""))) return json({ ok: false }, 403);
    const b = await req.json().catch(() => ({}));
    if (b.job === "remind") return json({ ok: true, ...(await remind(!!b.test)) });
    if (b.job === "night") return json({ ok: true, ...(await night()) });
    if (b.job === "news") return json({ ok: true, ...(await api("lbApiNews", { action: "cron" })) });
    return json({ ok: false, error: "невідома робота" });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
