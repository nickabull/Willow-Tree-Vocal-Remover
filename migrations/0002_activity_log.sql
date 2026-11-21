-- Detailed, append-only user activity log.
-- Identity is populated ONLY after the API verifies a trusted Firebase session.
-- Until then, the shared admin token must not be attributed to an individual.
CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor_uid TEXT,
  actor_email TEXT,
  actor_display_name TEXT,
  actor_type TEXT NOT NULL DEFAULT 'unknown',
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  project_id TEXT,
  session_id TEXT,
  request_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'success',
  source TEXT NOT NULL DEFAULT 'web',
  before_json TEXT,
  after_json TEXT,
  detail_json TEXT,
  error_code TEXT
);
CREATE INDEX IF NOT EXISTS activity_log_occurred_at ON activity_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_actor_time ON activity_log(actor_uid, occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_resource_time ON activity_log(resource_type, resource_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_action_time ON activity_log(action, occurred_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_request_id ON activity_log(request_id);
