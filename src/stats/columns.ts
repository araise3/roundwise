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
] as const;

/** Per player, per map (game_players). */
export const PLAYER_SUM_COLS = [
  "rounds", "kills", "deaths", "assists", "headshots", "damage", "damage_taken",
  "atk_rounds", "atk_kills", "atk_deaths", "atk_damage", "atk_survived",
  "def_rounds", "def_kills", "def_deaths", "def_damage", "def_survived",
  "survived", "kas_rounds", "fk", "fk_wins",
  "mk2", "mk3", "mk4", "mk5",
  "pistol_rounds", "pistol_kills", "pistol_survived",
] as const;

export type TeamSumCol = (typeof TEAM_SUM_COLS)[number];
export type PlayerSumCol = (typeof PLAYER_SUM_COLS)[number];
export type TeamSums = Record<TeamSumCol, number>;
export type PlayerSums = Record<PlayerSumCol, number>;

export const sumSelect = (cols: readonly string[], prefix = "") =>
  cols.map((c) => `SUM(${prefix}${c}) AS ${c}`).join(", ");
