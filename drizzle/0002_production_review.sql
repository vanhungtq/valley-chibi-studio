ALTER TABLE codex_tasks ADD COLUMN review TEXT NOT NULL DEFAULT '{}';
--> statement-breakpoint
ALTER TABLE codex_tasks ADD COLUMN review_digest TEXT;
--> statement-breakpoint
ALTER TABLE codex_tasks ADD COLUMN review_attempts INTEGER NOT NULL DEFAULT 0;
