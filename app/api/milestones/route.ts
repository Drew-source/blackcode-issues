import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getMilestones, getAllMilestones, createMilestone } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const projectId = searchParams.get('project_id')

    if (projectId) {
      const milestones = await getMilestones(parseInt(projectId))
      return NextResponse.json(milestones)
    } else {
      const milestones = await getAllMilestones()
      return NextResponse.json(milestones)
    }
  } catch (error) {
    console.error('Failed to fetch milestones:', error)
    return NextResponse.json(
      { error: 'Failed to fetch milestones' },
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
    const { project_id, name, description, due_date } = body

    if (!project_id || !name) {
      return NextResponse.json(
        { error: 'project_id and name are required' },
        { status: 400 }
      )
    }

    const milestone = await createMilestone({
      project_id,
      name,
      description,
      due_date,
    })

    return NextResponse.json(milestone, { status: 201 })
  } catch (error) {
    console.error('Failed to create milestone:', error)
    return NextResponse.json(
      { error: 'Failed to create milestone' },
      { status: 500 }
    )
  }
}

