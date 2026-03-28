import { sql } from './db'
import type { SyncQueueEntry } from '@/types'

// Insert a sync queue entry
export async function enqueueSyncEvent(
  issueId: number,
  eventType: string,
  payload: Record<string, unknown>
) {
  const idempotencyKey = `${issueId}:${eventType}:${Date.now()}`
  await sql`
    INSERT INTO sync_queue (issue_id, event_type, payload, idempotency_key, next_retry_at)
    VALUES (${issueId}, ${eventType}, ${JSON.stringify(payload)}, ${idempotencyKey}, NOW())
  `
}

// Get pending sync entries — enforces FIFO per issue_id
export async function getPendingSyncEntries(limit: number = 10): Promise<SyncQueueEntry[]> {
  const { rows } = await sql`
    SELECT sq.* FROM sync_queue sq
    WHERE sq.status = 'pending' AND sq.next_retry_at <= NOW()
    AND NOT EXISTS (
      SELECT 1 FROM sync_queue earlier
      WHERE earlier.issue_id = sq.issue_id
      AND earlier.created_at < sq.created_at
      AND earlier.status IN ('pending', 'processing')
      AND earlier.id != sq.id
    )
    ORDER BY sq.issue_id ASC, sq.created_at ASC
    LIMIT ${limit}
  `
  return rows as unknown as SyncQueueEntry[]
}

export async function markSyncProcessing(id: number) {
  await sql`UPDATE sync_queue SET status = 'processing' WHERE id = ${id}`
}

export async function markSyncCompleted(id: number) {
  await sql`UPDATE sync_queue SET status = 'completed', processed_at = NOW() WHERE id = ${id}`
}

export async function markSyncFailed(id: number, errorMessage: string) {
  const backoffSeconds = [5, 30, 120, 600, 1800, 3600]

  // Read current state first
  const { rows } = await sql`SELECT retry_count, max_retries FROM sync_queue WHERE id = ${id}`
  const currentRetry = (rows[0]?.retry_count as number) ?? 0
  const maxRetries = (rows[0]?.max_retries as number) ?? 10
  const newRetryCount = currentRetry + 1
  const newStatus = newRetryCount >= maxRetries ? 'dead' : 'pending'
  const backoff = backoffSeconds[Math.min(currentRetry, backoffSeconds.length - 1)]

  await sql`
    UPDATE sync_queue SET
      status = ${newStatus},
      retry_count = ${newRetryCount},
      error_message = ${errorMessage},
      next_retry_at = NOW() + INTERVAL '1 second' * ${backoff}
    WHERE id = ${id}
  `
}

export async function updateIssueSyncStatus(
  issueId: number,
  syncStatus: string,
  taskhiveTaskId?: number
) {
  if (taskhiveTaskId) {
    await sql`
      UPDATE issues SET taskhive_sync_status = ${syncStatus}, taskhive_task_id = ${taskhiveTaskId}
      WHERE id = ${issueId}
    `
  } else {
    await sql`
      UPDATE issues SET taskhive_sync_status = ${syncStatus}
      WHERE id = ${issueId}
    `
  }
}

// Process a single sync entry — calls TaskHive API
export async function processSyncEntry(entry: SyncQueueEntry) {
  const apiKey = process.env.TASKHIVE_SERVICE_ACCOUNT_KEY
  const baseUrl = process.env.TASKHIVE_API_URL || 'https://taskhive-pied.vercel.app'

  if (!apiKey) throw new Error('TASKHIVE_SERVICE_ACCOUNT_KEY not set')

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  }
  if (entry.idempotency_key) {
    headers['Idempotency-Key'] = entry.idempotency_key
  }

  if (entry.event_type === 'issue_created') {
    const res = await fetch(`${baseUrl}/api/v1/tasks`, {
      method: 'POST',
      headers,
      body: JSON.stringify(entry.payload),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`TaskHive API error: ${data.error || res.statusText}`)
    return data
  }

  if (entry.event_type === 'issue_updated') {
    const taskId = entry.payload.taskhive_task_id
    const res = await fetch(`${baseUrl}/api/v1/tasks/${taskId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(entry.payload.updates),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(`TaskHive API error: ${data.error || res.statusText}`)
    return data
  }

  throw new Error(`Unknown event type: ${entry.event_type}`)
}

// Process all pending sync entries
export async function processSyncQueue() {
  const entries = await getPendingSyncEntries(10)
  let processed = 0
  let failed = 0

  for (const entry of entries) {
    try {
      await markSyncProcessing(entry.id)
      const result = await processSyncEntry(entry)
      await markSyncCompleted(entry.id)

      if (entry.event_type === 'issue_created' && result?.data?.task?.id) {
        await updateIssueSyncStatus(entry.issue_id, 'synced', result.data.task.id)
      }

      processed++
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      await markSyncFailed(entry.id, message)
      await updateIssueSyncStatus(entry.issue_id, 'failed')
      failed++
    }
  }

  return { processed, failed }
}
