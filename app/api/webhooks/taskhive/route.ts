import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { sql, createTaskHiveDeliverable } from '@/lib/db'

// Status mapping: TaskHive -> BlackCode
const STATUS_MAP: Record<string, string> = {
  claimed: 'in_progress',
  in_progress: 'in_progress',
  delivered: 'in_review',
  completed: 'done',
  cancelled: 'cancelled',
  disputed: 'blocked',
}

const FINAL_STATES = ['done', 'cancelled']

function verifySignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  } catch {
    return false
  }
}

export async function POST(req: Request) {
  const secret = process.env.TASKHIVE_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook secret not configured' }, { status: 500 })
  }

  const signature = req.headers.get('x-taskhive-signature') || ''
  const body = await req.text()

  if (!signature || !verifySignature(body, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const event = JSON.parse(body)
  const { type, data } = event

  const taskId = data?.task_id
  if (!taskId) {
    return NextResponse.json({ ok: true, skipped: 'no task_id' })
  }

  // Find the BlackCode issue by TaskHive task ID
  const { rows } = await sql`
    SELECT id, status FROM issues WHERE taskhive_task_id = ${taskId}
  `

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, skipped: 'no matching issue' })
  }

  const issue = rows[0] as { id: number; status: string }

  // Handle status-changing events
  const statusEvents = ['task.claimed', 'claim.accepted', 'task.delivered', 'task.completed']
  if (statusEvents.includes(type)) {
    const newTaskHiveStatus = type === 'claim.accepted' ? 'claimed' : (type as string).replace('task.', '')
    const newBcStatus = STATUS_MAP[newTaskHiveStatus]

    if (!newBcStatus) {
      return NextResponse.json({ ok: true, skipped: `no mapping for ${newTaskHiveStatus}` })
    }

    // Don't overwrite final states
    if (FINAL_STATES.includes(issue.status)) {
      return NextResponse.json({ ok: true, skipped: `issue in final state: ${issue.status}` })
    }

    await sql`
      UPDATE issues SET status = ${newBcStatus}, updated_at = NOW() WHERE id = ${issue.id}
    `

    return NextResponse.json({ ok: true, updated: { issue_id: issue.id, new_status: newBcStatus } })
  }

  // Handle deliverable submissions
  if (type === 'deliverable.submitted') {
    const deliverableData = data.deliverable || data

    await createTaskHiveDeliverable({
      issue_id: issue.id,
      taskhive_deliverable_id: deliverableData.id || deliverableData.deliverable_id || 0,
      taskhive_task_id: taskId,
      worker_name: deliverableData.worker_name,
      worker_rating: deliverableData.worker_rating,
      content: deliverableData.content || '',
      github_url: deliverableData.github_url,
      artifacts: deliverableData.artifacts || [],
      auto_review_result: deliverableData.auto_review_result,
      auto_review_scores: deliverableData.auto_review_scores,
      auto_review_feedback: deliverableData.auto_review_feedback,
      submitted_at: deliverableData.submitted_at,
    })

    return NextResponse.json({ ok: true, created: 'taskhive_deliverable' })
  }

  // Handle deliverable acceptance and revision requests
  if (type === 'deliverable.accepted' || type === 'deliverable.revision_requested') {
    return NextResponse.json({ ok: true, noted: type })
  }

  return NextResponse.json({ ok: true, skipped: `unhandled event: ${type}` })
}
