CREATE TABLE codex_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  stage INTEGER NOT NULL,
  agent TEXT NOT NULL,
  status TEXT NOT NULL,
  input_digest TEXT NOT NULL,
  input_snapshot TEXT NOT NULL,
  claim_token TEXT,
  lease_until INTEGER,
  progress TEXT NOT NULL DEFAULT '',
  artifacts TEXT NOT NULL DEFAULT '[]',
  result_digest TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX codex_tasks_owner ON codex_tasks (owner, updated_at);
--> statement-breakpoint
CREATE UNIQUE INDEX codex_tasks_pending ON codex_tasks (owner, episode_id, stage)
  WHERE status IN ('queued', 'running');
