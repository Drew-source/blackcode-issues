import { NextResponse } from 'next/server'
import { withAgentAuth } from '@/lib/agent-response'
import { getIssuesByProject, getAllIssuesWithProjects, createIssue, logTransaction, updateSyncStatus } from '@/lib/db'
import { enqueueSyncEvent, processSyncQueue, isSyncReady } from '@/lib/sync'

export async function GET(req: Request) {
  return withAgentAuth(req, async (agent) => {
    const url = new URL(req.url)
    const projectId = url.searchParams.get('project_id')
    const status = url.searchParams.get('status')
    const limit = parseInt(url.searchParams.get('limit') || '100')

    let issues
    if (projectId) {
      issues = await getIssuesByProject(parseInt(projectId))
    } else {
      issues = await getAllIssuesWithProjects()
    }

    if (status) {
      issues = issues.filter((i: any) => i.status === status)
    }

    issues = issues.slice(0, limit)

    return NextResponse.json({ ok: true, data: { issues, count: issues.length } })
  })
}

export async function POST(req: Request) {
  return withAgentAuth(req, async (agent) => {
    const body = await req.json()
    const { project_id, title, description, status, priority, assignee_id, milestone_id, internal_only, due_date, payment_amount, payment_currency, payment_details, requirements } = body

    if (!project_id || typeof project_id !== 'number') {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'project_id is required and must be an integer', suggestion: 'GET /api/agent/projects to list available projects' }
      }, { status: 400 })
    }

    if (!title || typeof title !== 'string') {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'title is required', suggestion: 'Provide a string title' }
      }, { status: 400 })
    }

    if (title.length > 200) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: `Title too long (${title.length} chars)`, suggestion: 'Max 200 chars. Truncate or split.' }
      }, { status: 400 })
    }

    const validStatuses = ['backlog', 'todo', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid status', suggestion: `Valid: ${validStatuses.join(', ')}` }
      }, { status: 400 })
    }

    if (priority !== undefined && (priority < 1 || priority > 5)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid priority', suggestion: 'Priority must be 1-5 (1=urgent, 5=low)' }
      }, { status: 400 })
    }

    if (payment_amount !== undefined && (typeof payment_amount !== 'number' || payment_amount <= 0)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'payment_amount must be a positive number', suggestion: 'Example: 50.00' }
      }, { status: 400 })
    }

    const issue = await createIssue({
      project_id,
      title,
      description,
      status,
      priority,
      assignee_id,
      milestone_id,
      reporter_id: agent.user_id,
      internal_only,
      due_date,
      payment_amount,
      payment_currency,
      payment_details,
      requirements,
    })

    if (issue) {
      await logTransaction({
        user_id: agent.user_id,
        operation_type: 'INSERT',
        table_name: 'issues',
        record_id: issue.id,
        new_data: issue,
      })

      if (!issue.internal_only) {
        const plainDescription = issue.description
          ? issue.description.replace(/<[^>]*>/g, '').trim()
          : ''

        if (isSyncReady(issue as any)) {
          await enqueueSyncEvent(issue.id, 'issue_created', {
            title: issue.title,
            description: plainDescription || issue.title,
            requirements: issue.requirements || undefined,
            payment_amount: issue.payment_amount,
            payment_currency: issue.payment_currency,
            payment_details: issue.payment_details || undefined,
            deadline: issue.due_date || null,
            project_id: issue.project_id,
          })
          processSyncQueue().catch(() => {})
        } else {
          await updateSyncStatus(issue.id, 'pending_fields')
        }
      }
    }

    return NextResponse.json({ ok: true, data: { issue } }, { status: 201 })
  })
}
