CREATE TABLE IF NOT EXISTS audio_assets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  artist TEXT,
  category TEXT NOT NULL DEFAULT 'original',
  object_key TEXT NOT NULL UNIQUE,
  format TEXT,
  duration_ms INTEGER,
  bytes INTEGER,
  parent_asset_id TEXT REFERENCES audio_assets(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_audio_assets_title ON audio_assets(title);
CREATE INDEX IF NOT EXISTS idx_audio_assets_artist ON audio_assets(artist);
CREATE INDEX IF NOT EXISTS idx_audio_assets_parent ON audio_assets(parent_asset_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  manifest_object_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_events(created_at);
