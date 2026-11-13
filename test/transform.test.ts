// Uses a small synthetic series (made-up teams/players), not GRID data.
import { describe, expect, it } from "vitest";
import type { Objective, SegmentPlayer, SegmentTeam, SeriesState } from "../src/grid/types";
import { transformSeries } from "../src/ingest/transform";

const A = "ta";
const B = "tb";
const pids = (t: string) => [1, 2, 3, 4, 5].map((i) => `${t}p${i}`);

interface RoundSpec {
  winner: "A" | "B";
  aSide: "attacker" | "defender";
  winType: string;
  fk: "A" | "B";
  planted?: boolean;
  aliveA?: number;
  aliveB?: number;
  killsA?: number[]; // per player
}

function team(id: string, side: string, won: boolean, fk: boolean, alive: number, kills: number[], objectives: Objective[], winType: string): SegmentTeam {
  const players: SegmentPlayer[] = pids(id).map((pid, i) => ({
    id: pid, kills: kills[i] ?? 0, deaths: i < 5 - alive ? 1 : 0, killAssistsGiven: 0,
    firstKill: fk && i === 0, alive: i >= 5 - alive, headshots: 0, damageDealt: (kills[i] ?? 0) * 150, damageTaken: 0,
  }));
  return {
    id, side, won, firstKill: fk, kills: kills.reduce((a, b) => a + b, 0), deaths: 5 - alive,
    winType: won ? winType : "", objectives, players,
  };
}

function round(no: number, r: RoundSpec) {
  const aWon = r.winner === "A";
  const bSide = r.aSide === "attacker" ? "defender" : "attacker";
  const atkIsA = r.aSide === "attacker";
  const plantObj = r.planted ? [{ type: "plantBomb", completionCount: 1 }] : [];
  const aObj = atkIsA ? plantObj : r.winType === "bombDefused" && aWon ? [{ type: "defuseBomb", completionCount: 1 }] : [];
  const bObj = !atkIsA ? plantObj : r.winType === "bombDefused" && !aWon ? [{ type: "defuseBomb", completionCount: 1 }] : [];
  return {
    sequenceNumber: no,
    type: "round",
    teams: [
      team(A, r.aSide, aWon, r.fk === "A", r.aliveA ?? (aWon ? 3 : 0), r.killsA ?? (aWon ? [2, 1, 1, 1, 0] : [1, 1, 0, 0, 0]), aObj, r.winType),
      team(B, bSide, !aWon, r.fk === "B", r.aliveB ?? (aWon ? 0 : 3), aWon ? [1, 0, 0, 0, 0] : [2, 1, 1, 1, 0], bObj, r.winType),
    ],
  };
}

function makeSeries(rounds: RoundSpec[]): SeriesState {
  const aRounds = rounds.filter((r) => r.winner === "A").length;
  const bRounds = rounds.length - aRounds;
  const gp = (t: string) => pids(t).map((id) => ({
    id, name: id.toUpperCase(), character: { name: "Sova" }, kills: 10, deaths: 8, killAssistsGiven: 3,
    headshots: 4, damageDealt: 1500, damageTaken: 1200, weaponKills: [{ weaponName: "vandal", count: 7 }, { weaponName: "ghost", count: 3 }],
  }));
  return {
    id: "s1", started: true, finished: true,
    teams: [{ id: A, name: "Alpha", won: aRounds > bRounds, score: 1 }, { id: B, name: "Bravo", won: bRounds > aRounds, score: 0 }],
    games: [{
      id: "g1", sequenceNumber: 1, finished: true, map: { name: "Ascent" },
      teams: [
        { id: A, name: "Alpha", side: "defender", won: aRounds > bRounds, score: aRounds, players: gp(A) },
        { id: B, name: "Bravo", side: "attacker", won: bRounds > aRounds, score: bRounds, players: gp(B) },
      ],
      segments: rounds.map((r, i) => round(i + 1, r)),
    }],
  };
}

// 13 rounds: A attacks rounds 1-12, defends from 13.
const spec: RoundSpec[] = [
  { winner: "A", aSide: "attacker", winType: "bombExploded", fk: "A", planted: true },       // 1 pistol (A atk win)
  { winner: "A", aSide: "attacker", winType: "opponentEliminated", fk: "B" },                 // 2 conv win, FD recovered
  { winner: "B", aSide: "attacker", winType: "bombDefused", fk: "A", planted: true },         // 3 conv loss, B retake via defuse
  ...Array.from({ length: 9 }, (): RoundSpec => ({ winner: "B", aSide: "attacker", winType: "timeExpired", fk: "B" })), // 4-12
  { winner: "A", aSide: "defender", winType: "opponentEliminated", fk: "A", aliveA: 5, killsA: [5, 0, 0, 0, 0] }, // 13 pistol, flawless, ace
];

describe("transformSeries", () => {
  const t = transformSeries(makeSeries(spec), "2026-01-01T00:00:00Z");
  const ta = t.gameTeams.find((g) => g.team_id === A)!;
  const tb = t.gameTeams.find((g) => g.team_id === B)!;

  it("builds one game with every round", () => {
    expect(t.games).toHaveLength(1);
    expect(t.games[0]).toMatchObject({ id: "s1-1", map: "ascent", rounds: 13, overtime: 0 });
    expect(t.rounds).toHaveLength(13);
    expect(ta.score).toBe(3);
    expect(tb.score).toBe(10);
  });

  it("splits rounds by side and counts pistols", () => {
    expect(ta).toMatchObject({ atk_rounds: 12, atk_wins: 2, def_rounds: 1, def_wins: 1 });
    expect(ta).toMatchObject({ pistol_rounds: 2, pistol_wins: 2, pistol_atk_rounds: 1, pistol_atk_wins: 1 });
    expect(tb).toMatchObject({ pistol_rounds: 2, pistol_wins: 0 });
    expect(ta.start_side).toBe("attacker");
  });

  it("computes post-pistol conversion and bounce-back", () => {
    // Pistol 1 won by A; rounds 2 (A) and 3 (B). Pistol 13 has no follow-up rounds.
    expect(ta).toMatchObject({ conv_opps: 2, conv_wins: 1 });
    expect(tb).toMatchObject({ break_opps: 2, break_wins: 1 });
  });

  it("tracks first kills and first deaths", () => {
    expect(ta).toMatchObject({ fk_rounds: 3, fk_wins: 2, fd_rounds: 10, fd_wins: 1 });
  });

  it("classifies win conditions and spike play", () => {
    expect(ta).toMatchObject({ win_boom_atk: 1, win_elim_atk: 1, win_elim_def: 1 });
    expect(tb).toMatchObject({ win_defuse_def: 1, win_time_def: 9 });
    expect(ta).toMatchObject({ plants: 2, plant_wins: 1 });
    expect(tb).toMatchObject({ opp_plants: 2, retakes: 1, defuses: 1 });
  });

  it("tracks flawless rounds, survivors in losses, and score flow", () => {
    expect(ta.flawless).toBe(1);
    expect(tb.lost_rounds).toBe(3);
    expect(ta.max_lead).toBe(2);
    expect(ta.max_deficit).toBe(8);
    expect(tb.best_streak).toBe(10);
  });

  it("computes per-player round stats", () => {
    const p1 = t.gamePlayers.find((p) => p.player_id === "tap1")!;
    expect(p1.rounds).toBe(13);
    expect(p1.mk5).toBe(1);
    expect(p1.kills).toBe(10); // game-level total wins over round sums
    expect(p1.fk).toBe(3);
    expect(p1.fk_wins).toBe(2);
    expect(p1.pistol_rounds).toBe(2);
    expect(p1.atk_rounds + p1.def_rounds).toBe(13);
    expect(JSON.parse(p1.weapons)).toEqual({ vandal: 7, ghost: 3 });
    expect(p1.agent).toBe("sova");
  });

  it("marks rounds with plant, defuse, and first-kill team", () => {
    expect(t.rounds[0]).toMatchObject({ planted: 1, exploded: 1, winner_id: A, atk_id: A, fk_team_id: A });
    expect(t.rounds[2]).toMatchObject({ planted: 1, defused: 1, winner_id: B, win_type: "bombDefused" });
  });

  it("skips unfinished games", () => {
    const s = makeSeries(spec);
    s.games[0].finished = false;
    expect(transformSeries(s, "2026-01-01T00:00:00Z").games).toHaveLength(0);
  });

  it("detects overtime", () => {
    const long: RoundSpec[] = Array.from({ length: 26 }, (_, i) => ({
      winner: i % 2 ? "A" : "B", aSide: i < 12 ? "attacker" : "defender", winType: "opponentEliminated", fk: "A",
    }));
    const r = transformSeries(makeSeries(long), "2026-01-01T00:00:00Z");
    expect(r.games[0].overtime).toBe(1);
  });
});
