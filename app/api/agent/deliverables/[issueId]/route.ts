import { NextResponse } from 'next/server'
import { withAgentAuth } from '@/lib/agent-response'
import { getIssue, getTaskHiveDeliverables, updateTaskHiveDeliverable } from '@/lib/db'

export async function GET(req: Request, { params }: { params: Promise<{ issueId: string }> }) {
  return withAgentAuth(req, async () => {
    const { issueId: idStr } = await params
    const issueId = parseInt(idStr)
    if (isNaN(issueId)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'issueId must be an integer', suggestion: 'Use a numeric issue ID' }
      }, { status: 400 })
    }

    const issue = await getIssue(issueId)
    if (!issue) {
      return NextResponse.json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Issue not found', suggestion: 'GET /api/agent/issues to list available issues' }
      }, { status: 404 })
    }

    if (!issue.taskhive_task_id) {
      return NextResponse.json({
        ok: false,
        error: { code: 'NOT_SYNCED', message: 'Issue not synced to TaskHive', suggestion: 'Only synced issues have deliverables' }
      }, { status: 400 })
    }

    const deliverables = await getTaskHiveDeliverables(issueId)
    return NextResponse.json({ ok: true, data: { deliverables } })
  })
}

export async function POST(req: Request, { params }: { params: Promise<{ issueId: string }> }) {
  return withAgentAuth(req, async (agent) => {
    const { issueId: idStr } = await params
    const issueId = parseInt(idStr)

    const issue = await getIssue(issueId)
    if (!issue || !issue.taskhive_task_id) {
      return NextResponse.json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Issue not found or not synced to TaskHive', suggestion: 'Only synced issues have deliverables' }
      }, { status: 404 })
    }

    const body = await req.json()
    const { deliverable_id, action, revision_notes } = body

    if (!deliverable_id || !['accept', 'reject', 'revision'].includes(action)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'deliverable_id and action (accept/reject/revision) are required', suggestion: 'GET this endpoint first to see available deliverables' }
      }, { status: 400 })
    }

    const apiKey = process.env.TASKHIVE_SERVICE_ACCOUNT_KEY
    const baseUrl = process.env.TASKHIVE_API_URL || 'https://taskhive-pied.vercel.app'

    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        error: { code: 'CONFIG_ERROR', message: 'TASKHIVE_SERVICE_ACCOUNT_KEY not configured', suggestion: 'Contact admin' }
      }, { status: 500 })
    }

    let endpoint: string
    const requestBody: Record<string, any> = {}

    if (action === 'accept') {
      endpoint = `${baseUrl}/api/v1/tasks/${issue.taskhive_task_id}/deliverables/${deliverable_id}/accept`
    } else {
      endpoint = `${baseUrl}/api/v1/tasks/${issue.taskhive_task_id}/deliverables/${deliverable_id}/reject`
      requestBody.revision_notes = revision_notes || ''
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
      return NextResponse.json({
        ok: false,
        error: { code: 'TASKHIVE_ERROR', message: `TaskHive API error: ${data.error || 'Unknown'}`, suggestion: 'Check deliverable_id and try again' }
      }, { status: res.status })
    }

    const statusMap: Record<string, string> = {
      accept: 'accepted',
      reject: 'rejected',
      revision: 'revision_requested',
    }

    await updateTaskHiveDeliverable(deliverable_id, {
      status: statusMap[action],
      reviewed_by: agent.user_id,
      revision_notes,
    })

    return NextResponse.json({ ok: true, data: { action, deliverable_id, taskhive_response: data } })
  })
}
