import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PLAYER_SUM_COLS, TEAM_SUM_COLS } from "../src/stats/columns";

const sql = readFileSync(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");

function tableCols(name: string): string[] {
  const m = sql.match(new RegExp(`CREATE TABLE ${name} \\(([\\s\\S]*?)\\n\\);`));
  if (!m) throw new Error(`table ${name} not found`);
  return [...m[1].matchAll(/(?:^|[(,\s])([a-z_0-9]+) (?:TEXT|INTEGER)/g)].map((x) => x[1]);
}

describe("migration matches columns.ts", () => {
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
