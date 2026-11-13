/** Small D1 helpers. */

export const getMeta = async (db: D1Database, key: string) =>
  (await db.prepare("SELECT value FROM meta WHERE key = ?").bind(key).first<{ value: string }>())?.value ?? null;

export const setMeta = (db: D1Database, key: string, value: string) =>
  db.prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value);

/** INSERT OR REPLACE for a plain row object. D1 allows max 100 bound params per statement. */
export function insertRow(db: D1Database, table: string, row: Record<string, unknown>) {
  const cols = Object.keys(row);
  if (cols.length > 100) throw new Error(`${table}: too many columns for one statement`);
  const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;
  return db.prepare(sql).bind(...cols.map((c) => row[c] ?? null));
}

/** Run statements in D1 batches (each batch is a transaction). */
export async function runBatched(db: D1Database, stmts: D1PreparedStatement[], size = 80) {
  for (let i = 0; i < stmts.length; i += size) await db.batch(stmts.slice(i, i + size));
}
