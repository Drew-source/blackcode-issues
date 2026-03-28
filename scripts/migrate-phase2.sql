-- TaskHive deliverables table (stores submissions received via webhook)
CREATE TABLE IF NOT EXISTS taskhive_deliverables (
    id SERIAL PRIMARY KEY,
    issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    taskhive_deliverable_id INTEGER NOT NULL,
    taskhive_task_id INTEGER NOT NULL,
    worker_name TEXT,
    worker_rating DECIMAL(5,2),
    content TEXT NOT NULL,
    github_url TEXT,
    artifacts JSONB DEFAULT '[]',
    auto_review_result VARCHAR(20),
    auto_review_scores JSONB,
    auto_review_feedback TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
    revision_notes TEXT,
    reviewed_by INTEGER REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_taskhive_deliverables_issue ON taskhive_deliverables(issue_id);
CREATE INDEX IF NOT EXISTS idx_taskhive_deliverables_status ON taskhive_deliverables(status);

-- Add taskhive_parent_task_id to projects for project-to-task grouping
ALTER TABLE projects ADD COLUMN IF NOT EXISTS taskhive_parent_task_id INTEGER;
