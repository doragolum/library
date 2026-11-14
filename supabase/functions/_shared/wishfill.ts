// Знайдене для бажанок (таблиця wish_found) і як його дописати в запис: лише в ПОРОЖНІ поля.
import { norm } from "./megogo.ts";
type Row = Record<string, any>;

export const wishKey = (author: unknown, title: unknown) => norm(author) + "|" + norm(title);
/** Чи назва — лише номер тому («Частина 2», «Книга 3», «Том 1»). */
export const volumeOnly = (title: unknown) => {
  const m = String(title ?? "").trim().match(/^(?:частина|книга|том)\s*(\d+)$/i);
  return m ? Number(m[1]) : 0;
};
const FIELD_NAMES: Record<string, string> = {
  isbn: "ISBN", cover: "обкладинка", pages: "сторінок", publisher: "видавництво", orig_title: "оригінальна назва",
  release: "реліз", price: "ціна", sale_status: "наявність", source_url: "джерело",
};
/** Дописує знайдене в порожні поля row. Повертає список змін для журналу. canIsbn(isbn) — чи ISBN вільний. */
export function mergeFound(row: Row, f: Row, canIsbn: (isbn: string) => boolean): string[] {
  const notes: string[] = [];
  for (const k of Object.keys(FIELD_NAMES)) {
    const v = f[k];
    if (v == null || v === "") continue;
    if (row[k] != null && row[k] !== "") continue;
    if (k === "isbn" && !canIsbn(String(v))) continue;
    row[k] = v;
    notes.push(k === "cover" || k === "source_url" ? FIELD_NAMES[k] : `${FIELD_NAMES[k]}: ${v}`);
  }
  return notes;
}
