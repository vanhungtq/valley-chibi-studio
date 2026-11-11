CREATE TABLE studio_state (
  owner TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE run_locks (
  owner TEXT NOT NULL,
  episode_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (owner, episode_id)
);
