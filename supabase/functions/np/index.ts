// Нова пошта в новій базі: щогодини перевіряє ТТН замовлених книг і пише статус НП.
// Етап (Замовлено → Створено ТТН → Відправлено → Доставлено) лише просувається вперед, ніколи назад.
// «В бібліотеку» книга не переноситься сама: це робить кнопка «Отримала» (полиця, дата покупки, дублі).
// Ключ — секрет NP_API_KEY у Supabase (Edge Functions → Secrets). У журнал не пишуться ні ключ, ні відповіді НП.
// Виклик: лише з самої бази (pg_cron / net.http_post) із заголовком x-import-token. Тіло {dry:true} — перевірка без запису; {ids:[…]} — лише ці книги.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
type Row = Record<string, any>;
const chk = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };

const ACTIVE = ["ordered", "ttn", "shipped", "delivered"];
const ORDER: Record<string, number> = { ordered: 0, ttn: 1, shipped: 2, delivered: 3 };
const NAME: Record<string, string> = { ordered: "Замовлено", ttn: "Створено ТТН", shipped: "Відправлено", delivered: "Доставлено" };
// коди статусів НП → етап (так само, як у NpWishlistStatus.gs; 9–11 «отримано» = Доставлено)
const CODE_STAGE: Record<string, string> = { "1": "ttn", "4": "shipped", "41": "shipped", "5": "shipped", "6": "shipped", "101": "shipped", "7": "delivered", "8": "delivered", "9": "delivered", "10": "delivered", "11": "delivered" };
const norm = (v: unknown) => String(v ?? "").trim().replace(/\s/g, "");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function npFetch(key: string, numbers: string[]): Promise<Row[]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await fetch("https://api.novaposhta.ua/v2.0/json/", {
      method: "POST", headers: { "Content-Type": "application/json" }, redirect: "manual",
      body: JSON.stringify({ apiKey: key, modelName: "TrackingDocument", calledMethod: "getStatusDocuments", methodProperties: { Documents: numbers.map((n) => ({ DocumentNumber: n })) } }),
    }).catch(() => null);
    if (!r) throw new Error("НП: мережевий запит не виконано, попередні статуси збережено.");
    if (r.status === 200) {
      const body = await r.json().catch(() => null);
      if (!body || body.success !== true || !Array.isArray(body.data)) throw new Error("НП відхилила запит. Перевірте ключ NP_API_KEY у Supabase. Попередні статуси збережено.");
      return body.data;
    }
    if ((r.status === 429 || r.status >= 500) && attempt < 2) { await sleep(1000 * 2 ** attempt); continue; }
    throw new Error(`НП: HTTP ${r.status}, попередні статуси збережено.`);
  }
  return [];
}

Deno.serve(async (req) => {
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
  try {
    const tok = (await db.from("kv").select("value").eq("key", "import_token").maybeSingle()).data?.value;
    if (!tok || req.headers.get("x-import-token") !== tok) return json({ ok: false, error: "forbidden" }, 403);
    const body = await req.json().catch(() => ({}));
    const dry = !!body.dry;
    const key = (Deno.env.get("NP_API_KEY") || "").trim();
    if (!key) return json({ ok: false, error: "Немає секрету NP_API_KEY у Supabase (Edge Functions → Secrets)." });

    // {ids:[…]} — перевірити лише ці книги (одразу після того, як ТТН вписали вручну)
    let q = db.from("books").select("id,stage,author,title,ttn,np_status,np_error").in("stage", ACTIVE).not("ttn", "is", null);
    if (Array.isArray(body.ids) && body.ids.length) q = q.in("id", body.ids.slice(0, 50));
    const books = chk(await q, "books") as Row[];
    const numbers = [...new Set(books.map((b) => norm(b.ttn)).filter((n) => /^\d{14}$/.test(n)))];
    const statuses = new Map<string, Row>();
    for (let i = 0; i < numbers.length; i += 100) {
      const batch = numbers.slice(i, i + 100);
      const data = await npFetch(key, batch);
      const group = new Map<string, Row[]>();
      for (const d of data) { const n = String(d.Number || ""); if (batch.includes(n)) group.set(n, [...(group.get(n) || []), d]); }
      for (const n of batch) {
        const m = group.get(n) || [];
        statuses.set(n, m.length === 1 && String(m[0].Status || "").trim() ? { status: String(m[0].Status).slice(0, 500), code: String(m[0].StatusCode || "") } : { error: "Немає однозначної відповіді НП" });
      }
      if (i + 100 < numbers.length) await sleep(1100);
    }

    const now = new Date().toISOString();
    const changes: Row[] = [];
    let errors = 0;
    for (const b of books) {
      const n = norm(b.ttn);
      const r = /^\d{14}$/.test(n) ? statuses.get(n) : { error: "Потрібна одна ТТН із 14 цифр" };
      const upd: Row = {};
      if (!r || r.error) { errors++; upd.np_error = r?.error || "Немає відповіді"; }
      else {
        upd.np_status = r.status; upd.np_checked = now; upd.np_error = null;
        const next = CODE_STAGE[r.code];
        if (next && ORDER[next] > ORDER[b.stage]) upd.stage = next;
      }
      if (upd.stage || upd.np_status !== b.np_status) changes.push({ id: b.id, title: b.title, author: b.author, from: NAME[b.stage], to: upd.stage ? NAME[upd.stage] : null, np: upd.np_status ?? null, error: upd.np_error ?? null });
      if (dry) continue;
      chk(await db.from("books").update(upd).eq("id", b.id).eq("stage", b.stage), "books");
      if (upd.stage) await db.from("log").insert({ action: "🚚 Нова пошта: " + NAME[upd.stage], book_id: b.id, title: b.title, author: b.author, details: `${NAME[b.stage]} → ${NAME[upd.stage]} (${r!.status})` });
    }
    return json({ ok: true, dry, books: books.length, ttn: numbers.length, errors, changes });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});
