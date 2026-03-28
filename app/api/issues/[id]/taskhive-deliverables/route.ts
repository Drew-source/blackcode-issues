import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getTaskHiveDeliverables, updateTaskHiveDeliverable, getIssue } from '@/lib/db'

// GET — list deliverables for an issue
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const issueId = Number.parseInt(id)
  if (Number.isNaN(issueId)) return NextResponse.json({ error: 'Invalid issue ID' }, { status: 400 })

  const issue = await getIssue(issueId)
  if (!issue) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
  if (!issue.taskhive_task_id) return NextResponse.json({ error: 'Issue not synced to TaskHive' }, { status: 400 })

  const deliverables = await getTaskHiveDeliverables(issueId)
  return NextResponse.json(deliverables)
}

// POST — accept or reject a deliverable (calls TaskHive API)
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const issueId = Number.parseInt(id)

  const issue = await getIssue(issueId)
  if (!issue || !issue.taskhive_task_id) {
    return NextResponse.json({ error: 'Issue not found or not synced' }, { status: 404 })
  }

  const body = await req.json()
  const { deliverable_id, action, revision_notes } = body

  if (!deliverable_id || !['accept', 'reject', 'revision'].includes(action)) {
    return NextResponse.json({ error: 'Invalid request. Requires deliverable_id and action (accept/reject/revision).' }, { status: 400 })
  }

  const apiKey = process.env.TASKHIVE_SERVICE_ACCOUNT_KEY
  const baseUrl = process.env.TASKHIVE_API_URL || 'https://taskhive-pied.vercel.app'

  if (!apiKey) return NextResponse.json({ error: 'TASKHIVE_SERVICE_ACCOUNT_KEY not set' }, { status: 500 })

  let endpoint: string
  let requestBody: Record<string, any> = {}

  if (action === 'accept') {
    endpoint = `${baseUrl}/api/v1/tasks/${issue.taskhive_task_id}/deliverables/${deliverable_id}/accept`
  } else {
    endpoint = `${baseUrl}/api/v1/tasks/${issue.taskhive_task_id}/deliverables/${deliverable_id}/reject`
    requestBody = { revision_notes: revision_notes || '' }
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  })

  const data = await res.json()
  if (!res.ok) {
    return NextResponse.json({ error: `TaskHive API error: ${data.error || 'Unknown'}` }, { status: res.status })
  }

  const statusMap: Record<string, string> = {
    accept: 'accepted',
    reject: 'rejected',
    revision: 'revision_requested',
  }

  await updateTaskHiveDeliverable(deliverable_id, {
    status: statusMap[action],
    reviewed_by: (session.user as any)?.id,
    revision_notes: revision_notes,
  })

  return NextResponse.json({ ok: true, action, deliverable_id, taskhive_response: data })
}
