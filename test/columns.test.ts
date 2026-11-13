import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAYER_SUM_COLS, TEAM_SUM_COLS } from "../src/stats/columns";

const dir = new URL("../migrations/", import.meta.url);
const sql = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort().map((f) => readFileSync(new URL(f, dir), "utf8")).join("\n");

/** Columns of a table: from its CREATE TABLE plus any later ALTER TABLE ... ADD COLUMN. */
function tableCols(name: string): string[] {
  const m = sql.match(new RegExp(`CREATE TABLE ${name} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) throw new Error(`table ${name} not found`);
  const created = [...m[1].matchAll(/(?:^|[(,\s])([a-z_0-9]+) (?:TEXT|INTEGER|REAL)/g)].map((x) => x[1]);
  const added = [...sql.matchAll(new RegExp(`ALTER TABLE ${name} ADD COLUMN ([a-z_0-9]+)`, "g"))].map((x) => x[1]);
  return [...created, ...added];
}

describe("migrations match columns.ts", () => {
  for (const [table, cols] of [
    ["game_teams", TEAM_SUM_COLS], ["agg_teams", TEAM_SUM_COLS], ["agg_maps", TEAM_SUM_COLS],
    ["game_players", PLAYER_SUM_COLS], ["agg_players", PLAYER_SUM_COLS],
  ] as const) {
    it(`${table} has every stat column`, () => {
      const have = new Set(tableCols(table));
      expect(cols.filter((c) => !have.has(c))).toEqual([]);
    });
  }
});
