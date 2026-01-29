import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getIssueActivity, getIssue } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const issueId = parseInt(id)
    if (isNaN(issueId)) {
      return NextResponse.json({ error: 'Invalid issue ID' }, { status: 400 })
    }

    // Verify issue exists
    const issue = await getIssue(issueId)
    if (!issue) {
      return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
    }

    const activity = await getIssueActivity(issueId)
    return NextResponse.json(activity)
  } catch (error) {
    console.error('Failed to fetch activity:', error)
    return NextResponse.json(
      { error: 'Failed to fetch activity' },
      { status: 500 }
    )
  }
}
