import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getIssue, updateIssue, deleteIssue, logTransaction, updateSyncStatus } from '@/lib/db'
import { enqueueSyncEvent, processSyncQueue, isSyncReady } from '@/lib/sync'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idStr } = await params
    const id = parseInt(idStr)
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid ID', suggestion: 'ID must be an integer' },
        { status: 400 }
      )
    }

    const issue = await getIssue(id)
    if (!issue) {
      return NextResponse.json(
        { error: 'Issue not found', suggestion: 'List available: GET /api/issues' },
        { status: 404 }
      )
    }

    return NextResponse.json(issue)
  } catch (error) {
    console.error('Failed to fetch issue:', error)
    return NextResponse.json(
      { error: 'Failed to fetch issue' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idStr } = await params
    const id = parseInt(idStr)
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid ID', suggestion: 'ID must be an integer' },
        { status: 400 }
      )
    }

    // Get old data for rollback
    const oldIssue = await getIssue(id)
    if (!oldIssue) {
      return NextResponse.json(
        { error: 'Issue not found', suggestion: 'List available: GET /api/issues' },
        { status: 404 }
      )
    }

    const body = await request.json()
    const { title, description, status, priority, assignee_id, milestone_id, start_date, due_date, payment_amount, payment_currency, payment_details, requirements, internal_only, claim_only_details } = body

    // Validation
    if (title !== undefined && (typeof title !== 'string' || title.length > 200)) {
      return NextResponse.json(
        { error: 'Invalid title', suggestion: 'Max 200 chars' },
        { status: 400 }
      )
    }

    const validStatuses = ['backlog', 'todo', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled']
    if (status !== undefined && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status', suggestion: `Valid: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    if (priority !== undefined && (priority < 1 || priority > 5)) {
      return NextResponse.json(
        { error: 'Invalid priority', suggestion: 'Priority must be 1-5 (1=urgent, 5=low)' },
        { status: 400 }
      )
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

    // Log transaction for rollback
    if (session.user?.id && issue) {
      await logTransaction({
        user_id: session.user.id,
        operation_type: 'UPDATE',
        table_name: 'issues',
        record_id: id,
        old_data: oldIssue,
        new_data: issue,
      })
    }

    // Enqueue sync event based on sync state
    if (issue && !issue.internal_only) {
      const plainDescription = issue.description
        ? issue.description.replace(/<[^>]*>/g, '').trim()
        : ''

      // Case 1: Was pending_fields, now sync-ready → enqueue initial sync
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
      // Case 2: Already synced → enqueue update
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
      // Case 3: internal_only toggled from true to false
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

    return NextResponse.json(issue)
  } catch (error) {
    console.error('Failed to update issue:', error)
    return NextResponse.json(
      { error: 'Failed to update issue' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: idStr } = await params
    const id = parseInt(idStr)
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid ID', suggestion: 'ID must be an integer' },
        { status: 400 }
      )
    }

    // Get old data for rollback
    const oldIssue = await getIssue(id)
    if (!oldIssue) {
      return NextResponse.json(
        { error: 'Issue not found' },
        { status: 404 }
      )
    }

    // Sync-aware deletion: check TaskHive task status before deleting
    if (oldIssue.taskhive_task_id) {
      const apiKey = process.env.TASKHIVE_SERVICE_ACCOUNT_KEY
      const baseUrl = process.env.TASKHIVE_API_URL || 'https://taskhive-pied.vercel.app'

      if (apiKey) {
        try {
          // Check TaskHive task status
          const res = await fetch(`${baseUrl}/api/v1/tasks/${oldIssue.taskhive_task_id}`, {
            headers: { 'Authorization': `Bearer ${apiKey}` },
          })

          if (res.ok) {
            const taskData = await res.json()
            const taskStatus = taskData.data?.task?.status || taskData.data?.status

            // Block deletion if task has active work
            if (['claimed', 'in_progress', 'delivered', 'disputed'].includes(taskStatus)) {
              return NextResponse.json({
                error: 'Cannot delete: this issue has active work on TaskHive',
                suggestion: `The TaskHive task is '${taskStatus}'. Resolve it on TaskHive before deleting.`,
                taskhive_task_id: oldIssue.taskhive_task_id,
              }, { status: 409 })
            }

            // Cancel open tasks on TaskHive
            if (taskStatus === 'open') {
              await fetch(`${baseUrl}/api/v1/tasks/${oldIssue.taskhive_task_id}/cancel`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${apiKey}`,
                },
              })
            }
            // completed/cancelled: proceed with deletion (no TaskHive action needed)
          }
        } catch (e) {
          // If TaskHive is unreachable, log but don't block deletion
          console.error('Failed to check TaskHive status for deletion:', e)
        }
      }
    }

    await deleteIssue(id)

    // Log transaction for rollback
    if (session.user?.id) {
      await logTransaction({
        user_id: session.user.id,
        operation_type: 'DELETE',
        table_name: 'issues',
        record_id: id,
        old_data: oldIssue,
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete issue:', error)
    return NextResponse.json(
      { error: 'Failed to delete issue' },
      { status: 500 }
    )
  }
}
