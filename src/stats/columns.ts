/**
 * Single source of truth for the summable stat columns stored per team-map and
 * per player-map. The migration declares the same columns (test/columns.test.ts
 * checks they stay in sync); aggregate tables and SQL builders are generated from these lists.
 */

/** Per team, per map (game_teams). All values are counts that can be summed across maps. */
export const TEAM_SUM_COLS = [
  "rounds",
  "atk_rounds", "atk_wins", "def_rounds", "def_wins",
  "pistol_rounds", "pistol_wins", "pistol_atk_rounds", "pistol_atk_wins",
  "conv_opps", "conv_wins", "break_opps", "break_wins",
  "fk_rounds", "fk_wins", "fd_rounds", "fd_wins",
  "win_elim_atk", "win_boom_atk", "win_elim_def", "win_defuse_def", "win_time_def",
  "plants", "plant_wins", "opp_plants", "retakes", "defuses",
  "defuse_starts", "defuse_stops", "defuse_halfway",
  "orbs", "opp_orbs",
  "flawless", "lost_rounds", "survivors_in_losses",
  "overtime",
  "kills", "deaths", "damage", "damage_taken", "headshots",
  // vlr.gg economy (VCT only; 0 elsewhere): own buy per non-pistol round, and anti-eco rounds
  "vlr_eco_rounds", "vlr_eco_wins", "vlr_semieco_rounds", "vlr_semieco_wins",
  "vlr_semibuy_rounds", "vlr_semibuy_wins", "vlr_fullbuy_rounds", "vlr_fullbuy_wins",
  "vlr_antieco_rounds", "vlr_antieco_wins",
] as const;

/** Per player, per map (game_players). */
export const PLAYER_SUM_COLS = [
  "rounds", "kills", "deaths", "assists", "headshots", "damage", "damage_taken",
  "atk_rounds", "atk_kills", "atk_deaths", "atk_damage", "atk_survived",
  "def_rounds", "def_kills", "def_deaths", "def_damage", "def_survived",
  "survived", "kas_rounds", "fk", "fk_wins",
  "mk2", "mk3", "mk4", "mk5",
  "pistol_rounds", "pistol_kills", "pistol_survived",
  // vlr.gg (VCT only; 0 elsewhere): value x rounds sums, each with its own rounds count
  "vlr_rating_rounds", "vlr_rating", "vlr_acs_rounds", "vlr_acs", "vlr_kast_rounds", "vlr_kast",
  "vlr_perf_rounds", "vlr_clutches", "vlr_econ", "vlr_plants", "vlr_defuses",
  "vlr_atk_rounds", "vlr_atk_rating", "vlr_def_rounds", "vlr_def_rating",
] as const;

export type TeamSumCol = (typeof TEAM_SUM_COLS)[number];
export type PlayerSumCol = (typeof PLAYER_SUM_COLS)[number];
export type TeamSums = Record<TeamSumCol, number>;
export type PlayerSums = Record<PlayerSumCol, number>;

export const sumSelect = (cols: readonly string[], prefix = "") =>
  cols.map((c) => `SUM(${prefix}${c}) AS ${c}`).join(", ");
