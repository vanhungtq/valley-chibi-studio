CREATE TABLE library_uploads (
  id TEXT PRIMARY KEY NOT NULL,
  owner TEXT NOT NULL,
  identity TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  metadata TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX library_uploads_owner ON library_uploads (owner, expires_at);
