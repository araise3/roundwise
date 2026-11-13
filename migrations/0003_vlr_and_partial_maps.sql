-- 1) GRID sometimes reports Summit by its internal codename "plummet".
UPDATE games SET map = 'summit' WHERE map = 'plummet';
UPDATE game_teams SET map = 'summit' WHERE map = 'plummet';
UPDATE game_players SET map = 'summit' WHERE map = 'plummet';
DELETE FROM agg_maps WHERE map = 'plummet';

-- 2) Incomplete maps: GRID data that stops before the map ended (e.g. 12-6). They stay visible on match pages
--    but are left out of every stat. Set at import (final score not a valid VALORANT result, or it disagrees
--    with vlr.gg's final score).
ALTER TABLE games ADD COLUMN partial INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_teams ADD COLUMN partial INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN partial INTEGER NOT NULL DEFAULT 0;
UPDATE games SET partial = 1 WHERE id IN (
  SELECT game_id FROM game_teams GROUP BY game_id
  HAVING NOT (MAX(score) >= 13 AND MAX(score) - MIN(score) >= 2 AND (MAX(score) = 13 OR MAX(score) - MIN(score) = 2)));
UPDATE game_teams SET partial = 1 WHERE game_id IN (SELECT id FROM games WHERE partial = 1);
UPDATE game_players SET partial = 1 WHERE game_id IN (SELECT id FROM games WHERE partial = 1);

-- 3) vlr.gg stats (VCT only), loaded by scripts/import-vlr.mjs. Stored as summable columns next to the GRID
--    stats; each stat has its own rounds column because vlr.gg is missing some values on some maps.
--    Per player per map (game_players) and in agg_players: weighted sums (value x rounds) + counts.
ALTER TABLE game_players ADD COLUMN vlr_rating_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_rating REAL NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_acs_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_acs REAL NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_kast_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_kast REAL NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_perf_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_clutches INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_econ REAL NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_plants INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_defuses INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_atk_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_atk_rating REAL NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_def_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_players ADD COLUMN vlr_def_rating REAL NOT NULL DEFAULT 0;

ALTER TABLE agg_players ADD COLUMN vlr_rating_rounds INTEGER;
ALTER TABLE agg_players ADD COLUMN vlr_rating REAL;
ALTER TABLE agg_players ADD COLUMN vlr_acs_rounds INTEGER;
ALTER TABLE agg_players ADD COLUMN vlr_acs REAL;
ALTER TABLE agg_players ADD COLUMN vlr_kast_rounds INTEGER;
ALTER TABLE agg_players ADD COLUMN vlr_kast REAL;
ALTER TABLE agg_players ADD COLUMN vlr_perf_rounds INTEGER;
ALTER TABLE agg_players ADD COLUMN vlr_clutches INTEGER;
ALTER TABLE agg_players ADD COLUMN vlr_econ REAL;
ALTER TABLE agg_players ADD COLUMN vlr_plants INTEGER;
ALTER TABLE agg_players ADD COLUMN vlr_defuses INTEGER;
ALTER TABLE agg_players ADD COLUMN vlr_atk_rounds INTEGER;
ALTER TABLE agg_players ADD COLUMN vlr_atk_rating REAL;
ALTER TABLE agg_players ADD COLUMN vlr_def_rounds INTEGER;
ALTER TABLE agg_players ADD COLUMN vlr_def_rating REAL;

--    Per team per map: rounds and wins by own buy (pistol rounds excluded), and anti-eco rounds
--    (own semi-buy or full buy vs. an opponent eco).
ALTER TABLE game_teams ADD COLUMN vlr_eco_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_teams ADD COLUMN vlr_eco_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_teams ADD COLUMN vlr_semieco_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_teams ADD COLUMN vlr_semieco_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_teams ADD COLUMN vlr_semibuy_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_teams ADD COLUMN vlr_semibuy_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_teams ADD COLUMN vlr_fullbuy_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_teams ADD COLUMN vlr_fullbuy_wins INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_teams ADD COLUMN vlr_antieco_rounds INTEGER NOT NULL DEFAULT 0;
ALTER TABLE game_teams ADD COLUMN vlr_antieco_wins INTEGER NOT NULL DEFAULT 0;

ALTER TABLE agg_teams ADD COLUMN vlr_eco_rounds INTEGER;
ALTER TABLE agg_teams ADD COLUMN vlr_eco_wins INTEGER;
ALTER TABLE agg_teams ADD COLUMN vlr_semieco_rounds INTEGER;
ALTER TABLE agg_teams ADD COLUMN vlr_semieco_wins INTEGER;
ALTER TABLE agg_teams ADD COLUMN vlr_semibuy_rounds INTEGER;
ALTER TABLE agg_teams ADD COLUMN vlr_semibuy_wins INTEGER;
ALTER TABLE agg_teams ADD COLUMN vlr_fullbuy_rounds INTEGER;
ALTER TABLE agg_teams ADD COLUMN vlr_fullbuy_wins INTEGER;
ALTER TABLE agg_teams ADD COLUMN vlr_antieco_rounds INTEGER;
ALTER TABLE agg_teams ADD COLUMN vlr_antieco_wins INTEGER;

ALTER TABLE agg_maps ADD COLUMN vlr_eco_rounds INTEGER;
ALTER TABLE agg_maps ADD COLUMN vlr_eco_wins INTEGER;
ALTER TABLE agg_maps ADD COLUMN vlr_semieco_rounds INTEGER;
ALTER TABLE agg_maps ADD COLUMN vlr_semieco_wins INTEGER;
ALTER TABLE agg_maps ADD COLUMN vlr_semibuy_rounds INTEGER;
ALTER TABLE agg_maps ADD COLUMN vlr_semibuy_wins INTEGER;
ALTER TABLE agg_maps ADD COLUMN vlr_fullbuy_rounds INTEGER;
ALTER TABLE agg_maps ADD COLUMN vlr_fullbuy_wins INTEGER;
ALTER TABLE agg_maps ADD COLUMN vlr_antieco_rounds INTEGER;
ALTER TABLE agg_maps ADD COLUMN vlr_antieco_wins INTEGER;

-- Which vlr.gg match a series was matched to.
CREATE TABLE vlr_series (
  series_id TEXT PRIMARY KEY,
  vlr_match_id INTEGER NOT NULL,
  url TEXT
);

-- vlr.gg's map list (played order, final scores in the series' team1/team2 orientation). Covers maps GRID is
-- missing (game_id NULL) and gives the real final score of maps GRID has only partly.
CREATE TABLE vlr_maps (
  series_id TEXT NOT NULL,
  map_index INTEGER NOT NULL,
  map TEXT NOT NULL,
  team1_score INTEGER,
  team2_score INTEGER,
  game_id TEXT,
  PRIMARY KEY (series_id, map_index)
);

-- Map veto per series (team_id NULL for the decider).
CREATE TABLE vlr_vetoes (
  series_id TEXT NOT NULL,
  order_num INTEGER NOT NULL,
  team_id TEXT,
  action TEXT NOT NULL,   -- ban | pick | decider
  map TEXT NOT NULL,
  PRIMARY KEY (series_id, order_num)
);
CREATE INDEX vlr_vetoes_team ON vlr_vetoes(team_id);
