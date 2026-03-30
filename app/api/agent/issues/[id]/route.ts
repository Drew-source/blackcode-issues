import { NextResponse } from 'next/server'
import { withAgentAuth } from '@/lib/agent-response'
import { getIssue, updateIssue, deleteIssue, logTransaction, updateSyncStatus } from '@/lib/db'
import { enqueueSyncEvent, processSyncQueue, isSyncReady } from '@/lib/sync'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(req, async () => {
    const { id: idStr } = await params
    const id = parseInt(idStr)
    if (isNaN(id)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'ID must be an integer', suggestion: 'Use a numeric issue ID' }
      }, { status: 400 })
    }

    const issue = await getIssue(id)
    if (!issue) {
      return NextResponse.json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Issue not found', suggestion: 'GET /api/agent/issues to list available issues' }
      }, { status: 404 })
    }

    return NextResponse.json({ ok: true, data: { issue } })
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(req, async (agent) => {
    const { id: idStr } = await params
    const id = parseInt(idStr)
    if (isNaN(id)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'ID must be an integer', suggestion: 'Use a numeric issue ID' }
      }, { status: 400 })
    }

    const oldIssue = await getIssue(id)
    if (!oldIssue) {
      return NextResponse.json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Issue not found', suggestion: 'GET /api/agent/issues to list available issues' }
      }, { status: 404 })
    }

    const body = await req.json()
    const { title, description, status, priority, assignee_id, milestone_id, start_date, due_date, internal_only, payment_amount, payment_currency, payment_details, requirements, claim_only_details } = body

    if (title !== undefined && (typeof title !== 'string' || title.length > 200)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid title', suggestion: 'Max 200 chars' }
      }, { status: 400 })
    }

    const validStatuses = ['backlog', 'todo', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled']
    if (status !== undefined && !validStatuses.includes(status)) {
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

    if (payment_amount !== undefined && payment_amount !== null && (typeof payment_amount !== 'number' || payment_amount <= 0)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'payment_amount must be a positive number or null', suggestion: 'Example: 50.00' }
      }, { status: 400 })
    }

    const issue = await updateIssue(id, {
      title,
      description,
      status,
      priority,
      assignee_id,
      milestone_id,
      start_date,
      due_date,
      internal_only,
      payment_amount,
      payment_currency,
      payment_details,
      requirements,
      claim_only_details,
    })

    if (issue) {
      await logTransaction({
        user_id: agent.user_id,
        operation_type: 'UPDATE',
        table_name: 'issues',
        record_id: id,
        old_data: oldIssue,
        new_data: issue,
      })

      if (!issue.internal_only) {
        const plainDescription = issue.description
          ? issue.description.replace(/<[^>]*>/g, '').trim()
          : ''

        // Case 1: Was pending_fields, now sync-ready
        if (issue.taskhive_sync_status === 'pending_fields' && isSyncReady(issue as any)) {
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
          await updateSyncStatus(issue.id, 'pending')
          processSyncQueue().catch(() => {})
        }
        // Case 2: Already synced
        else if (issue.taskhive_task_id) {
          await enqueueSyncEvent(issue.id, 'issue_updated', {
            taskhive_task_id: issue.taskhive_task_id,
            updates: {
              title: issue.title,
              description: plainDescription || issue.title,
              requirements: issue.requirements || undefined,
              payment_amount: issue.payment_amount,
              payment_currency: issue.payment_currency,
              payment_details: issue.payment_details || undefined,
              deadline: issue.due_date || null,
            }
          })
          processSyncQueue().catch(() => {})
        }
        // Case 3: internal_only toggled false
        else if (oldIssue.internal_only && !issue.internal_only) {
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
            await updateSyncStatus(issue.id, 'pending')
            processSyncQueue().catch(() => {})
          } else {
            await updateSyncStatus(issue.id, 'pending_fields')
          }
        }
      }
    }

    return NextResponse.json({ ok: true, data: { issue } })
  })
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(req, async (agent) => {
    const { id: idStr } = await params
    const id = parseInt(idStr)
    if (isNaN(id)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'ID must be an integer', suggestion: 'Use a numeric issue ID' }
      }, { status: 400 })
    }

    const oldIssue = await getIssue(id)
    if (!oldIssue) {
      return NextResponse.json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Issue not found', suggestion: 'GET /api/agent/issues to list available issues' }
      }, { status: 404 })
    }

    // Sync-aware deletion
    if (oldIssue.taskhive_task_id) {
      const apiKey = process.env.TASKHIVE_SERVICE_ACCOUNT_KEY
      const baseUrl = process.env.TASKHIVE_API_URL || 'https://taskhive-pied.vercel.app'

      if (apiKey) {
        try {
          const res = await fetch(`${baseUrl}/api/v1/tasks/${oldIssue.taskhive_task_id}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
          })

          if (res.ok) {
            const taskData = await res.json()
            const taskStatus = taskData.data?.task?.status || taskData.data?.status

            if (['claimed', 'in_progress', 'delivered', 'disputed'].includes(taskStatus)) {
              return NextResponse.json({
                ok: false,
                error: {
                  code: 'CONFLICT',
                  message: 'Cannot delete: this issue has active work on TaskHive',
                  suggestion: `The TaskHive task is '${taskStatus}'. Resolve it on TaskHive before deleting.`,
                }
              }, { status: 409 })
            }

            if (taskStatus === 'open') {
              await fetch(`${baseUrl}/api/v1/tasks/${oldIssue.taskhive_task_id}/cancel`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`,
                },
              })
            }
          }
        } catch (e) {
          console.error('Failed to check TaskHive status for deletion:', e)
        }
      }
    }

    await deleteIssue(id)

    await logTransaction({
      user_id: agent.user_id,
      operation_type: 'DELETE',
      table_name: 'issues',
      record_id: id,
      old_data: oldIssue,
    })

    return NextResponse.json({ ok: true, data: { deleted: id } })
  })
}
