-- 003_companion_work_results.sql
-- Durable store for companion work results.
--
-- Cloudflare Workers are short-lived isolates: an in-isolate Map cannot
-- survive the request boundary, and the isolate that receives the
-- companion's result POST is rarely the same one the browser polls from.
-- Storing results here makes them reliable regardless of which isolate
-- handles each request.
--
-- Commands longer than the Worker request budget (~30s) still need async
-- delivery. That is the Durable Object path, documented in
-- worker/api.ts. This table handles the synchronous case.

CREATE TABLE IF NOT EXISTS companion_work_results (
    id            TEXT PRIMARY KEY,
    device_id     TEXT NOT NULL,
    run_id        TEXT NOT NULL,
    conversation_id TEXT NOT NULL,
    command       TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',  -- pending | completed | failed | timed_out
    exit_code     INTEGER,
    output        TEXT,
    truncated     BOOLEAN NOT NULL DEFAULT FALSE,
    error_message TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS companion_work_results_pending_idx
    ON companion_work_results (device_id, created_at)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS companion_work_results_completed_idx
    ON companion_work_results (id, completed_at);