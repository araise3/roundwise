-- Team logos now come from Liquipedia first (separate light/dark icons), with GRID as the fallback.
ALTER TABLE teams ADD COLUMN logo_source TEXT;  -- 'liquipedia' | 'grid'
ALTER TABLE teams ADD COLUMN logo_ref TEXT;     -- Liquipedia file name(s) used
-- Re-process every team; existing images keep being served until replaced.
UPDATE teams SET logo_source = CASE WHEN logo_status = 'ok' THEN 'grid' END, logo_status = NULL;
