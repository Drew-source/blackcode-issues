import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getIssue, updateIssue, deleteIssue, logTransaction } from '@/lib/db'

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
    const { title, description, status, priority, assignee_id, milestone_id } = body

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
