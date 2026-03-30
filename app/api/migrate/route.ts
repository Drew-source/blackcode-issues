import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

// POST /api/migrate - Run database migrations
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only allow admins to run migrations
    if (session.user.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const migrations: string[] = []

    // Add start_date and due_date columns to issues table if they don't exist
    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS start_date DATE`
      migrations.push('Added start_date column to issues')
    } catch (e) {
      // Column might already exist
    }

    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_date DATE`
      migrations.push('Added due_date column to issues')
    } catch (e) {
      // Column might already exist  
    }

    // Add estimated_hours column for better time tracking
    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(5,1)`
      migrations.push('Added estimated_hours column to issues')
    } catch (e) {
      // Column might already exist
    }

    // Sync fields for TaskHive integration
    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS internal_only BOOLEAN DEFAULT false`
      migrations.push('Added internal_only column to issues')
    } catch (e) {
      // Column might already exist
    }

    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS taskhive_task_id INTEGER`
      migrations.push('Added taskhive_task_id column to issues')
    } catch (e) {
      // Column might already exist
    }

    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS taskhive_sync_status VARCHAR(20) DEFAULT 'pending'`
      migrations.push('Added taskhive_sync_status column to issues')
    } catch (e) {
      // Column might already exist
    }

    // Create sync queue table
    try {
      await sql`
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
        )
      `
      migrations.push('Created sync_queue table')
    } catch (e) {
      // Table might already exist
    }

    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, next_retry_at)`
      await sql`CREATE INDEX IF NOT EXISTS idx_sync_queue_issue ON sync_queue(issue_id, created_at)`
      await sql`CREATE INDEX IF NOT EXISTS idx_issues_sync_status ON issues(taskhive_sync_status)`
      migrations.push('Created sync queue indexes')
    } catch (e) {
      // Indexes might already exist
    }

    // Phase 2: TaskHive deliverables table
    try {
      await sql`
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
        )
      `
      migrations.push('Created taskhive_deliverables table')
    } catch (e) {
      // Table might already exist
    }

    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_taskhive_deliverables_issue ON taskhive_deliverables(issue_id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_taskhive_deliverables_status ON taskhive_deliverables(status)`
      migrations.push('Created taskhive_deliverables indexes')
    } catch (e) {
      // Indexes might already exist
    }

    try {
      await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS taskhive_parent_task_id INTEGER`
      migrations.push('Added taskhive_parent_task_id column to projects')
    } catch (e) {
      // Column might already exist
    }

    // Phase 3: API keys table for agent authentication
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS api_keys (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          key_hash TEXT NOT NULL,
          key_prefix VARCHAR(20) NOT NULL,
          name VARCHAR(100) NOT NULL DEFAULT 'default',
          is_active BOOLEAN NOT NULL DEFAULT true,
          last_used_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `
      migrations.push('Created api_keys table')
    } catch (e) {
      // Table might already exist
    }

    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix)`
      await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash)`
      migrations.push('Created api_keys indexes')
    } catch (e) {
      // Indexes might already exist
    }

    // Phase 4: Bounty/payment fields on issues for TaskHive sub-issue sync
    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2)`
      migrations.push('Added payment_amount column to issues')
    } catch (e) {
      // Column might already exist
    }

    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS payment_currency VARCHAR(10)`
      migrations.push('Added payment_currency column to issues')
    } catch (e) {
      // Column might already exist
    }

    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS payment_details TEXT`
      migrations.push('Added payment_details column to issues')
    } catch (e) {
      // Column might already exist
    }

    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS requirements TEXT`
      migrations.push('Added requirements column to issues')
    } catch (e) {
      // Column might already exist
    }

    return NextResponse.json({
      success: true,
      migrations,
    })
  } catch (error) {
    console.error('Migration failed:', error)
    return NextResponse.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    )
  }
}
