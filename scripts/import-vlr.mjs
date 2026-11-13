#!/usr/bin/env node
/**
 * Import vlr.gg stats (Rating, ACS, KAST, clutches, econ, buy types, vetoes) for VCT matches from the
 * nrg-scrapbook scraper database, aligned to Roundwise's GRID data.
 *
 *   node scripts/import-vlr.mjs                 # remote D1 (needs `wrangler login`)
 *   node scripts/import-vlr.mjs --local [--persist-to DIR]
 *   node scripts/import-vlr.mjs --dry-run       # align + write the SQL file, don't execute it
 *   node scripts/import-vlr.mjs --vlr-db path/to/vlr_vct_2026.db
 *
 * Alignment (no reliance on team names): a vlr match pairs with a GRID series played within 36 h whose maps are
 * all in the vlr match with the same scores (either team order). Maps where GRID's data stopped early may differ:
 * at least half the maps must agree exactly, or both team names must match. Players pair by name inside their
 * team, falling back to an identical K/D/A line. GRID maps whose score disagrees with vlr.gg are flagged partial
 * (left out of stats). Re-running replaces everything imported before.
 *
 * On Windows/with a shell CLOUDFLARE_API_TOKEN that lacks D1 access: `env -u CLOUDFLARE_API_TOKEN node scripts/import-vlr.mjs`.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const SNAPSHOT_URL = "https://github.com/araise3/nrg-scrapbook/releases/download/db-snapshot/vlr_vct_2026.db";
const TIER1 = `(tr.name LIKE 'VCT %' OR tr.name LIKE 'VALORANT Masters%' OR tr.name LIKE 'Champions%')`;
const WINDOW_H = 36;
const PISTOLS = new Set([1, 13]);
const MAP_ALIASES = { plummet: "summit" };

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
const target = flag("--local") ? ["--local", ...(opt("--persist-to") ? ["--persist-to", opt("--persist-to")] : [])] : ["--remote"];
const work = join(tmpdir(), "roundwise-vlr");
mkdirSync(work, { recursive: true });

// ------------------------------------------------------------------ wrangler

const wranglerBin = join(dirname(createRequire(import.meta.url).resolve("wrangler/package.json")), "bin", "wrangler.js");
function wrangler(...a) {
  const r = spawnSync(process.execPath, [wranglerBin, "d1", "execute", "roundwise", ...target, ...a], { encoding: "utf8", maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`wrangler failed:\n${r.stderr || r.stdout}`);
  return r.stdout;
}
const query = (sql) => {
  const out = wrangler("--json", "--command", sql.replace(/\s+/g, " "));
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};

// ------------------------------------------------------------------ helpers

const norm = (s) => (s ?? "").normalize("NFKD").replace(/[^\x00-\x7f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const teamKey = (s) => norm((s ?? "").replace(/\(.*?\)/g, ""));
const mapKey = (s) => { const m = (s ?? "").trim().toLowerCase(); return MAP_ALIASES[m] ?? m; };
const ts = (s) => Date.parse(s.includes("T") ? s : s.replace(" ", "T") + "Z");
const pct = (s) => (s == null || s === "" ? null : Number(String(s).replace("%", "")) / 100);
const q = (v) => (v == null ? "NULL" : typeof v === "number" ? String(Math.round(v * 10000) / 10000) : `'${String(v).replaceAll("'", "''")}'`);

// ------------------------------------------------------------------ load

let vlrPath = opt("--vlr-db");
if (!vlrPath) {
  vlrPath = join(work, "vlr_vct_2026.db");
  console.log(`downloading ${SNAPSHOT_URL}`);
  const res = await fetch(SNAPSHOT_URL);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  writeFileSync(vlrPath, Buffer.from(await res.arrayBuffer()));
}
if (!existsSync(vlrPath)) throw new Error(`no vlr db at ${vlrPath}`);
const vl = new DatabaseSync(vlrPath, { readOnly: true });

console.log("reading Roundwise data");
const tier1 = `SELECT s.id FROM series s JOIN tournaments tr ON tr.id = s.tournament_id WHERE s.status IN ('done', 'duplicate') AND ${TIER1}`;
const rwSeries = query(`SELECT s.id, s.start_time, s.team1_id, s.team2_id, s.team1_score, s.team2_score, s.winner_id, t1.name AS n1, t2.name AS n2
  FROM series s JOIN teams t1 ON t1.id = s.team1_id JOIN teams t2 ON t2.id = s.team2_id
  JOIN tournaments tr ON tr.id = s.tournament_id WHERE s.status IN ('done', 'duplicate') AND ${TIER1}`);
const rwGameRows = query(`SELECT g.id, g.series_id, g.map, g.partial, gt.team_id, gt.score
  FROM games g JOIN game_teams gt ON gt.game_id = g.id WHERE g.series_id IN (${tier1})`);
const rwPlayers = query(`SELECT gp.game_id, gp.player_id, gp.team_id, p.name, gp.kills AS k, gp.deaths AS d, gp.assists AS a
  FROM game_players gp JOIN players p ON p.id = gp.player_id WHERE gp.series_id IN (${tier1})`);

const games = new Map(); // series_id -> Map(mapKey -> {id, partial, scores})
for (const r of rwGameRows) {
  const byMap = games.get(r.series_id) ?? new Map();
  const g = byMap.get(mapKey(r.map)) ?? { id: r.id, partial: r.partial, scores: {} };
  g.scores[r.team_id] = r.score;
  byMap.set(mapKey(r.map), g);
  games.set(r.series_id, byMap);
}
const playersByGame = new Map();
for (const p of rwPlayers) (playersByGame.get(p.game_id) ?? playersByGame.set(p.game_id, []).get(p.game_id)).push(p);

// Rosters (normalised player names) per GRID series/team and per vlr match/team, to confirm a pairing.
const seriesOfGame = new Map(rwGameRows.map((r) => [r.id, r.series_id]));
const rwRoster = new Map();
for (const p of rwPlayers) {
  const k = `${seriesOfGame.get(p.game_id)}|${p.team_id}`;
  (rwRoster.get(k) ?? rwRoster.set(k, new Set()).get(k)).add(norm(p.name));
}
const vRoster = new Map();
for (const r of vl.prepare("SELECT DISTINCT match_id, team, player FROM map_player_stats WHERE side = 'both'").all()) {
  const k = `${r.match_id}|${r.team}`;
  (vRoster.get(k) ?? vRoster.set(k, new Set()).get(k)).add(norm(r.player));
}
const overlap = (a, b) => [...(a ?? [])].filter((x) => b?.has(x)).length;
const MIN_ROSTER_OVERLAP = 6; // of 10 players; leaves room for renames like "Leviathan" -> "Leviathan3"

const vMatches = vl.prepare("SELECT match_id, team1, team2, match_date, match_url FROM matches").all();
const vMaps = new Map();
for (const m of vl.prepare("SELECT * FROM maps ORDER BY map_index").all()) (vMaps.get(m.match_id) ?? vMaps.set(m.match_id, []).get(m.match_id)).push(m);

// ------------------------------------------------------------------ align series

/** Compare one GRID series with one vlr match in one orientation (flip = vlr team1 is GRID team2). */
function compare(s, vm, flip) {
  const rw = games.get(s.id) ?? new Map();
  const v = new Map((vMaps.get(vm.match_id) ?? []).map((m) => [mapKey(m.map_name), flip ? [m.team2_score, m.team1_score] : [m.team1_score, m.team2_score]]));
  let exact = 0, differ = 0, missing = 0;
  for (const [map, g] of rw) {
    const want = v.get(map);
    if (!want) { missing++; continue; }
    if (g.scores[s.team1_id] === want[0] && g.scores[s.team2_id] === want[1]) exact++; else differ++;
  }
  const names = teamKey(s.n1) === teamKey(flip ? vm.team2 : vm.team1) && teamKey(s.n2) === teamKey(flip ? vm.team1 : vm.team2);
  const roster = overlap(rwRoster.get(`${s.id}|${s.team1_id}`), vRoster.get(`${vm.match_id}|${flip ? vm.team2 : vm.team1}`))
    + overlap(rwRoster.get(`${s.id}|${s.team2_id}`), vRoster.get(`${vm.match_id}|${flip ? vm.team1 : vm.team2}`));
  const ok = rw.size > 0 && missing === 0 && roster >= MIN_ROSTER_OVERLAP
    && (differ === 0 || exact * 2 >= rw.size || names) && (exact > 0 || names);
  return { ok, exact, differ, names, roster };
}

/** Lexicographic comparison of candidate scores. */
const better = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };

const pairs = [];
const usedSeries = new Set();
for (const vm of vMatches) {
  if (!vMaps.get(vm.match_id)?.length) continue;
  const t = ts(vm.match_date);
  let best = null;
  for (const s of rwSeries) {
    if (usedSeries.has(s.id) || Math.abs(ts(s.start_time) - t) > WINDOW_H * 3600_000) continue;
    for (const flip of [false, true]) {
      const c = compare(s, vm, flip);
      if (!c.ok) continue;
      const score = [c.roster, c.exact, -c.differ, -Math.abs(ts(s.start_time) - t)];
      if (!best || better(score, best.score)) best = { s, flip, score, c };
    }
  }
  if (best) { usedSeries.add(best.s.id); pairs.push({ vm, s: best.s, flip: best.flip, c: best.c, extra: [] }); }
}

// GRID sometimes splits one match into two series records (e.g. map 1 in one, map 3 in another). An unpaired
// series with the same two teams, in the window, whose maps all appear in the paired vlr match with the same
// scores is merged into the paired series: its maps attach there and the duplicate is hidden.
for (const p of pairs) {
  const t = ts(p.vm.match_date);
  const ids = [p.s.team1_id, p.s.team2_id].sort().join();
  const vByMap = new Map((vMaps.get(p.vm.match_id) ?? []).map((m) => [mapKey(m.map_name), m]));
  const vlrTeam = (m, id) => ((id === p.s.team1_id) !== p.flip ? m.team1_score : m.team2_score);
  for (const s2 of rwSeries) {
    if (usedSeries.has(s2.id) || [s2.team1_id, s2.team2_id].sort().join() !== ids) continue;
    if (Math.abs(ts(s2.start_time) - t) > WINDOW_H * 3600_000) continue;
    const maps2 = games.get(s2.id) ?? new Map();
    const own = games.get(p.s.id) ?? new Map();
    const fits = maps2.size > 0 && [...maps2].every(([map, g]) => {
      const m = vByMap.get(map);
      return m && !own.has(map) && Object.entries(g.scores).every(([id, sc]) => vlrTeam(m, id) === sc);
    });
    if (fits) { usedSeries.add(s2.id); p.extra.push(s2); }
  }
}

// ------------------------------------------------------------------ build rows

const pStmt = vl.prepare("SELECT * FROM map_player_stats WHERE match_id = ? AND map_index = ?");
const eStmt = vl.prepare("SELECT * FROM map_round_economy WHERE match_id = ? AND map_index = ? ORDER BY round_num");
const vetoStmt = vl.prepare("SELECT * FROM match_vetoes WHERE match_id = ? ORDER BY order_num");

const sql = [];
const stats = { pairs: pairs.length, maps: 0, vlrOnlyMaps: 0, partial: 0, players: 0, playersUnmatched: 0, teamEconomy: 0, vetoes: 0 };
const unmatched = [];
const playerUpdates = [], teamUpdates = [], vlrSeries = [], vlrMapRows = [], vetoRows = [], partialGames = new Set();

const seriesFixes = [];
for (const { vm, s, flip, extra } of pairs) {
  vlrSeries.push(`(${q(s.id)}, ${vm.match_id}, ${q(vm.match_url)})`);
  // vlr team name -> GRID team id
  const teamOf = { [vm.team1]: flip ? s.team2_id : s.team1_id, [vm.team2]: flip ? s.team1_id : s.team2_id };
  const rwMaps = new Map([...extra.flatMap((x) => [...(games.get(x.id) ?? [])]), ...(games.get(s.id) ?? [])]);
  for (const x of extra) {
    stats.duplicatesMerged = (stats.duplicatesMerged ?? 0) + 1;
    seriesFixes.push(`UPDATE series SET status = 'duplicate', note = ${q(`same match as ${s.id} (vlr.gg ${vm.match_id})`)} WHERE id = ${q(x.id)};`);
  }
  // Series score and winner from vlr.gg's maps (GRID's can be wrong when it's missing maps).
  const won = (vMaps.get(vm.match_id) ?? []).reduce((w, m) => {
    const [a, b] = flip ? [m.team2_score, m.team1_score] : [m.team1_score, m.team2_score];
    if (a > b) w[0]++; else if (b > a) w[1]++;
    return w;
  }, [0, 0]);
  if (won[0] !== won[1] && (won[0] !== s.team1_score || won[1] !== s.team2_score)) {
    stats.seriesScoreFixed = (stats.seriesScoreFixed ?? 0) + 1;
    seriesFixes.push(`UPDATE series SET team1_score = ${won[0]}, team2_score = ${won[1]}, winner_id = ${q(won[0] > won[1] ? s.team1_id : s.team2_id)} WHERE id = ${q(s.id)};`);
  }

  for (const m of vMaps.get(vm.match_id)) {
    const map = mapKey(m.map_name);
    const [a, b] = flip ? [m.team2_score, m.team1_score] : [m.team1_score, m.team2_score];
    const g = rwMaps.get(map);
    vlrMapRows.push(`(${q(s.id)}, ${m.map_index}, ${q(map)}, ${q(a)}, ${q(b)}, ${q(g?.id ?? null)})`);
    if (!g) { stats.vlrOnlyMaps++; continue; }
    stats.maps++;
    if (g.scores[s.team1_id] !== a || g.scores[s.team2_id] !== b) { partialGames.add(g.id); stats.partial++; }

    // ---- players
    const rounds = (m.team1_score ?? 0) + (m.team2_score ?? 0);
    const sideRounds = {
      [vm.team1]: { atk: (m.team1_atk_score ?? 0) + (m.team2_def_score ?? 0), def: (m.team1_def_score ?? 0) + (m.team2_atk_score ?? 0) },
      [vm.team2]: { atk: (m.team2_atk_score ?? 0) + (m.team1_def_score ?? 0), def: (m.team2_def_score ?? 0) + (m.team1_atk_score ?? 0) },
    };
    const rows = pStmt.all(vm.match_id, m.map_index);
    const rwp = playersByGame.get(g.id) ?? [];
    for (const vp of rows.filter((r) => r.side === "both")) {
      stats.players++;
      const tid = teamOf[vp.team];
      const inTeam = rwp.filter((r) => r.team_id === tid);
      let hit = inTeam.filter((r) => norm(r.name) === norm(vp.player));
      if (hit.length !== 1) hit = inTeam.filter((r) => r.k === vp.kills && r.d === vp.deaths && r.a === vp.assists);
      if (hit.length !== 1) hit = inTeam.filter((r) => r.k === vp.kills && r.d === vp.deaths); // sources count assists differently
      if (hit.length !== 1) {
        stats.playersUnmatched++;
        if (!partialGames.has(g.id) && !g.partial) unmatched.push(`${vp.player} (${vp.team}) vs ${inTeam.map((r) => r.name).join("/")}`);
        continue;
      }
      const side = (s) => rows.find((r) => r.player === vp.player && r.side === s);
      const atk = side("t"), def = side("ct"), sr = sideRounds[vp.team] ?? { atk: 0, def: 0 };
      const kast = pct(vp.kast);
      const perf = vp.econ != null;
      const clutches = [vp.clutch_1v1, vp.clutch_1v2, vp.clutch_1v3, vp.clutch_1v4, vp.clutch_1v5].reduce((n, x) => n + (x ?? 0), 0);
      const set = {
        vlr_rating_rounds: vp.rating != null ? rounds : 0, vlr_rating: (vp.rating ?? 0) * rounds,
        vlr_acs_rounds: vp.acs != null ? rounds : 0, vlr_acs: (vp.acs ?? 0) * rounds,
        vlr_kast_rounds: kast != null ? rounds : 0, vlr_kast: (kast ?? 0) * rounds,
        vlr_perf_rounds: perf ? rounds : 0, vlr_clutches: perf ? clutches : 0, vlr_econ: perf ? vp.econ * rounds : 0,
        vlr_plants: perf ? vp.plants ?? 0 : 0, vlr_defuses: perf ? vp.defuses ?? 0 : 0,
        vlr_atk_rounds: atk?.rating != null ? sr.atk : 0, vlr_atk_rating: (atk?.rating ?? 0) * sr.atk,
        vlr_def_rounds: def?.rating != null ? sr.def : 0, vlr_def_rating: (def?.rating ?? 0) * sr.def,
      };
      playerUpdates.push(`UPDATE game_players SET ${Object.entries(set).map(([k, v]) => `${k} = ${q(v)}`).join(", ")} WHERE game_id = ${q(g.id)} AND player_id = ${q(hit[0].player_id)};`);
    }

    // ---- team economy from per-round buys (vlr team1/team2 = match team1/team2; checked against the score)
    const econ = eStmt.all(vm.match_id, m.map_index);
    const won1 = econ.reduce((n, r) => n + (r.team1_round_win ? 1 : 0), 0), won2 = econ.reduce((n, r) => n + (r.team2_round_win ? 1 : 0), 0);
    if (econ.length && won1 === m.team1_score && won2 === m.team2_score) {
      stats.teamEconomy++;
      const bucket = { "": "eco", "$": "semieco", "$$": "semibuy", "$$$": "fullbuy" };
      for (const [own, opp, name] of [["team1", "team2", vm.team1], ["team2", "team1", vm.team2]]) {
        const t = Object.fromEntries(["eco", "semieco", "semibuy", "fullbuy", "antieco"].flatMap((k) => [[`vlr_${k}_rounds`, 0], [`vlr_${k}_wins`, 0]]));
        for (const r of econ) {
          if (PISTOLS.has(r.round_num)) continue;
          const k = bucket[r[`${own}_buy_type`] ?? ""];
          const win = r[`${own}_round_win`] ? 1 : 0;
          if (k) { t[`vlr_${k}_rounds`]++; t[`vlr_${k}_wins`] += win; }
          if ((r[`${own}_buy_type`] === "$$" || r[`${own}_buy_type`] === "$$$") && (r[`${opp}_buy_type`] ?? "") === "") {
            t.vlr_antieco_rounds++; t.vlr_antieco_wins += win;
          }
        }
        teamUpdates.push(`UPDATE game_teams SET ${Object.entries(t).map(([k, v]) => `${k} = ${v}`).join(", ")} WHERE game_id = ${q(g.id)} AND team_id = ${q(teamOf[name])};`);
      }
    }
  }

  for (const v of vetoStmt.all(vm.match_id)) {
    stats.vetoes++;
    vetoRows.push(`(${q(s.id)}, ${v.order_num}, ${q(v.team ? teamOf[v.team] ?? null : null)}, ${q(v.action)}, ${q(mapKey(v.map_name))})`);
  }
}

// ------------------------------------------------------------------ write + run

const { PLAYER_VLR, TEAM_VLR } = {
  PLAYER_VLR: ["vlr_rating_rounds", "vlr_rating", "vlr_acs_rounds", "vlr_acs", "vlr_kast_rounds", "vlr_kast", "vlr_perf_rounds", "vlr_clutches",
    "vlr_econ", "vlr_plants", "vlr_defuses", "vlr_atk_rounds", "vlr_atk_rating", "vlr_def_rounds", "vlr_def_rating"],
  TEAM_VLR: ["eco", "semieco", "semibuy", "fullbuy", "antieco"].flatMap((k) => [`vlr_${k}_rounds`, `vlr_${k}_wins`]),
};
const chunk = (rows, n = 400) => Array.from({ length: Math.ceil(rows.length / n) }, (_, i) => rows.slice(i * n, i * n + n));

const INVALID_FINAL = `SELECT game_id FROM game_teams GROUP BY game_id
  HAVING NOT (MAX(score) >= 13 AND MAX(score) - MIN(score) >= 2 AND (MAX(score) = 13 OR MAX(score) - MIN(score) = 2))`;
sql.push(
  // Undo everything a previous run decided, so re-running is idempotent.
  "UPDATE series SET status = 'done', note = NULL WHERE status = 'duplicate';",
  `UPDATE games SET partial = CASE WHEN id IN (${INVALID_FINAL.replace(/\s+/g, " ")}) THEN 1 ELSE 0 END;`,
  "UPDATE game_teams SET partial = (SELECT partial FROM games WHERE games.id = game_teams.game_id);",
  "UPDATE game_players SET partial = (SELECT partial FROM games WHERE games.id = game_players.game_id);",
  `UPDATE game_players SET ${PLAYER_VLR.map((c) => `${c} = 0`).join(", ")} WHERE vlr_rating_rounds > 0 OR vlr_acs_rounds > 0 OR vlr_kast_rounds > 0 OR vlr_perf_rounds > 0 OR vlr_atk_rounds > 0 OR vlr_def_rounds > 0;`,
  `UPDATE game_teams SET ${TEAM_VLR.map((c) => `${c} = 0`).join(", ")} WHERE ${TEAM_VLR.filter((c) => c.endsWith("_rounds")).map((c) => `${c} > 0`).join(" OR ")};`,
  "DELETE FROM vlr_series;", "DELETE FROM vlr_maps;", "DELETE FROM vlr_vetoes;",
  ...playerUpdates, ...teamUpdates, ...seriesFixes,
  ...chunk(vlrSeries).map((c) => `INSERT INTO vlr_series (series_id, vlr_match_id, url) VALUES ${c.join(", ")};`),
  ...chunk(vlrMapRows).map((c) => `INSERT INTO vlr_maps (series_id, map_index, map, team1_score, team2_score, game_id) VALUES ${c.join(", ")};`),
  ...chunk(vetoRows).map((c) => `INSERT INTO vlr_vetoes (series_id, order_num, team_id, action, map) VALUES ${c.join(", ")};`),
);
for (const ids of chunk([...partialGames], 200)) {
  const list = ids.map(q).join(", ");
  sql.push(`UPDATE games SET partial = 1 WHERE id IN (${list});`, `UPDATE game_teams SET partial = 1 WHERE game_id IN (${list});`,
    `UPDATE game_players SET partial = 1 WHERE game_id IN (${list});`);
}
sql.push("DELETE FROM meta WHERE key = 'agg_built_at';"); // aggregates rebuild on the next cron run

const file = join(work, "import-vlr.sql");
writeFileSync(file, sql.join("\n") + "\n");
const unmatchedVlr = vMatches.filter((m) => vMaps.get(m.match_id)?.length).length - pairs.length;
console.log(JSON.stringify({ ...stats, gridTier1Series: rwSeries.length, gridSeriesWithoutVlr: rwSeries.length - pairs.length, vlrMatchesWithoutGrid: unmatchedVlr, sql: file }, null, 2));

if (unmatched.length) console.log(`unmatched players on complete maps (${unmatched.length}):\n  ${[...new Set(unmatched)].slice(0, 20).join("\n  ")}`);
if (flag("--dry-run")) { console.log("dry run: SQL not executed"); process.exit(0); }
console.log(`executing ${sql.length} statements (${target.join(" ")})`);
wrangler("--yes", "--file", file);
console.log("done. Aggregates rebuild on the next cron run.");
