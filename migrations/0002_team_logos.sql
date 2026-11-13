-- Team logos from GRID Central Data (Team.logoUrl), processed once by the importer into small
-- light-mode and dark-mode PNGs (a contrasting tile is added where the logo is hard to see).
ALTER TABLE teams ADD COLUMN logo_url TEXT;
ALTER TABLE teams ADD COLUMN logo_light BLOB;
ALTER TABLE teams ADD COLUMN logo_dark BLOB;
-- NULL = not processed yet, 'ok', 'none' (GRID has no logo), 'error' (retried after a week)
ALTER TABLE teams ADD COLUMN logo_status TEXT;
ALTER TABLE teams ADD COLUMN logo_checked_at TEXT;
CREATE INDEX teams_logo_queue ON teams(logo_status);
