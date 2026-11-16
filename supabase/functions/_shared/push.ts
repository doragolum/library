// Сповіщення з додатку (Web Push, 16.11.2026): замість повідомлень бота в Телеграмі.
// Працює на iPhone (iOS 16.4+, сайт доданий на екран «Додому»), Android і комп'ютері.
// Шифрування — RFC 8291 (aes128gcm), підпис — RFC 8292 (VAPID, ES256). Без сторонніх бібліотек, лише WebCrypto.
type Row = Record<string, any>;
const te = new TextEncoder();
export const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s: string) => { const t = s.replace(/-/g, "+").replace(/_/g, "/"); const r = atob(t + "===".slice((t.length + 3) % 4)); return Uint8Array.from(r, (c) => c.charCodeAt(0)); };
const cat = (...a: Uint8Array[]) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
async function hmac(key: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

/* Ключі VAPID: створюються самі при першому використанні й лежать у закритій таблиці push_vapid (RLS без політик,
   бачать лише функції). Так нікому не треба нічого вписувати чи пересилати. Секрети VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY,
   якщо колись з'являться, мають перевагу. */
let V: { pub: string; d: string } | null = null;
export async function vapid(db: any) {
  if (V) return V;
  const ep = (Deno.env.get("VAPID_PUBLIC_KEY") || "").trim(), ed = (Deno.env.get("VAPID_PRIVATE_KEY") || "").trim();
  if (ep && ed) return (V = { pub: ep, d: ed });
  let r = (await db.from("push_vapid").select("pub,priv").eq("id", 1).maybeSingle()).data;
  if (!r) {
    const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const j = await crypto.subtle.exportKey("jwk", kp.privateKey) as JsonWebKey;
    const pub = b64u(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));
    await db.from("push_vapid").upsert({ id: 1, pub, priv: j.d }, { onConflict: "id", ignoreDuplicates: true });
    r = (await db.from("push_vapid").select("pub,priv").eq("id", 1).maybeSingle()).data;
    if (!r) throw new Error("не вдалося створити ключі сповіщень");
  }
  return (V = { pub: r.pub, d: r.priv });
}
export const vapidPublic = async (db: any) => (await vapid(db)).pub;

let signKey: CryptoKey | null = null;
async function vapidHeader(db: any, endpoint: string) {
  const v = await vapid(db);
  if (!signKey) {
    const pub = unb64u(v.pub);
    signKey = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", d: v.d, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  }
  const head = b64u(te.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(te.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "https://doragolum.github.io/library/" })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, signKey, te.encode(head + "." + body)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${v.pub}`;
}

/** Шифрує текст для одного пристрою (aes128gcm, один запис). */
export async function encrypt(payload: Uint8Array, p256dh: string, auth: string, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const ua = unb64u(p256dh), secret = unb64u(auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const as = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", ua, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hmac(await hmac(secret, shared), cat(te.encode("WebPush: info\0"), ua, as, new Uint8Array([1])));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, cat(te.encode("Content-Encoding: aes128gcm\0"), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, cat(te.encode("Content-Encoding: nonce\0"), new Uint8Array([1])))).slice(0, 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k, cat(payload, new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([65]), as, ct);
}

/** Надсилає одне сповіщення на один пристрій. Повертає код відповіді служби (201 — добре; 404/410 — підписка вже не діє). */
export async function sendOne(db: any, sub: { endpoint: string; p256dh: string; auth: string }, msg: Row) {
  const body = await encrypt(te.encode(JSON.stringify(msg)), sub.p256dh, sub.auth);
  const r = await fetch(sub.endpoint, { method: "POST", headers: { Authorization: await vapidHeader(db, sub.endpoint), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String(20 * 3600), Urgency: "normal" }, body }).catch(() => null);
  if (r) await r.text().catch(() => "");
  return r ? r.status : 0;
}

/** HTML бота → звичайний текст для сповіщення: перший рядок — заголовок, решта — текст. */
export function fromHtml(html: string) {
  const plain = String(html).replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&").trim();
  const nl = plain.indexOf("\n");
  const title = (nl === -1 ? plain : plain.slice(0, nl)).replace(/:\s*$/, "").trim();
  let body = nl === -1 ? "" : plain.slice(nl + 1).replace(/\n{3,}/g, "\n\n").trim();
  if (body.length > 1500) body = body.slice(0, 1500).replace(/\s+\S*$/, "") + "…";
  return { title: title.slice(0, 120), body };
}

/* Види сповіщень → перемикачі в «Я» → «Сповіщення» (kv push_prefs, особистий; за замовчуванням усе ввімкнено). */
export const PUSH_GROUPS: Record<string, string> = { release: "release", onsale: "release", ttn: "parcel", parcel: "parcel", lent: "lent", streak: "streak", week: "summary", month: "summary", news: "news" };
export async function pushPrefs(db: any, uid: number): Promise<Record<string, boolean>> {
  const r = await db.from("kv").select("value").eq("key", uid === 1 ? "push_prefs" : `push_prefs@u${uid}`).maybeSingle();
  return { release: true, parcel: true, lent: true, streak: true, summary: true, news: true, ...(r.data?.value || {}) };
}
/** Усім пристроям людини. Підписки, що вже не діють, прибираються. Вид, вимкнений у перемикачах, не надсилається. */
export async function pushTo(db: any, uid: number, msg: { title: string; body?: string; tag?: string; open?: string; kind?: string; id?: number; actions?: Row[] }) {
  const g = msg.kind ? PUSH_GROUPS[msg.kind] : "";
  if (g && (await pushPrefs(db, uid))[g] === false) return { sent: 0, devices: -1, off: g };
  const subs = ((await db.from("push_subs").select("id,endpoint,p256dh,auth,fails").eq("owner_id", uid)).data || []) as Row[];
  let sent = 0;
  for (const s of subs) {
    const code = await sendOne(db, s as any, msg);
    if (code >= 200 && code < 300) { sent++; await db.from("push_subs").update({ last_ok: new Date().toISOString(), fails: 0 }).eq("id", s.id); }
    else if (code === 404 || code === 410) await db.from("push_subs").delete().eq("id", s.id);
    else { console.error("push", code, new URL(s.endpoint).host); await db.from("push_subs").update({ fails: (s.fails || 0) + 1 }).eq("id", s.id); }
  }
  return { sent, devices: subs.length };
}
/** Те саме з HTML-тексту бота. */
export const pushHtml = (db: any, uid: number, html: string, extra: Row = {}) => pushTo(db, uid, { ...fromHtml(html), ...extra });

/** «Нагадати пізніше»: коли саме (за часом людини). when: 1h | 22 | tomorrow | week. */
export function snoozeAt(when: string, tz: string, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now).map((p) => [p.type, p.value]));
  const localNow = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  const off = localNow - Math.floor(now.getTime() / 60000) * 60000; // різниця «місцевий час − UTC»
  const at = (dayShift: number, h: number) => new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day + dayShift, h, 0) - off);
  if (when === "1h") return new Date(now.getTime() + 3600e3);
  if (when === "22") { const d = at(0, 22); return d.getTime() > now.getTime() + 10 * 60e3 ? d : new Date(now.getTime() + 3600e3); }
  if (when === "week") return at(7, 9);
  return at(1, 9); // tomorrow
}
