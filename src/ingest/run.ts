/**
 * Scheduled ingest:
 *   1. discover()  - page Central Data for VALORANT series and queue them as `pending`
 *   2. process()   - fetch Series State for a small batch of due series, transform, store
 *   3. refreshAggregates() - rebuild leaderboard/map aggregates every AGG_EVERY_HOURS
 * Everything is stored in our own D1 database; pages never call GRID (ToS 3.3, 5.2).
 */
import { gridQuery, GridError, RateLimitedError } from "../grid/client";
import { CENTRAL_DATA_URL, LIST_SERIES, SERIES_STATE, SERIES_STATE_URL, VALORANT_TITLE_ID } from "../grid/queries";
import type { ListSeriesData, SeriesStateData } from "../grid/types";
import { PLAYER_SUM_COLS, sumSelect, TEAM_SUM_COLS } from "../stats/columns";
import { PERIODS, periodCutoff } from "../stats/periods";
import { getMeta, insertRow, runBatched, setMeta } from "./db";
import { transformSeries } from "./transform";

const HOUR = 3600_000;
const DAY = 24 * HOUR;
// 50 series per page. Keeps discovery + BATCH_SIZE state calls well under the 50-subrequest
// limit of the Workers free plan while catching up a long backfill in a few runs.
const MAX_DISCOVERY_PAGES = 10;
const RESCAN_WINDOW = 2 * DAY; // keep re-reading recent days so reschedules are picked up

export interface IngestReport {
  discovered: number;
  processed: number;
  stored: number;
  retried: number;
  skipped: number;
  rateLimited: boolean;
  aggregated: boolean;
}

export async function runIngest(env: Env, now = new Date()): Promise<IngestReport> {
  const report: IngestReport = { discovered: 0, processed: 0, stored: 0, retried: 0, skipped: 0, rateLimited: false, aggregated: false };
  try {
    report.discovered = await discover(env, now);
    await processBatch(env, now, report);
  } catch (e) {
    if (e instanceof RateLimitedError) report.rateLimited = true;
    else throw e;
  }
  const last = await getMeta(env.DB, "agg_built_at");
  const every = Number(env.AGG_EVERY_HOURS || "6") * HOUR;
  if (!last || now.getTime() - Date.parse(last) >= every) {
    await refreshAggregates(env.DB, now);
    report.aggregated = true;
  }
  return report;
}

// ---------------------------------------------------------------- discovery

async function discover(env: Env, now: Date): Promise<number> {
  const from = (await getMeta(env.DB, "discover_from")) ?? env.BACKFILL_FROM;
  let after: string | null = null;
  let latest = from;
  let hasNext = false;
  let count = 0;

  for (let page = 0; page < MAX_DISCOVERY_PAGES; page++) {
    const data: ListSeriesData = await gridQuery<ListSeriesData>(CENTRAL_DATA_URL, env.GRID_API_KEY, LIST_SERIES, {
      from, after, titleId: VALORANT_TITLE_ID,
    });
    const stmts: D1PreparedStatement[] = [];
    for (const { node } of data.allSeries.edges) {
      if (node.startTimeScheduled > latest) latest = node.startTimeScheduled;
      if (node.type !== "ESPORTS" || node.teams.length !== 2) continue;
      const [a, b] = node.teams.map((t) => t.baseInfo);
      for (const t of [a, b]) {
        stmts.push(env.DB.prepare(
          `INSERT INTO teams (id, name, short_name, color) VALUES (?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name, color = excluded.color`,
        ).bind(t.id, t.name, t.nameShortened ?? null, t.colorPrimary ?? null));
      }
      if (node.tournament) {
        stmts.push(env.DB.prepare(
          `INSERT INTO tournaments (id, name, short_name) VALUES (?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name, short_name = excluded.short_name`,
        ).bind(node.tournament.id, node.tournament.name, node.tournament.nameShortened ?? null));
      }
      stmts.push(env.DB.prepare(
        `INSERT INTO series (id, tournament_id, start_time, format, team1_id, team2_id)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET tournament_id = excluded.tournament_id, start_time = excluded.start_time,
           format = excluded.format, team1_id = excluded.team1_id, team2_id = excluded.team2_id`,
      ).bind(node.id, node.tournament?.id ?? null, node.startTimeScheduled, node.format?.nameShortened ?? null, a.id, b.id));
      count++;
    }
    await runBatched(env.DB, stmts);
    hasNext = data.allSeries.pageInfo.hasNextPage;
    after = data.allSeries.pageInfo.endCursor;
    if (!hasNext) break;
  }

  // Advance the cursor. While catching up, jump to the latest start seen; once caught up,
  // hold it RESCAN_WINDOW behind "now" so recently (re)scheduled series are seen again.
  const rescanFrom = new Date(now.getTime() - RESCAN_WINDOW).toISOString();
  let next = hasNext ? latest : latest < rescanFrom ? latest : rescanFrom;
  if (next < from) next = from;
  await setMeta(env.DB, "discover_from", next).run();
  return count;
}

// ---------------------------------------------------------------- processing

interface DueSeries { id: string; start_time: string; attempts: number }

async function processBatch(env: Env, now: Date, report: IngestReport) {
  const delay = Number(env.DELAY_HOURS || "4") * HOUR;
  const batch = Number(env.BATCH_SIZE || "6");
  const nowIso = now.toISOString();
  const due = await env.DB.prepare(
    `SELECT id, start_time, attempts FROM series
     WHERE status = 'pending' AND start_time <= ? AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
     ORDER BY start_time DESC LIMIT ?`,
  ).bind(new Date(now.getTime() - delay).toISOString(), nowIso, batch).all<DueSeries>();

  for (const s of due.results) {
    report.processed++;
    try {
      const data = await gridQuery<SeriesStateData>(SERIES_STATE_URL, env.GRID_API_KEY, SERIES_STATE, { id: s.id });
      const state = data.seriesState;
      const age = now.getTime() - Date.parse(s.start_time);

      if (!state || !state.finished) {
        if ((!state || !state.started) && age > 3 * DAY) {
          await markSkipped(env.DB, s.id, "never started / no state"); report.skipped++;
        } else if (s.attempts >= 10) {
          await markSkipped(env.DB, s.id, "not finished after retries"); report.skipped++;
        } else {
          await retryLater(env.DB, s, now, "not finished yet"); report.retried++;
        }
        continue;
      }

      const t = transformSeries(state, s.start_time);
      if (t.games.length === 0) {
        await markSkipped(env.DB, s.id, "finished but no round data"); report.skipped++;
        continue;
      }
      await storeSeries(env.DB, s.id, t, nowIso);
      report.stored++;
    } catch (e) {
      if (e instanceof RateLimitedError) throw e;
      const msg = e instanceof GridError ? e.message : String(e);
      if (s.attempts >= 3) { await markSkipped(env.DB, s.id, msg.slice(0, 300)); report.skipped++; }
      else { await retryLater(env.DB, s, now, msg.slice(0, 300)); report.retried++; }
    }
  }
}

function retryLater(db: D1Database, s: DueSeries, now: Date, note: string) {
  const backoff = Math.min(24 * HOUR, 30 * 60_000 * 2 ** s.attempts);
  return db.prepare("UPDATE series SET attempts = attempts + 1, next_attempt_at = ?, note = ? WHERE id = ?")
    .bind(new Date(now.getTime() + backoff).toISOString(), note, s.id).run();
}

function markSkipped(db: D1Database, id: string, note: string) {
  return db.prepare("UPDATE series SET status = 'skipped', note = ? WHERE id = ?").bind(note, id).run();
}

async function storeSeries(db: D1Database, seriesId: string, t: ReturnType<typeof transformSeries>, nowIso: string) {
  const series = await db.prepare("SELECT team1_id, team2_id FROM series WHERE id = ?").bind(seriesId)
    .first<{ team1_id: string; team2_id: string }>();
  const stmts: D1PreparedStatement[] = [
    // idempotent re-ingest: clear previous rows for this series
    db.prepare("DELETE FROM rounds WHERE game_id IN (SELECT id FROM games WHERE series_id = ?)").bind(seriesId),
    db.prepare("DELETE FROM game_teams WHERE series_id = ?").bind(seriesId),
    db.prepare("DELETE FROM game_players WHERE series_id = ?").bind(seriesId),
    db.prepare("DELETE FROM games WHERE series_id = ?").bind(seriesId),
  ];
  for (const g of t.games) stmts.push(insertRow(db, "games", { ...g }));
  for (const r of t.rounds) stmts.push(insertRow(db, "rounds", { ...r }));
  for (const gt of t.gameTeams) stmts.push(insertRow(db, "game_teams", { ...gt }));
  for (const gp of t.gamePlayers) stmts.push(insertRow(db, "game_players", { ...gp }));
  const startTime = t.gameTeams[0]?.start_time ?? nowIso;
  for (const p of t.players) {
    stmts.push(db.prepare(
      `INSERT INTO players (id, name, last_team_id, last_seen) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, last_team_id = excluded.last_team_id, last_seen = excluded.last_seen
       WHERE excluded.last_seen >= COALESCE(players.last_seen, '')`,
    ).bind(p.id, p.name ?? p.id, p.team_id, startTime));
  }
  stmts.push(db.prepare(
    `UPDATE series SET status = 'done', winner_id = ?, team1_score = ?, team2_score = ?, ingested_at = ?, note = NULL
     WHERE id = ?`,
  ).bind(t.winner_id, t.scores[series?.team1_id ?? ""] ?? null, t.scores[series?.team2_id ?? ""] ?? null, nowIso, seriesId));
  await runBatched(db, stmts);
}

// ---------------------------------------------------------------- aggregates

export async function refreshAggregates(db: D1Database, now = new Date()) {
  const teamCols = TEAM_SUM_COLS.join(", ");
  const playerCols = PLAYER_SUM_COLS.join(", ");
  const stmts: D1PreparedStatement[] = [];
  for (const period of PERIODS) {
    const cutoff = periodCutoff(period, now);
    stmts.push(
      db.prepare("DELETE FROM agg_teams WHERE period = ?").bind(period),
      db.prepare(
        `INSERT INTO agg_teams (period, team_id, maps, map_wins, comebacks, blown_leads, ot_wins, ${teamCols})
         SELECT ?, team_id, COUNT(*), SUM(won),
           SUM(CASE WHEN won = 1 AND max_deficit >= 5 THEN 1 ELSE 0 END),
           SUM(CASE WHEN won = 0 AND max_lead >= 5 THEN 1 ELSE 0 END),
           SUM(overtime * won), ${sumSelect(TEAM_SUM_COLS)}
         FROM game_teams WHERE start_time >= ? GROUP BY team_id`,
      ).bind(period, cutoff),
      db.prepare("DELETE FROM agg_players WHERE period = ?").bind(period),
      db.prepare(
        `INSERT INTO agg_players (period, player_id, maps, map_wins, ${playerCols})
         SELECT ?, player_id, COUNT(*), SUM(won), ${sumSelect(PLAYER_SUM_COLS)}
         FROM game_players WHERE start_time >= ? GROUP BY player_id`,
      ).bind(period, cutoff),
      db.prepare("DELETE FROM agg_maps WHERE period = ?").bind(period),
      db.prepare(
        `INSERT INTO agg_maps (period, map, maps, ot_maps, ${teamCols})
         SELECT ?, map, COUNT(*) / 2, SUM(overtime) / 2, ${sumSelect(TEAM_SUM_COLS)}
         FROM game_teams WHERE start_time >= ? GROUP BY map`,
      ).bind(period, cutoff),
    );
  }
  stmts.push(setMeta(db, "agg_built_at", now.toISOString()));
  await db.batch(stmts);
}
