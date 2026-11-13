-- Roundwise schema. Stat column lists must match src/stats/columns.ts.

CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT
);

-- Team logos are deliberately not stored: the ToS grants no rights to team marks (9.3).
CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  color TEXT
);

CREATE TABLE players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  last_team_id TEXT,
  last_seen TEXT
);

CREATE TABLE series (
  id TEXT PRIMARY KEY,
  tournament_id TEXT,
  start_time TEXT NOT NULL,
  format TEXT,
  team1_id TEXT,
  team2_id TEXT,
  team1_score INTEGER,
  team2_score INTEGER,
  winner_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | done | skipped
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  note TEXT,
  ingested_at TEXT
);
CREATE INDEX series_queue ON series(status, start_time);
CREATE INDEX series_done ON series(status, start_time DESC) WHERE status = 'done';

CREATE TABLE games (
  id TEXT PRIMARY KEY,
  series_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  map TEXT NOT NULL,
  start_time TEXT NOT NULL,
  winner_id TEXT,
  loser_id TEXT,
  rounds INTEGER NOT NULL,
  overtime INTEGER NOT NULL
);
CREATE INDEX games_series ON games(series_id);

-- One row per round of a map.
CREATE TABLE rounds (
  game_id TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  winner_id TEXT NOT NULL,
  atk_id TEXT NOT NULL,
  def_id TEXT NOT NULL,
  win_type TEXT,
  fk_team_id TEXT,
  planted INTEGER NOT NULL,
  exploded INTEGER NOT NULL,
  defused INTEGER NOT NULL,
  atk_alive INTEGER NOT NULL,
  def_alive INTEGER NOT NULL,
  atk_kills INTEGER NOT NULL,
  def_kills INTEGER NOT NULL,
  PRIMARY KEY (game_id, round_no)
);

CREATE TABLE game_teams (
  game_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  map TEXT NOT NULL,
  start_time TEXT NOT NULL,
  won INTEGER NOT NULL,
  score INTEGER NOT NULL,
  opp_score INTEGER NOT NULL,
  start_side TEXT,
  max_lead INTEGER NOT NULL,
  max_deficit INTEGER NOT NULL,
  best_streak INTEGER NOT NULL,
  rounds INTEGER NOT NULL,
  atk_rounds INTEGER NOT NULL, atk_wins INTEGER NOT NULL,
  def_rounds INTEGER NOT NULL, def_wins INTEGER NOT NULL,
  pistol_rounds INTEGER NOT NULL, pistol_wins INTEGER NOT NULL,
  pistol_atk_rounds INTEGER NOT NULL, pistol_atk_wins INTEGER NOT NULL,
  conv_opps INTEGER NOT NULL, conv_wins INTEGER NOT NULL,
  break_opps INTEGER NOT NULL, break_wins INTEGER NOT NULL,
  fk_rounds INTEGER NOT NULL, fk_wins INTEGER NOT NULL,
  fd_rounds INTEGER NOT NULL, fd_wins INTEGER NOT NULL,
  win_elim_atk INTEGER NOT NULL, win_boom_atk INTEGER NOT NULL,
  win_elim_def INTEGER NOT NULL, win_defuse_def INTEGER NOT NULL, win_time_def INTEGER NOT NULL,
  plants INTEGER NOT NULL, plant_wins INTEGER NOT NULL,
  opp_plants INTEGER NOT NULL, retakes INTEGER NOT NULL, defuses INTEGER NOT NULL,
  defuse_starts INTEGER NOT NULL, defuse_stops INTEGER NOT NULL, defuse_halfway INTEGER NOT NULL,
  orbs INTEGER NOT NULL, opp_orbs INTEGER NOT NULL,
  flawless INTEGER NOT NULL, lost_rounds INTEGER NOT NULL, survivors_in_losses INTEGER NOT NULL,
  overtime INTEGER NOT NULL,
  kills INTEGER NOT NULL, deaths INTEGER NOT NULL,
  damage INTEGER NOT NULL, damage_taken INTEGER NOT NULL, headshots INTEGER NOT NULL,
  PRIMARY KEY (game_id, team_id)
);
CREATE INDEX game_teams_team ON game_teams(team_id, start_time);
CREATE INDEX game_teams_map ON game_teams(map, start_time);

CREATE TABLE game_players (
  game_id TEXT NOT NULL,
  player_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  opponent_id TEXT NOT NULL,
  series_id TEXT NOT NULL,
  map TEXT NOT NULL,
  start_time TEXT NOT NULL,
  won INTEGER NOT NULL,
  agent TEXT,
  weapons TEXT,              -- JSON object {weapon: kills}
  rounds INTEGER NOT NULL, kills INTEGER NOT NULL, deaths INTEGER NOT NULL, assists INTEGER NOT NULL,
  headshots INTEGER NOT NULL, damage INTEGER NOT NULL, damage_taken INTEGER NOT NULL,
  atk_rounds INTEGER NOT NULL, atk_kills INTEGER NOT NULL, atk_deaths INTEGER NOT NULL,
  atk_damage INTEGER NOT NULL, atk_survived INTEGER NOT NULL,
  def_rounds INTEGER NOT NULL, def_kills INTEGER NOT NULL, def_deaths INTEGER NOT NULL,
  def_damage INTEGER NOT NULL, def_survived INTEGER NOT NULL,
  survived INTEGER NOT NULL, kas_rounds INTEGER NOT NULL, fk INTEGER NOT NULL, fk_wins INTEGER NOT NULL,
  mk2 INTEGER NOT NULL, mk3 INTEGER NOT NULL, mk4 INTEGER NOT NULL, mk5 INTEGER NOT NULL,
  pistol_rounds INTEGER NOT NULL, pistol_kills INTEGER NOT NULL, pistol_survived INTEGER NOT NULL,
  PRIMARY KEY (game_id, player_id)
);
CREATE INDEX game_players_player ON game_players(player_id, start_time);

-- Nightly-rebuilt aggregates for cross-entity pages (leaderboards, maps) so page views stay cheap.
CREATE TABLE agg_teams (
  period TEXT NOT NULL, team_id TEXT NOT NULL,
  maps INTEGER NOT NULL, map_wins INTEGER NOT NULL,
  comebacks INTEGER NOT NULL, blown_leads INTEGER NOT NULL, ot_wins INTEGER NOT NULL,
  rounds INTEGER, atk_rounds INTEGER, atk_wins INTEGER, def_rounds INTEGER, def_wins INTEGER,
  pistol_rounds INTEGER, pistol_wins INTEGER, pistol_atk_rounds INTEGER, pistol_atk_wins INTEGER,
  conv_opps INTEGER, conv_wins INTEGER, break_opps INTEGER, break_wins INTEGER,
  fk_rounds INTEGER, fk_wins INTEGER, fd_rounds INTEGER, fd_wins INTEGER,
  win_elim_atk INTEGER, win_boom_atk INTEGER, win_elim_def INTEGER, win_defuse_def INTEGER, win_time_def INTEGER,
  plants INTEGER, plant_wins INTEGER, opp_plants INTEGER, retakes INTEGER, defuses INTEGER,
  defuse_starts INTEGER, defuse_stops INTEGER, defuse_halfway INTEGER,
  orbs INTEGER, opp_orbs INTEGER,
  flawless INTEGER, lost_rounds INTEGER, survivors_in_losses INTEGER,
  overtime INTEGER,
  kills INTEGER, deaths INTEGER, damage INTEGER, damage_taken INTEGER, headshots INTEGER,
  PRIMARY KEY (period, team_id)
);

CREATE TABLE agg_players (
  period TEXT NOT NULL, player_id TEXT NOT NULL,
  maps INTEGER NOT NULL, map_wins INTEGER NOT NULL,
  rounds INTEGER, kills INTEGER, deaths INTEGER, assists INTEGER, headshots INTEGER, damage INTEGER, damage_taken INTEGER,
  atk_rounds INTEGER, atk_kills INTEGER, atk_deaths INTEGER, atk_damage INTEGER, atk_survived INTEGER,
  def_rounds INTEGER, def_kills INTEGER, def_deaths INTEGER, def_damage INTEGER, def_survived INTEGER,
  survived INTEGER, kas_rounds INTEGER, fk INTEGER, fk_wins INTEGER,
  mk2 INTEGER, mk3 INTEGER, mk4 INTEGER, mk5 INTEGER,
  pistol_rounds INTEGER, pistol_kills INTEGER, pistol_survived INTEGER,
  PRIMARY KEY (period, player_id)
);

CREATE TABLE agg_maps (
  period TEXT NOT NULL, map TEXT NOT NULL,
  maps INTEGER NOT NULL, ot_maps INTEGER NOT NULL,
  rounds INTEGER, atk_rounds INTEGER, atk_wins INTEGER, def_rounds INTEGER, def_wins INTEGER,
  pistol_rounds INTEGER, pistol_wins INTEGER, pistol_atk_rounds INTEGER, pistol_atk_wins INTEGER,
  conv_opps INTEGER, conv_wins INTEGER, break_opps INTEGER, break_wins INTEGER,
  fk_rounds INTEGER, fk_wins INTEGER, fd_rounds INTEGER, fd_wins INTEGER,
  win_elim_atk INTEGER, win_boom_atk INTEGER, win_elim_def INTEGER, win_defuse_def INTEGER, win_time_def INTEGER,
  plants INTEGER, plant_wins INTEGER, opp_plants INTEGER, retakes INTEGER, defuses INTEGER,
  defuse_starts INTEGER, defuse_stops INTEGER, defuse_halfway INTEGER,
  orbs INTEGER, opp_orbs INTEGER,
  flawless INTEGER, lost_rounds INTEGER, survivors_in_losses INTEGER,
  overtime INTEGER,
  kills INTEGER, deaths INTEGER, damage INTEGER, damage_taken INTEGER, headshots INTEGER,
  PRIMARY KEY (period, map)
);
