// Хто робить запит (етап 4, 16.11.2026). Один код для api й ai.
//  · особистий ключ ?k= (LB_WEB_KEY) — власниця (1);
//  · сесія з входу через Телеграм (токен у localStorage сайту, у базі лише його відбиток);
//  · Телеграм-міні-додаток (initData): LB_TG_USER_ID — власниця, інші — за tg_id в app_users.
type Row = Record<string, any>;
export type Who = { uid: number; role: string; name: string; via: string };
export class AuthError extends Error {}
const no = (m: string): never => { throw new AuthError(m); };

function same(a: string, b: string) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
async function hmac(keyBytes: Uint8Array, data: string) {
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data)));
}
export async function sha256(s: string) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
export function randomToken(bytes = 32) { const a = crypto.getRandomValues(new Uint8Array(bytes)); return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }

/** Перевіряє підпис Телеграму; повертає користувача Телеграму. */
export async function tgUser(initData: string): Promise<Row> {
  const token = Deno.env.get("LB_TG_TOKEN");
  if (!token) no("Телеграм ще не підключено. Відкрий Nookly за особистим посиланням.");
  const p = new URLSearchParams(initData);
  const hash = (p.get("hash") || "").toLowerCase();
  p.delete("hash");
  const check = [...p.entries()].map(([a, b]) => `${a}=${b}`).sort().join("\n");
  const secret = await hmac(new TextEncoder().encode("WebAppData"), token!);
  const sig = [...(await hmac(secret, check))].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (!hash || sig !== hash) no("Телеграм не підтвердив, хто ти. Закрий і відкрий Nookly в боті заново.");
  if (!(Math.floor(Date.now() / 1000) - Number(p.get("auth_date") || 0) < 24 * 3600)) no("Сесія застаріла. Закрий і відкрий Nookly в боті заново.");
  try { return JSON.parse(p.get("user") || "{}"); } catch { return {}; }
}

export async function whoIs(db: any, body: Row): Promise<Who> {
  const k = String(body.key || ""), saved = Deno.env.get("LB_WEB_KEY") || "";
  if (k && saved && same(k, saved)) return { uid: 1, role: "owner", name: "", via: "key" };
  const ses = String(body.session || "");
  if (ses) {
    const h = await sha256(ses);
    const r = await db.from("sessions").select("id,user_id,last_seen,revoked,app_users(id,name,role)").eq("token_hash", h).maybeSingle();
    const s = r.data;
    if (!s || s.revoked || !s.app_users) no("Вхід закінчився. Увійди ще раз.");
    if (!s.last_seen || Date.now() - new Date(s.last_seen).getTime() > 3600e3) await db.from("sessions").update({ last_seen: new Date().toISOString() }).eq("id", s.id);
    return { uid: s.user_id, role: s.app_users.role, name: s.app_users.name || "", via: "session" };
  }
  const initData = String(body.initData || "");
  if (!initData) no("Немає доступу. Увійди через Телеграм або відкрий Nookly за особистим посиланням.");
  const u = await tgUser(initData);
  if (String(u.id) === String(Deno.env.get("LB_TG_USER_ID") || "")) return { uid: 1, role: "owner", name: "", via: "telegram" };
  const r = await db.from("app_users").select("id,name,role").eq("tg_id", Number(u.id) || 0).maybeSingle();
  if (!r.data) no("Nookly поки працює за запрошенням. Попроси посилання в того, хто тебе запросив.");
  return { uid: r.data.id, role: r.data.role, name: r.data.name || "", via: "telegram" };
}
