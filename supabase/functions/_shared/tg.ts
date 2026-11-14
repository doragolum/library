// Телеграм-бот: ключ — секрет LB_TG_TOKEN, ваш Телеграм — LB_TG_USER_ID (у приватному чаті це ж і номер чату).
type Row = Record<string, any>;
export const tgToken = () => (Deno.env.get("LB_TG_TOKEN") || "").trim();
export const tgChat = () => (Deno.env.get("LB_TG_CHAT_ID") || Deno.env.get("LB_TG_USER_ID") || "").trim();
export const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function tgApi(method: string, payload: Row = {}): Promise<Row> {
  const t = tgToken();
  if (!t) return { ok: false, description: "немає LB_TG_TOKEN" };
  const r = await fetch(`https://api.telegram.org/bot${t}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }).catch(() => null);
  if (!r) return { ok: false, description: "мережа" };
  return await r.json().catch(() => ({ ok: false }));
}

/** Повідомлення вам (HTML). Довге ділиться на частини до 3900 символів. */
export async function tgSend(text: string, extra: Row = {}) {
  const chat = tgChat();
  if (!chat || !tgToken()) return false;
  const parts: string[] = [];
  let s = String(text);
  while (s.length > 3900) { let cut = s.lastIndexOf("\n", 3900); if (cut < 1000) cut = 3900; parts.push(s.slice(0, cut)); s = s.slice(cut); }
  parts.push(s);
  let res: Row = {};
  for (const p of parts) res = await tgApi("sendMessage", { chat_id: Number(chat), text: p, parse_mode: "HTML", disable_web_page_preview: true, ...extra });
  return res;
}

/** Секрет вебхука виводиться з ключа бота: так його знають і бот, і Apps Script, і ніде не треба зберігати окремо. */
export async function hookSecret() {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("lb-hook:" + tgToken())));
  return [...d].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 48);
}
