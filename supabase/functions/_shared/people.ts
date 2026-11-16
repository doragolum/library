// Люди для бота й кронів (етап 6, 16.11.2026): хто пише боту, куди слати, часовий пояс, особисті ключі kv, назви місць.
// Власниця (1) — LB_TG_USER_ID / LB_TG_CHAT_ID; друзі — app_users.tg_id (приватний чат = їхній номер у Телеграмі).
import { AsyncLocalStorage } from "node:async_hooks";
type Row = Record<string, any>;
export type Person = { uid: number; chat: string; tz: string };
export const person = new AsyncLocalStorage<Person>();
export const curUid = () => person.getStore()?.uid ?? 1;

/** Особисті ключі kv: у друзів — «ключ@u<id>», у власниці — без суфікса. Той самий список в api. */
export const PERSONAL_KV = new Set(["places", "goals", "shelf_marks", "news", "news_state", "options", "profile", "streak", "series_catalog", "streak_sent", "streak_ask", "bot_pending", "onsale_today", "last_remind"]);
export const kvKey = (k: string, uid: number) => (PERSONAL_KV.has(k) && uid !== 1 ? `${k}@u${uid}` : k);

export function validTz(z: unknown) { const t = String(z ?? "").trim(); if (!t) return ""; try { new Intl.DateTimeFormat("en", { timeZone: t }); return t; } catch { return ""; } }
/** Місця людини: home — удома, away — друге місце або "", tz — часовий пояс для нагадувань. */
export function placesOf(v: any, uid: number) {
  const own = uid === 1, s = (x: unknown) => String(x ?? "").trim();
  return { home: s(v?.home) || (own ? "Роттердам" : "Удома"), away: v && "away" in v ? s(v.away) : own ? "Київ" : "", tz: validTz(v?.tz) || (own ? "Europe/Amsterdam" : "Europe/Kyiv") };
}
export const hourIn = (tz: string) => Number(new Date().toLocaleString("en-GB", { timeZone: tz, hour: "2-digit", hour12: false })) % 24;

// Відмінки відомих міст (як PFORMS на сайті): у…, з…
const FORMS: Record<string, [string, string]> = { "Київ": ["у Києві", "з Києва"], "Роттердам": ["у Роттердамі", "з Роттердама"], "Львів": ["у Львові", "зі Львова"], "Харків": ["у Харкові", "з Харкова"], "Одеса": ["в Одесі", "з Одеси"], "Дніпро": ["у Дніпрі", "з Дніпра"], "Варшава": ["у Варшаві", "з Варшави"], "Берлін": ["у Берліні", "з Берліна"], "Удома": ["удома", "з дому"] };
export const pIn = (n: string) => FORMS[n]?.[0] || `у «${n}»`;
export const pFrom = (n: string) => FORMS[n]?.[1] || `з «${n}»`;

async function tzOf(db: any, uid: number) { const r = await db.from("kv").select("value").eq("key", kvKey("places", uid)).maybeSingle(); return placesOf(r.data?.value ?? null, uid).tz; }
const ownerChat = () => (Deno.env.get("LB_TG_CHAT_ID") || Deno.env.get("LB_TG_USER_ID") || "").trim();

/** Хто пише боту: власниця або друг із Телеграмом у app_users; інакше null. */
export async function personByTg(db: any, tgId: number): Promise<Person | null> {
  if (!tgId) return null;
  if (String(tgId) === String(Deno.env.get("LB_TG_USER_ID") || "").trim()) return { uid: 1, chat: ownerChat(), tz: await tzOf(db, 1) };
  const r = (await db.from("app_users").select("id").eq("tg_id", tgId).maybeSingle()).data;
  return r && r.id !== 1 ? { uid: r.id, chat: String(tgId), tz: await tzOf(db, r.id) } : null;
}
/** Усі, кому слати нагадування: власниця + друзі з Телеграмом або зі сповіщеннями в додатку (push_subs, 16.11). chat порожній — лише сповіщення. */
export async function people(db: any): Promise<Person[]> {
  const out: Person[] = [];
  const push = new Set<number>((((await db.from("push_subs").select("owner_id")).data || []) as Row[]).map((x) => Number(x.owner_id)));
  if (ownerChat() || push.has(1)) out.push({ uid: 1, chat: ownerChat(), tz: await tzOf(db, 1) });
  const r = await db.from("app_users").select("id,tg_id").neq("id", 1).order("id");
  for (const u of (r.data || []) as Row[]) if (u.tg_id || push.has(u.id)) out.push({ uid: u.id, chat: u.tg_id ? String(u.tg_id) : "", tz: await tzOf(db, u.id) });
  return out;
}
