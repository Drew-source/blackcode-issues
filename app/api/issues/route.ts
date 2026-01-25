import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getIssuesByProject, getAllIssuesWithProjects, createIssue } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('project_id')
    const includeProject = searchParams.get('includeProject') === 'true'

    // Use tagged template functions (Neon compatible)
    let issues
    if (projectId) {
      issues = await getIssuesByProject(parseInt(projectId))
    } else if (includeProject) {
      // All Issues page - get all issues with project info
      issues = await getAllIssuesWithProjects()
    } else {
      // Fallback: get all issues with project info
      issues = await getAllIssuesWithProjects()
    }

    return NextResponse.json(issues)
  } catch (error) {
    console.error('Failed to fetch issues:', error)
    return NextResponse.json(
      { error: 'Failed to fetch issues' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { project_id, title, description, status, priority, assignee_id, milestone_id } = body

    // Validation
    if (!project_id || typeof project_id !== 'number') {
      return NextResponse.json(
        { error: 'Invalid project_id', suggestion: 'project_id is required and must be an integer' },
        { status: 400 }
      )
    }

    if (!title || typeof title !== 'string') {
      return NextResponse.json(
        { error: 'Invalid title', suggestion: 'title is required' },
        { status: 400 }
      )
    }

    if (title.length > 200) {
      return NextResponse.json(
        { error: 'Title too long', suggestion: `Max 200 chars. You sent ${title.length}. Truncate or split.` },
        { status: 400 }
      )
    }

    const validStatuses = ['backlog', 'todo', 'in_progress', 'blocked', 'in_review', 'done', 'cancelled']
    if (status && !validStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status', suggestion: `Valid: ${validStatuses.join(', ')}` },
        { status: 400 }
      )
    }

    if (priority && (priority < 1 || priority > 5)) {
      return NextResponse.json(
        { error: 'Invalid priority', suggestion: 'Priority must be 1-5 (1=urgent, 5=low)' },
        { status: 400 }
      )
    }

    const issue = await createIssue({
      project_id,
      title,
      description,
      status,
      priority,
      assignee_id,
      milestone_id,
      reporter_id: session.user?.id,
    })

    return NextResponse.json(issue, { status: 201 })
  } catch (error) {
    console.error('Failed to create issue:', error)
    return NextResponse.json(
      { error: 'Failed to create issue' },
      { status: 500 }
    )
  }
}

