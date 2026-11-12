CREATE TABLE reference_profiles (
 id TEXT NOT NULL, owner TEXT NOT NULL, import_hash TEXT NOT NULL,
 data TEXT NOT NULL, source_hash TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
 PRIMARY KEY(owner,id), UNIQUE(owner,import_hash)
);
--> statement-breakpoint
CREATE TABLE reference_jobs (
 id TEXT PRIMARY KEY NOT NULL, owner TEXT NOT NULL, reference_id TEXT NOT NULL,
 status TEXT NOT NULL, source_hash TEXT NOT NULL, snapshot TEXT NOT NULL,
 claim_token TEXT, lease_until INTEGER, progress TEXT NOT NULL DEFAULT '',
 result_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX reference_jobs_owner ON reference_jobs(owner,created_at);
--> statement-breakpoint
CREATE UNIQUE INDEX reference_jobs_active ON reference_jobs(owner,reference_id,source_hash) WHERE status IN ('queued','running');
