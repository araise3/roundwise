/** Read queries for pages. Per-entity pages query indexed base tables; cross-entity pages read aggregates. */
import { PLAYER_SUM_COLS, sumSelect, TEAM_SUM_COLS } from "./columns";
import { MAP_METRICS, metricSelect, PLAYER_METRICS, TEAM_METRICS } from "./metrics";
import type { Period } from "./periods";

export type Row = Record<string, any>;

const TEAM_EXTRA = `COUNT(*) AS maps, SUM(won) AS map_wins,
  SUM(CASE WHEN won = 1 AND max_deficit >= 5 THEN 1 ELSE 0 END) AS comebacks,
  SUM(CASE WHEN won = 0 AND max_lead >= 5 THEN 1 ELSE 0 END) AS blown_leads,
  SUM(overtime * won) AS ot_wins`;
const teamSums = (prefix = "") => `${TEAM_EXTRA.replaceAll("won", `${prefix}won`).replaceAll("max_", `${prefix}max_`).replaceAll("overtime", `${prefix}overtime`)}, ${sumSelect(TEAM_SUM_COLS, prefix)}`;
const playerSums = `COUNT(*) AS maps, SUM(won) AS map_wins, ${sumSelect(PLAYER_SUM_COLS)}`;

const withTeamMetrics = (inner: string) => `SELECT x.*, ${metricSelect(TEAM_METRICS)} FROM (${inner}) x`;
const withPlayerMetrics = (inner: string) => `SELECT x.*, ${metricSelect(PLAYER_METRICS)} FROM (${inner}) x`;
const withMapMetrics = (inner: string) => `SELECT x.*, ${metricSelect(MAP_METRICS)} FROM (${inner}) x`;

const all = async (db: D1Database, sql: string, ...binds: unknown[]) =>
  (await db.prepare(sql).bind(...binds).all<Row>()).results;
const first = (db: D1Database, sql: string, ...binds: unknown[]) => db.prepare(sql).bind(...binds).first<Row>();

// ------------------------------------------------------------------ status / home

export async function ingestStatus(db: D1Database) {
  const counts = await all(db, "SELECT status, COUNT(*) AS n FROM series GROUP BY status");
  const meta = await all(db, "SELECT key, value FROM meta");
  const latest = await first(db, "SELECT MAX(ingested_at) AS at FROM series WHERE status = 'done'");
  return {
    counts: Object.fromEntries(counts.map((r) => [r.status, r.n])) as Record<string, number>,
    meta: Object.fromEntries(meta.map((r) => [r.key, r.value])) as Record<string, string>,
    lastIngest: latest?.at as string | null,
  };
}

// ------------------------------------------------------------------ series

export async function recentSeries(db: D1Database, limit: number, offset = 0, teamId?: string) {
  const where = teamId ? "AND (s.team1_id = ?3 OR s.team2_id = ?3)" : "";
  const rows = await all(db,
    `SELECT s.*, t1.name AS t1_name, t2.name AS t2_name, tr.name AS tournament
     FROM series s
     LEFT JOIN teams t1 ON t1.id = s.team1_id
     LEFT JOIN teams t2 ON t2.id = s.team2_id
     LEFT JOIN tournaments tr ON tr.id = s.tournament_id
     WHERE s.status = 'done' ${where}
     ORDER BY s.start_time DESC LIMIT ?1 OFFSET ?2`,
    limit, offset, ...(teamId ? [teamId] : []));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const maps = await all(db,
    `SELECT g.series_id, g.seq, g.map, gt.team_id, gt.score
     FROM games g JOIN game_teams gt ON gt.game_id = g.id
     WHERE g.series_id IN (${ids.map(() => "?").join(",")}) ORDER BY g.seq`, ...ids);
  return rows.map((s) => {
    const byGame = new Map<number, Row>();
    for (const m of maps.filter((m) => m.series_id === s.id)) {
      const g = byGame.get(m.seq) ?? { map: m.map, scores: {} as Record<string, number> };
      g.scores[m.team_id] = m.score;
      byGame.set(m.seq, g);
    }
    return { ...s, maps: [...byGame.values()] };
  });
}

export async function seriesDetail(db: D1Database, id: string) {
  const series = await first(db,
    `SELECT s.*, t1.name AS t1_name, t2.name AS t2_name, tr.name AS tournament
     FROM series s
     LEFT JOIN teams t1 ON t1.id = s.team1_id
     LEFT JOIN teams t2 ON t2.id = s.team2_id
     LEFT JOIN tournaments tr ON tr.id = s.tournament_id
     WHERE s.id = ? AND s.status = 'done'`, id);
  if (!series) return null;
  const games = await all(db, "SELECT * FROM games WHERE series_id = ? ORDER BY seq", id);
  const gameIds = games.map((g) => g.id);
  if (!gameIds.length) return { series, games: [] };
  const ph = gameIds.map(() => "?").join(",");
  const [rounds, teams, players] = await Promise.all([
    all(db, `SELECT * FROM rounds WHERE game_id IN (${ph}) ORDER BY game_id, round_no`, ...gameIds),
    all(db, withTeamMetrics(`SELECT game_id, team_id, score, opp_score, start_side, max_lead, max_deficit, best_streak, ${teamSums()}
      FROM game_teams WHERE game_id IN (${ph}) GROUP BY game_id, team_id`), ...gameIds),
    all(db, withPlayerMetrics(`SELECT gp.game_id, gp.player_id, gp.team_id, gp.agent, gp.weapons, p.name, ${playerSums}
      FROM game_players gp JOIN players p ON p.id = gp.player_id WHERE gp.game_id IN (${ph})
      GROUP BY gp.game_id, gp.player_id`), ...gameIds),
  ]);
  return {
    series,
    games: games.map((g) => ({
      ...g,
      rounds: rounds.filter((r) => r.game_id === g.id),
      teams: teams.filter((t) => t.game_id === g.id),
      players: players.filter((p) => p.game_id === g.id).sort((a, b) => b.adr - a.adr),
    })),
  };
}

// ------------------------------------------------------------------ teams

export const teamInfo = (db: D1Database, id: string) => first(db, "SELECT * FROM teams WHERE id = ?", id);

export const teamSummary = (db: D1Database, id: string, cutoff: string) =>
  first(db, withTeamMetrics(`SELECT ${teamSums()} FROM game_teams WHERE team_id = ? AND start_time >= ?`), id, cutoff);

export const teamByMap = (db: D1Database, id: string, cutoff: string) =>
  all(db, withTeamMetrics(`SELECT map, ${teamSums()} FROM game_teams WHERE team_id = ? AND start_time >= ? GROUP BY map`)
    + " ORDER BY maps DESC", id, cutoff);

/** How the team loses rounds = how its opponents won them. */
export const teamLosses = (db: D1Database, id: string, cutoff: string) =>
  first(db,
    `SELECT SUM(o.win_elim_def) AS atk_loss_elim, SUM(o.win_defuse_def) AS atk_loss_defuse, SUM(o.win_time_def) AS atk_loss_time,
            SUM(o.win_elim_atk) AS def_loss_elim, SUM(o.win_boom_atk) AS def_loss_boom,
            SUM(o.atk_rounds - o.atk_wins) AS def_losses_check
     FROM game_teams t JOIN game_teams o ON o.game_id = t.game_id AND o.team_id = t.opponent_id
     WHERE t.team_id = ? AND t.start_time >= ?`, id, cutoff);

export const teamRoster = (db: D1Database, id: string, cutoff: string) =>
  all(db, withPlayerMetrics(`SELECT gp.player_id, p.name, ${playerSums}
    FROM game_players gp JOIN players p ON p.id = gp.player_id
    WHERE gp.game_id IN (SELECT game_id FROM game_teams WHERE team_id = ?1 AND start_time >= ?2) AND gp.team_id = ?1
    GROUP BY gp.player_id`) + " ORDER BY rounds DESC", id, cutoff);

export const teamRecentMaps = (db: D1Database, id: string, limit = 15) =>
  all(db,
    `SELECT gt.*, o.name AS opp_name, tr.name AS tournament
     FROM game_teams gt
     JOIN teams o ON o.id = gt.opponent_id
     JOIN series s ON s.id = gt.series_id
     LEFT JOIN tournaments tr ON tr.id = s.tournament_id
     WHERE gt.team_id = ? ORDER BY gt.start_time DESC, gt.game_id DESC LIMIT ?`, id, limit);

export const teamList = (db: D1Database, period: Period, q: string, minMaps: number) =>
  all(db, withTeamMetrics(`SELECT a.*, t.name FROM agg_teams a JOIN teams t ON t.id = a.team_id
    WHERE a.period = ? AND a.maps >= ? AND t.name LIKE ?`) + " ORDER BY maps DESC LIMIT 300",
    period, minMaps, `%${q}%`);

// ------------------------------------------------------------------ players

export const playerInfo = (db: D1Database, id: string) =>
  first(db, "SELECT p.*, t.name AS team_name FROM players p LEFT JOIN teams t ON t.id = p.last_team_id WHERE p.id = ?", id);

export const playerSummary = (db: D1Database, id: string, cutoff: string) =>
  first(db, withPlayerMetrics(`SELECT ${playerSums} FROM game_players WHERE player_id = ? AND start_time >= ?`), id, cutoff);

export const playerBy = (db: D1Database, id: string, cutoff: string, col: "map" | "agent") =>
  all(db, withPlayerMetrics(`SELECT ${col} AS k, ${playerSums} FROM game_players
    WHERE player_id = ? AND start_time >= ? GROUP BY ${col}`) + " ORDER BY maps DESC", id, cutoff);

export const playerWeapons = (db: D1Database, id: string, cutoff: string) =>
  all(db,
    `SELECT j.key AS weapon, SUM(j.value) AS kills
     FROM game_players gp, json_each(gp.weapons) j
     WHERE gp.player_id = ? AND gp.start_time >= ? GROUP BY j.key ORDER BY kills DESC`, id, cutoff);

export const playerRecent = (db: D1Database, id: string, limit = 15) =>
  all(db, withPlayerMetrics(
    `SELECT gp.game_id, gp.series_id, gp.map, gp.agent, gp.start_time, gp.won AS won_map, o.name AS opp_name, ${playerSums}
     FROM game_players gp JOIN teams o ON o.id = gp.opponent_id
     WHERE gp.player_id = ? GROUP BY gp.game_id`) + " ORDER BY start_time DESC LIMIT ?", id, limit);

export const playerList = (db: D1Database, period: Period, q: string, minRounds: number) =>
  all(db, withPlayerMetrics(`SELECT a.*, p.name, t.name AS team_name, p.last_team_id
    FROM agg_players a JOIN players p ON p.id = a.player_id LEFT JOIN teams t ON t.id = p.last_team_id
    WHERE a.period = ? AND a.rounds >= ? AND p.name LIKE ?`) + " ORDER BY rounds DESC LIMIT 300",
    period, minRounds, `%${q}%`);

// ------------------------------------------------------------------ leaderboards

export function leaderboard(db: D1Database, kind: "teams" | "players", period: Period, sortKey: string, dir: "asc" | "desc", min: number) {
  const valid = (kind === "teams" ? TEAM_METRICS : PLAYER_METRICS).some((m) => m.key === sortKey);
  const order = valid ? sortKey : kind === "teams" ? "map_wr" : "kas";
  const d = dir === "asc" ? "ASC" : "DESC";
  if (kind === "teams") {
    return all(db, withTeamMetrics(`SELECT a.*, t.name FROM agg_teams a JOIN teams t ON t.id = a.team_id
      WHERE a.period = ? AND a.maps >= ?`) + ` ORDER BY ${order} ${d} NULLS LAST LIMIT 100`, period, min);
  }
  return all(db, withPlayerMetrics(`SELECT a.*, p.name, t.name AS team_name, p.last_team_id
    FROM agg_players a JOIN players p ON p.id = a.player_id LEFT JOIN teams t ON t.id = p.last_team_id
    WHERE a.period = ? AND a.rounds >= ?`) + ` ORDER BY ${order} ${d} NULLS LAST LIMIT 100`, period, min);
}

// ------------------------------------------------------------------ maps

export const mapList = (db: D1Database, period: Period) =>
  all(db, withMapMetrics("SELECT * FROM agg_maps WHERE period = ?") + " ORDER BY maps DESC", period);

export const mapSummary = (db: D1Database, map: string, period: Period) =>
  first(db, withMapMetrics("SELECT * FROM agg_maps WHERE period = ? AND map = ?"), period, map);

export const mapTeams = (db: D1Database, map: string, cutoff: string, minMaps: number) =>
  all(db, withTeamMetrics(`SELECT gt.team_id, t.name, ${teamSums("gt.")}
    FROM game_teams gt JOIN teams t ON t.id = gt.team_id
    WHERE gt.map = ? AND gt.start_time >= ? GROUP BY gt.team_id HAVING COUNT(*) >= ?`) + " ORDER BY map_wr DESC, maps DESC LIMIT 50",
    map, cutoff, minMaps);

// ------------------------------------------------------------------ search

export async function search(db: D1Database, q: string) {
  const like = `%${q}%`;
  const [teams, players] = await Promise.all([
    all(db, "SELECT id, name FROM teams WHERE name LIKE ? ORDER BY length(name) LIMIT 25", like),
    all(db, `SELECT p.id, p.name, t.name AS team_name FROM players p LEFT JOIN teams t ON t.id = p.last_team_id
             WHERE p.name LIKE ? ORDER BY p.last_seen DESC LIMIT 25`, like),
  ]);
  return { teams, players };
}
