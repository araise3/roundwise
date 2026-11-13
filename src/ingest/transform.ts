/**
 * Pure transform: one GRID SeriesState -> rows for games, rounds, game_teams, game_players.
 * All round-derived stats (pistols, conversions, first kills, plants, retakes, survival, KAS,
 * multi-kills, side splits, comebacks) are computed here once at ingest time.
 */
import type { GamePlayer, GameState, Segment, SegmentTeam, SeriesState } from "../grid/types";
import { PLAYER_SUM_COLS, TEAM_SUM_COLS, type PlayerSums, type TeamSums } from "../stats/columns";

export interface GameRow {
  id: string; series_id: string; seq: number; map: string; start_time: string;
  winner_id: string | null; loser_id: string | null; rounds: number; overtime: number;
}
export interface RoundRow {
  game_id: string; round_no: number; winner_id: string; atk_id: string; def_id: string;
  win_type: string | null; fk_team_id: string | null;
  planted: number; exploded: number; defused: number;
  atk_alive: number; def_alive: number; atk_kills: number; def_kills: number;
}
export type GameTeamRow = TeamSums & {
  game_id: string; team_id: string; opponent_id: string; series_id: string; map: string; start_time: string;
  won: number; score: number; opp_score: number; start_side: string | null;
  max_lead: number; max_deficit: number; best_streak: number;
};
export type GamePlayerRow = PlayerSums & {
  game_id: string; player_id: string; team_id: string; opponent_id: string; series_id: string;
  map: string; start_time: string; won: number; agent: string | null; weapons: string;
};
export interface PlayerRef { id: string; name: string; team_id: string }

export interface TransformResult {
  winner_id: string | null;
  scores: Record<string, number>;
  games: GameRow[];
  rounds: RoundRow[];
  gameTeams: GameTeamRow[];
  gamePlayers: GamePlayerRow[];
  players: PlayerRef[];
}

const PISTOL_ROUNDS = [1, 13];
const REGULATION_ROUNDS = 24;

const zeros = <K extends string>(cols: readonly K[]) =>
  Object.fromEntries(cols.map((c) => [c, 0])) as Record<K, number>;

const obj = (t: SegmentTeam, type: string) =>
  (t.objectives ?? []).reduce((n, o) => (o.type === type ? n + o.completionCount : n), 0);

/** Fallback when `alive` is missing: a player who didn't die in the round survived it. */
const isAlive = (p: { alive?: boolean; deaths: number }) => (p.alive ?? p.deaths === 0);

interface ParsedRound { no: number; atk: SegmentTeam; def: SegmentTeam; winner: SegmentTeam; loser: SegmentTeam }

function parseRounds(segments: Segment[]): ParsedRound[] {
  const out: ParsedRound[] = [];
  for (const s of [...segments].sort((a, b) => a.sequenceNumber - b.sequenceNumber)) {
    if (s.type !== "round" || s.teams.length !== 2) continue;
    const atk = s.teams.find((t) => t.side === "attacker");
    const def = s.teams.find((t) => t.side === "defender");
    if (!atk || !def) continue;
    const winner = atk.won ? atk : def.won ? def : null;
    if (!winner) continue; // round not completed
    out.push({ no: s.sequenceNumber, atk, def, winner, loser: winner === atk ? def : atk });
  }
  return out;
}

export function transformSeries(state: SeriesState, startTime: string): TransformResult {
  const result: TransformResult = {
    winner_id: state.teams.find((t) => t.won)?.id ?? null,
    scores: Object.fromEntries(state.teams.map((t) => [t.id, t.score])),
    games: [], rounds: [], gameTeams: [], gamePlayers: [], players: [],
  };
  const seenPlayers = new Map<string, PlayerRef>();

  for (const game of state.games) {
    const g = transformGame(state.id, game, startTime);
    if (!g) continue;
    result.games.push(g.game);
    result.rounds.push(...g.rounds);
    result.gameTeams.push(...g.gameTeams);
    result.gamePlayers.push(...g.gamePlayers);
    for (const p of g.players) seenPlayers.set(p.id, p);
  }
  result.players = [...seenPlayers.values()];
  return result;
}

export function transformGame(seriesId: string, game: GameState, startTime: string) {
  if (!game.finished || game.teams.length !== 2 || !game.map?.name) return null;
  const rounds = parseRounds(game.segments);
  if (rounds.length === 0) return null;

  const gameId = `${seriesId}-${game.sequenceNumber}`;
  const map = game.map.name.toLowerCase();
  const [t1, t2] = game.teams;
  const opp = (id: string) => (id === t1.id ? t2.id : t1.id);
  const overtime = rounds.some((r) => r.no > REGULATION_ROUNDS) ? 1 : 0;

  // ---- team accumulators
  const teamAcc = new Map<string, TeamSums>([[t1.id, zeros(TEAM_SUM_COLS)], [t2.id, zeros(TEAM_SUM_COLS)]]);
  const flow = new Map([t1.id, t2.id].map((id) => [id, { score: 0, maxLead: 0, maxDeficit: 0, streak: 0, best: 0 }]));
  const roundRows: RoundRow[] = [];
  const winnerByRound = new Map<number, string>();

  // ---- player accumulators
  const playerAcc = new Map<string, PlayerSums>();
  const pAcc = (id: string) => {
    let a = playerAcc.get(id);
    if (!a) playerAcc.set(id, (a = zeros(PLAYER_SUM_COLS)));
    return a;
  };

  for (const r of rounds) {
    const planted = obj(r.atk, "plantBomb") > 0;
    const exploded = obj(r.atk, "explodeBomb") > 0 || r.winner.winType === "bombExploded";
    const defused = obj(r.def, "defuseBomb") > 0 || r.winner.winType === "bombDefused";
    const alive = (t: SegmentTeam) => (t.players ?? []).filter(isAlive).length;
    const isPistol = PISTOL_ROUNDS.includes(r.no);
    winnerByRound.set(r.no, r.winner.id);

    roundRows.push({
      game_id: gameId, round_no: r.no, winner_id: r.winner.id, atk_id: r.atk.id, def_id: r.def.id,
      win_type: r.winner.winType || null,
      fk_team_id: r.atk.firstKill ? r.atk.id : r.def.firstKill ? r.def.id : null,
      planted: +planted, exploded: +exploded, defused: +defused,
      atk_alive: alive(r.atk), def_alive: alive(r.def), atk_kills: r.atk.kills, def_kills: r.def.kills,
    });

    for (const t of [r.atk, r.def]) {
      const a = teamAcc.get(t.id);
      if (!a) continue; // team id mismatch between segment and game; ignore defensively
      const o = t === r.atk ? r.def : r.atk;
      const won = t === r.winner;
      const isAtk = t === r.atk;

      a.rounds++;
      if (isAtk) { a.atk_rounds++; if (won) a.atk_wins++; } else { a.def_rounds++; if (won) a.def_wins++; }
      if (isPistol) {
        a.pistol_rounds++; if (won) a.pistol_wins++;
        if (isAtk) { a.pistol_atk_rounds++; if (won) a.pistol_atk_wins++; }
      }
      if (t.firstKill) { a.fk_rounds++; if (won) a.fk_wins++; }
      else if (o.firstKill) { a.fd_rounds++; if (won) a.fd_wins++; }

      if (won) {
        const wt = t.winType;
        if (isAtk) {
          if (wt === "opponentEliminated") a.win_elim_atk++;
          else if (wt === "bombExploded") a.win_boom_atk++;
        } else {
          if (wt === "opponentEliminated") a.win_elim_def++;
          else if (wt === "bombDefused") a.win_defuse_def++;
          else if (wt === "timeExpired") a.win_time_def++;
        }
      }

      if (isAtk && planted) { a.plants++; if (won) a.plant_wins++; }
      if (!isAtk) {
        if (planted) { a.opp_plants++; if (won) a.retakes++; if (defused) a.defuses++; }
        a.defuse_starts += obj(t, "beginDefuseBomb");
        a.defuse_stops += obj(t, "stopDefuseBomb");
        a.defuse_halfway += obj(t, "reachDefuseBombCheckpoint");
      }
      a.orbs += obj(t, "captureUltimateOrb");
      a.opp_orbs += obj(o, "captureUltimateOrb");

      const nAlive = alive(t);
      if (won && nAlive === 5) a.flawless++;
      if (!won) { a.lost_rounds++; a.survivors_in_losses += nAlive; }

      // players in this round
      for (const p of t.players ?? []) {
        const s = pAcc(p.id);
        const k = p.kills;
        const surv = isAlive(p) ? 1 : 0;
        s.rounds++;
        s.survived += surv;
        if (k > 0 || p.killAssistsGiven > 0 || surv) s.kas_rounds++;
        if (p.firstKill) { s.fk++; if (won) s.fk_wins++; }
        if (k >= 5) s.mk5++; else if (k === 4) s.mk4++; else if (k === 3) s.mk3++; else if (k === 2) s.mk2++;
        if (isAtk) {
          s.atk_rounds++; s.atk_kills += k; s.atk_deaths += p.deaths;
          s.atk_damage += p.damageDealt ?? 0; s.atk_survived += surv;
        } else {
          s.def_rounds++; s.def_kills += k; s.def_deaths += p.deaths;
          s.def_damage += p.damageDealt ?? 0; s.def_survived += surv;
        }
        if (isPistol) { s.pistol_rounds++; s.pistol_kills += k; s.pistol_survived += surv; }
      }
    }

    // score flow
    const w = flow.get(r.winner.id)!;
    const l = flow.get(r.loser.id)!;
    if (w && l) {
      w.score++; w.streak++; w.best = Math.max(w.best, w.streak); l.streak = 0;
      w.maxLead = Math.max(w.maxLead, w.score - l.score);
      l.maxDeficit = Math.max(l.maxDeficit, w.score - l.score);
    }
  }

  // post-pistol conversion (next two rounds of the same half)
  for (const p of PISTOL_ROUNDS) {
    const pw = winnerByRound.get(p);
    if (!pw) continue;
    for (const n of [p + 1, p + 2]) {
      const nw = winnerByRound.get(n);
      if (!nw) continue;
      const winA = teamAcc.get(pw);
      const loseA = teamAcc.get(opp(pw));
      if (winA) { winA.conv_opps++; if (nw === pw) winA.conv_wins++; }
      if (loseA) { loseA.break_opps++; if (nw !== pw) loseA.break_wins++; }
    }
  }

  // game-level player totals (authoritative for K/D/A/damage) + team totals
  const gamePlayers: GamePlayerRow[] = [];
  const players: PlayerRef[] = [];
  for (const team of game.teams) {
    const a = teamAcc.get(team.id)!;
    for (const p of team.players) {
      const s = pAcc(p.id);
      applyGamePlayer(s, p);
      a.kills += p.kills; a.deaths += p.deaths;
      a.damage += p.damageDealt ?? 0; a.damage_taken += p.damageTaken ?? 0; a.headshots += p.headshots ?? 0;
      const weapons = Object.fromEntries((p.weaponKills ?? []).filter((w) => w.count > 0).map((w) => [w.weaponName, w.count]));
      gamePlayers.push({
        ...s, game_id: gameId, player_id: p.id, team_id: team.id, opponent_id: opp(team.id),
        series_id: seriesId, map, start_time: startTime, won: team.won ? 1 : 0,
        agent: p.character?.name?.toLowerCase() ?? null, weapons: JSON.stringify(weapons),
      });
      players.push({ id: p.id, name: p.name, team_id: team.id });
    }
    a.overtime = overtime;
  }

  const firstRound = rounds[0];
  const gameTeams: GameTeamRow[] = game.teams.map((team) => {
    const f = flow.get(team.id)!;
    const o = flow.get(opp(team.id))!;
    return {
      ...teamAcc.get(team.id)!,
      game_id: gameId, team_id: team.id, opponent_id: opp(team.id), series_id: seriesId, map, start_time: startTime,
      won: team.won ? 1 : 0, score: f.score, opp_score: o.score,
      start_side: firstRound.atk.id === team.id ? "attacker" : firstRound.def.id === team.id ? "defender" : null,
      max_lead: f.maxLead, max_deficit: f.maxDeficit, best_streak: f.best,
    };
  });

  const winner = game.teams.find((t) => t.won);
  return {
    game: {
      id: gameId, series_id: seriesId, seq: game.sequenceNumber, map, start_time: startTime,
      winner_id: winner?.id ?? null, loser_id: winner ? opp(winner.id) : null,
      rounds: rounds.length, overtime,
    } satisfies GameRow,
    rounds: roundRows,
    gameTeams,
    gamePlayers,
    players,
  };
}

function applyGamePlayer(s: PlayerSums, p: GamePlayer) {
  s.kills = p.kills;
  s.deaths = p.deaths;
  s.assists = p.killAssistsGiven;
  s.headshots = p.headshots ?? 0;
  s.damage = p.damageDealt ?? 0;
  s.damage_taken = p.damageTaken ?? 0;
}
