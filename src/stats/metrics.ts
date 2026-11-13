/**
 * Metric registry. Each metric is a SQL expression over summed columns, so the same
 * definition powers team/player/map pages, leaderboards (ORDER BY) and the About page.
 */
export type Fmt = "pct" | "dec2" | "dec1" | "int";

export interface Metric {
  key: string;
  label: string;
  /** compact column header */
  short: string;
  sql: string;
  fmt: Fmt;
  desc: string;
  /** false when lower is better (used for leaderboard default sort direction) */
  higherIsBetter?: boolean;
  /** Third-party source shown with the metric. GRID metrics have none. */
  source?: "vlr";
}

const ratio = (num: string, den: string) => `(1.0 * (${num}) / NULLIF(${den}, 0))`;

const VLR_NOTE = " From vlr.gg; VCT matches only.";
/** Mark a metric as coming from vlr.gg (VCT only). */
const vlr = <M extends Metric>(m: M): M => ({ ...m, desc: m.desc + VLR_NOTE, source: "vlr" });

export const TEAM_METRICS = [
  { key: "map_wr", label: "Map win rate", short: "Map W%", sql: ratio("map_wins", "maps"), fmt: "pct", desc: "Maps won / maps played." },
  { key: "atk_rw", label: "Attack round win rate", short: "ATK RW%", sql: ratio("atk_wins", "atk_rounds"), fmt: "pct", desc: "Rounds won on attack / attack rounds played." },
  { key: "def_rw", label: "Defense round win rate", short: "DEF RW%", sql: ratio("def_wins", "def_rounds"), fmt: "pct", desc: "Rounds won on defense / defense rounds played." },
  { key: "pistol_wr", label: "Pistol win rate", short: "Pistol%", sql: ratio("pistol_wins", "pistol_rounds"), fmt: "pct", desc: "Rounds 1 and 13 won." },
  { key: "pistol_atk_wr", label: "Attack pistol win rate", short: "ATK pistol%", sql: ratio("pistol_atk_wins", "pistol_atk_rounds"), fmt: "pct", desc: "Pistol rounds won while attacking." },
  { key: "pistol_def_wr", label: "Defense pistol win rate", short: "DEF pistol%", sql: ratio("pistol_wins - pistol_atk_wins", "pistol_rounds - pistol_atk_rounds"), fmt: "pct", desc: "Pistol rounds won while defending." },
  { key: "conv", label: "Post-pistol conversion", short: "Conv%", sql: ratio("conv_wins", "conv_opps"), fmt: "pct", desc: "After winning a pistol, share of the next two rounds also won." },
  { key: "bounce", label: "Pistol bounce-back", short: "Break%", sql: ratio("break_wins", "break_opps"), fmt: "pct", desc: "After losing a pistol, share of the next two rounds won anyway (breaking the bonus/anti-eco)." },
  { key: "fk_rate", label: "First-kill rate", short: "FK%", sql: ratio("fk_rounds", "rounds"), fmt: "pct", desc: "Rounds where the team got the opening kill." },
  { key: "fk_conv", label: "Win rate after first kill", short: "FK→W", sql: ratio("fk_wins", "fk_rounds"), fmt: "pct", desc: "Rounds won when the team got the opening kill." },
  { key: "fd_rec", label: "Win rate after first death", short: "FD→W", sql: ratio("fd_wins", "fd_rounds"), fmt: "pct", desc: "Rounds won after the opponent got the opening kill (4v5 recovery)." },
  { key: "plant_rate", label: "Plant rate", short: "Plant%", sql: ratio("plants", "atk_rounds"), fmt: "pct", desc: "Attack rounds with a spike plant." },
  { key: "postplant", label: "Post-plant win rate", short: "Post-plant%", sql: ratio("plant_wins", "plants"), fmt: "pct", desc: "Attack rounds won after planting." },
  { key: "retake", label: "Retake win rate", short: "Retake%", sql: ratio("retakes", "opp_plants"), fmt: "pct", desc: "Defense rounds won after the opponent planted (defuse or elimination)." },
  { key: "defuse_share", label: "Retakes ending in defuse", short: "Defuse%", sql: ratio("defuses", "retakes"), fmt: "pct", desc: "Share of won retakes that ended with a defuse (vs. elimination before the defuse)." },
  { key: "abandoned", label: "Abandoned defuses", short: "Stopped def.", sql: ratio("defuse_stops", "defuse_starts"), fmt: "pct", desc: "Defuse attempts that were stopped (taps, fakes, or getting shot off the spike).", higherIsBetter: false },
  { key: "atk_elim_share", label: "Attack wins by elimination", short: "ATK elim", sql: ratio("win_elim_atk", "atk_wins"), fmt: "pct", desc: "Share of attack round wins that ended by wiping the defenders." },
  { key: "atk_boom_share", label: "Attack wins by detonation", short: "ATK boom", sql: ratio("win_boom_atk", "atk_wins"), fmt: "pct", desc: "Share of attack round wins that ended with the spike exploding." },
  { key: "def_elim_share", label: "Defense wins by elimination", short: "DEF elim", sql: ratio("win_elim_def", "def_wins"), fmt: "pct", desc: "Share of defense round wins by wiping the attackers." },
  { key: "def_defuse_share", label: "Defense wins by defuse", short: "DEF defuse", sql: ratio("win_defuse_def", "def_wins"), fmt: "pct", desc: "Share of defense round wins ending in a defuse." },
  { key: "def_time_share", label: "Defense wins on time", short: "DEF time", sql: ratio("win_time_def", "def_wins"), fmt: "pct", desc: "Share of defense round wins where the timer ran out without a plant." },
  { key: "flawless", label: "Flawless rounds", short: "Flawless%", sql: ratio("flawless", "rounds - lost_rounds"), fmt: "pct", desc: "Won rounds where all five players survived." },
  { key: "saves", label: "Survivors per lost round", short: "Saves", sql: ratio("survivors_in_losses", "lost_rounds"), fmt: "dec2", desc: "Average players alive at the end of lost rounds — a proxy for save discipline." },
  { key: "orb_share", label: "Ultimate orb control", short: "Orb%", sql: ratio("orbs", "orbs + opp_orbs"), fmt: "pct", desc: "Share of all ultimate orbs on the map picked up by this team." },
  { key: "orbs_pr", label: "Orbs per round", short: "Orbs/R", sql: ratio("orbs", "rounds"), fmt: "dec2", desc: "Ultimate orbs collected per round." },
  { key: "comebacks", label: "Comebacks", short: "Comebacks", sql: "comebacks", fmt: "int", desc: "Maps won after trailing by 5+ rounds." },
  { key: "blown", label: "Blown leads", short: "Blown", sql: "blown_leads", fmt: "int", desc: "Maps lost after leading by 5+ rounds.", higherIsBetter: false },
  { key: "ot_wr", label: "Overtime win rate", short: "OT W%", sql: ratio("ot_wins", "overtime"), fmt: "pct", desc: "Maps won among maps that went to overtime." },
  { key: "team_adr", label: "Team damage per round", short: "Team ADR", sql: ratio("damage", "rounds"), fmt: "dec1", desc: "Total team damage dealt per round." },
  { key: "dmg_ratio", label: "Damage ratio", short: "Dmg ratio", sql: ratio("damage", "damage_taken"), fmt: "dec2", desc: "Damage dealt / damage taken." },
  vlr({ key: "eco_wr", label: "Eco round win rate", short: "Eco%", sql: ratio("vlr_eco_wins", "vlr_eco_rounds"), fmt: "pct", desc: "Rounds won on an eco (loadout under 5k), pistol rounds excluded." }),
  vlr({ key: "semieco_wr", label: "Semi-eco win rate", short: "Semi-eco%", sql: ratio("vlr_semieco_wins", "vlr_semieco_rounds"), fmt: "pct", desc: "Rounds won on a semi-eco (5k–10k loadout)." }),
  vlr({ key: "semibuy_wr", label: "Semi-buy win rate", short: "Semi-buy%", sql: ratio("vlr_semibuy_wins", "vlr_semibuy_rounds"), fmt: "pct", desc: "Rounds won on a semi-buy (10k–20k loadout)." }),
  vlr({ key: "fullbuy_wr", label: "Full-buy win rate", short: "Full-buy%", sql: ratio("vlr_fullbuy_wins", "vlr_fullbuy_rounds"), fmt: "pct", desc: "Rounds won on a full buy (20k+ loadout)." }),
  vlr({ key: "antieco_wr", label: "Anti-eco win rate", short: "Anti-eco%", sql: ratio("vlr_antieco_wins", "vlr_antieco_rounds"), fmt: "pct", desc: "Rounds won with a semi-buy or full buy against an opponent on an eco." }),
] satisfies Metric[];

export const PLAYER_METRICS = [
  vlr({ key: "rating", label: "Rating", short: "Rating", sql: ratio("vlr_rating", "vlr_rating_rounds"), fmt: "dec2", desc: "VLR.gg rating per map, averaged weighted by rounds." }),
  vlr({ key: "acs", label: "Average combat score", short: "ACS", sql: ratio("vlr_acs", "vlr_acs_rounds"), fmt: "int", desc: "Riot's combat score per round (damage, kills by enemies left alive, multi-kills, assists)." }),
  vlr({ key: "kast", label: "KAST", short: "KAST%", sql: ratio("vlr_kast", "vlr_kast_rounds"), fmt: "pct", desc: "Rounds with a kill, assist, survival or trade." }),
  { key: "kpr", label: "Kills per round", short: "KPR", sql: ratio("kills", "rounds"), fmt: "dec2", desc: "Kills / rounds." },
  { key: "adr", label: "Damage per round", short: "ADR", sql: ratio("damage", "rounds"), fmt: "dec1", desc: "Damage dealt / rounds." },
  { key: "dtr", label: "Damage taken per round", short: "DTR", sql: ratio("damage_taken", "rounds"), fmt: "dec1", desc: "Damage received / rounds. Lower usually means better positioning or a passive role.", higherIsBetter: false },
  { key: "dmg_ratio", label: "Damage ratio", short: "Dmg ±", sql: ratio("damage", "damage_taken"), fmt: "dec2", desc: "Damage dealt / damage taken." },
  { key: "surv", label: "Survival rate", short: "Surv%", sql: ratio("survived", "rounds"), fmt: "pct", desc: "Rounds the player was alive at round end." },
  { key: "kas", label: "KAS", short: "KAS%", sql: ratio("kas_rounds", "rounds"), fmt: "pct", desc: "Rounds with a kill, assist, or survival. GRID has no kill order, so trades are missing: this is KAST without the T (see KAST for VCT matches)." },
  { key: "fk_pr", label: "First kills per round", short: "FK/R", sql: ratio("fk", "rounds"), fmt: "dec2", desc: "Opening kills / rounds." },
  { key: "fk_conv", label: "Round win rate after own first kill", short: "FK→W", sql: ratio("fk_wins", "fk"), fmt: "pct", desc: "How often the team converted the round when this player got the opening kill." },
  { key: "atk_kpr", label: "Attack kills per round", short: "ATK KPR", sql: ratio("atk_kills", "atk_rounds"), fmt: "dec2", desc: "Kills per attack round." },
  { key: "def_kpr", label: "Defense kills per round", short: "DEF KPR", sql: ratio("def_kills", "def_rounds"), fmt: "dec2", desc: "Kills per defense round." },
  { key: "atk_adr", label: "Attack damage per round", short: "ATK ADR", sql: ratio("atk_damage", "atk_rounds"), fmt: "dec1", desc: "Damage per attack round." },
  { key: "def_adr", label: "Defense damage per round", short: "DEF ADR", sql: ratio("def_damage", "def_rounds"), fmt: "dec1", desc: "Damage per defense round." },
  { key: "atk_surv", label: "Attack survival rate", short: "ATK surv", sql: ratio("atk_survived", "atk_rounds"), fmt: "pct", desc: "Alive at the end of attack rounds." },
  { key: "def_surv", label: "Defense survival rate", short: "DEF surv", sql: ratio("def_survived", "def_rounds"), fmt: "pct", desc: "Alive at the end of defense rounds." },
  { key: "side_delta", label: "Attack − defense KPR", short: "Side Δ", sql: `(${ratio("atk_kills", "atk_rounds")} - ${ratio("def_kills", "def_rounds")})`, fmt: "dec2", desc: "Positive = more impactful on attack." },
  { key: "mk_rate", label: "Multi-kill round rate", short: "MK%", sql: ratio("mk2 + mk3 + mk4 + mk5", "rounds"), fmt: "pct", desc: "Rounds with 2+ kills." },
  { key: "mk3_rate", label: "3K+ round rate", short: "3K+%", sql: ratio("mk3 + mk4 + mk5", "rounds"), fmt: "pct", desc: "Rounds with 3+ kills." },
  { key: "pistol_kpr", label: "Pistol kills per round", short: "Pistol KPR", sql: ratio("pistol_kills", "pistol_rounds"), fmt: "dec2", desc: "Kills per pistol round (1 and 13)." },
  { key: "pistol_surv", label: "Pistol survival rate", short: "Pistol surv", sql: ratio("pistol_survived", "pistol_rounds"), fmt: "pct", desc: "Alive at the end of pistol rounds." },
  { key: "hs", label: "Headshot kills", short: "HS%", sql: ratio("headshots", "kills"), fmt: "pct", desc: "GRID 'headshots' / kills." },
  vlr({ key: "atk_rating", label: "Attack rating", short: "ATK Rtg", sql: ratio("vlr_atk_rating", "vlr_atk_rounds"), fmt: "dec2", desc: "VLR.gg rating on attack halves." }),
  vlr({ key: "def_rating", label: "Defense rating", short: "DEF Rtg", sql: ratio("vlr_def_rating", "vlr_def_rounds"), fmt: "dec2", desc: "VLR.gg rating on defense halves." }),
  vlr({ key: "clutch_rate", label: "Clutches per 100 rounds", short: "CL/100", sql: `(100.0 * vlr_clutches / NULLIF(vlr_perf_rounds, 0))`, fmt: "dec1", desc: "Clutches won (1vX) per 100 rounds." }),
  vlr({ key: "clutches", label: "Clutches won", short: "Clutches", sql: "vlr_clutches", fmt: "int", desc: "1v1 to 1v5 rounds won as the last player alive." }),
  vlr({ key: "econ", label: "Econ rating", short: "Econ", sql: ratio("vlr_econ", "vlr_perf_rounds"), fmt: "int", desc: "Damage per 1,000 credits spent." }),
] satisfies Metric[];

export const MAP_METRICS = [
  { key: "atk_rw", label: "Attacker round win rate", short: "ATK RW%", sql: ratio("atk_wins", "atk_rounds"), fmt: "pct", desc: "Share of all rounds won by the attacking side." },
  { key: "pistol_atk_wr", label: "Attacker pistol win rate", short: "ATK pistol%", sql: ratio("pistol_atk_wins", "pistol_atk_rounds"), fmt: "pct", desc: "Pistol rounds won by the attacking side." },
  { key: "plant_rate", label: "Plant rate", short: "Plant%", sql: ratio("plants", "atk_rounds"), fmt: "pct", desc: "Rounds with a spike plant." },
  { key: "postplant", label: "Post-plant win rate", short: "Post-plant%", sql: ratio("plant_wins", "plants"), fmt: "pct", desc: "Attacker win rate once the spike is down." },
  { key: "fk_conv", label: "Win rate after first kill", short: "FK→W", sql: ratio("fk_wins", "fk_rounds"), fmt: "pct", desc: "How decisive the opening duel is on this map." },
  { key: "conv", label: "Post-pistol conversion", short: "Conv%", sql: ratio("conv_wins", "conv_opps"), fmt: "pct", desc: "Pistol winners also winning the next two rounds." },
  { key: "ot_rate", label: "Overtime rate", short: "OT%", sql: ratio("ot_maps", "maps"), fmt: "pct", desc: "Maps that went to overtime." },
  { key: "avg_rounds", label: "Rounds per map", short: "Rounds", sql: ratio("rounds", "2.0 * maps"), fmt: "dec1", desc: "Average map length in rounds." },
  { key: "time_share", label: "Rounds decided on time", short: "Time%", sql: ratio("win_time_def", "atk_rounds"), fmt: "pct", desc: "Rounds that ended on the timer without a plant." },
  { key: "boom_share", label: "Rounds decided by detonation", short: "Boom%", sql: ratio("win_boom_atk", "atk_rounds"), fmt: "pct", desc: "Rounds that ended with the spike exploding." },
  { key: "defuse_share", label: "Rounds decided by defuse", short: "Defuse%", sql: ratio("win_defuse_def", "atk_rounds"), fmt: "pct", desc: "Rounds that ended in a defuse." },
  { key: "flawless", label: "Flawless rounds", short: "Flawless%", sql: ratio("flawless", "atk_rounds"), fmt: "pct", desc: "Rounds won without losing a player." },
  vlr({ key: "eco_wr", label: "Eco round win rate", short: "Eco%", sql: ratio("vlr_eco_wins", "vlr_eco_rounds"), fmt: "pct", desc: "Rounds won by the team on an eco (under 5k), pistols excluded." }),
  vlr({ key: "antieco_wr", label: "Anti-eco win rate", short: "Anti-eco%", sql: ratio("vlr_antieco_wins", "vlr_antieco_rounds"), fmt: "pct", desc: "Rounds won with a semi-buy or full buy against an eco." }),
] satisfies Metric[];

export type TeamMetricKey = (typeof TEAM_METRICS)[number]["key"];
export type PlayerMetricKey = (typeof PLAYER_METRICS)[number]["key"];
export type MapMetricKey = (typeof MAP_METRICS)[number]["key"];

export const metricSelect = (ms: readonly Metric[]) => ms.map((m) => `${m.sql} AS ${m.key}`).join(", ");

export const byKey = <M extends Metric>(ms: readonly M[]) =>
  Object.fromEntries(ms.map((m) => [m.key, m])) as Record<M["key"], M>;
