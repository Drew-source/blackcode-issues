-- Add sync fields to issues table
ALTER TABLE issues ADD COLUMN IF NOT EXISTS internal_only BOOLEAN DEFAULT false;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS taskhive_task_id INTEGER;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS taskhive_sync_status VARCHAR(20) DEFAULT 'pending';

-- Create sync queue table
CREATE TABLE IF NOT EXISTS sync_queue (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 10,
    next_retry_at TIMESTAMPTZ DEFAULT NOW(),
    idempotency_key VARCHAR(255) UNIQUE,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_sync_queue_issue ON sync_queue(issue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_issues_sync_status ON issues(taskhive_sync_status);
