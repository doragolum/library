// Довідник видавництв: «правильна назва» ← варіанти (як LB_PUBLISHERS у LibApp.gs).
export const PUBLISHERS: Record<string, string[]> = {
  "А-ба-ба-га-ла-ма-га": ["А-ба-ба", "Абабагаламага", "Видавництво А-ба-ба-га-ла-ма-га", "A-BA-BA-HA-LA-MA-HA"],
  "BookChef": ["Book Chef", "Bookchef", "Букшеф"],
  "Книголав": ["Knigolove", "#книголав"],
  "КСД": ["Клуб Сімейного Дозвілля", "Клуб сімейного дозвілля", "KSD", "Family Leisure Club"],
  "Vivat": ["Віват", "Видавництво Vivat", "Vivat Publishing"],
  "РМ": ["Рідна мова", "Видавництво Рідна мова"],
  "ВСЛ": ["Видавництво Старого Лева", "Старий Лев"],
  "Наш Формат": ["Наш формат", "Nash Format"],
  "Атена": ["Athena"],
  "Лабораторія": ["Laboratoria"],
  "Nebo Publishing": ["Nebo BookLab Publishing", "Nebo BookLab", "Nebo", "Небо", "Небо Publishing"],
};
export const pubKey = (x: unknown) => String(x ?? "").toLowerCase().replace(/ґ/g, "г").replace(/[\s\-–—_.,:;'’`"ʼ«»()#]/g, "");
const PUB_MAP: Record<string, string> = {};
for (const [c, vs] of Object.entries(PUBLISHERS)) { PUB_MAP[pubKey(c)] = c; vs.forEach((v) => (PUB_MAP[pubKey(v)] = c)); }
export const pubCanon = (p: unknown) => { const t = String(p ?? "").replace(/\s+/g, " ").trim(); return t ? PUB_MAP[pubKey(t)] || t : ""; };
/** Те саме видавництво (з урахуванням варіантів назви). */
export const samePub = (a: unknown, b: unknown) => {
  const x = pubKey(pubCanon(a)), y = pubKey(pubCanon(b));
  return !!x && !!y && (x === y || (Math.min(x.length, y.length) >= 4 && (x.includes(y) || y.includes(x))));
};
