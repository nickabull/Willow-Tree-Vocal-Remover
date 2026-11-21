-- Queue conversion for every newly uploaded original.
-- Apply BEFORE deploying the worker code that inserts jobs.
CREATE TABLE IF NOT EXISTS normalisation_jobs (
  id TEXT PRIMARY KEY,
  original_asset_id TEXT NOT NULL UNIQUE REFERENCES audio_assets(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','complete','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  leased_until TEXT,
  last_error TEXT,
  derived_asset_id TEXT REFERENCES audio_assets(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_normalisation_jobs_claim ON normalisation_jobs(status,leased_until,created_at);
CREATE INDEX IF NOT EXISTS idx_normalisation_jobs_original ON normalisation_jobs(original_asset_id);
