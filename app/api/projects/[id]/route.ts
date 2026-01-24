import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../auth/[...nextauth]/route'
import { getProject, updateProject, isProjectMember, getProjectMemberRole } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid ID', suggestion: 'ID must be an integer' },
        { status: 400 }
      )
    }

    // Check if user is a member of this project
    const isMember = await isProjectMember(id, session.user.id)
    if (!isMember) {
      return NextResponse.json(
        { error: 'Forbidden', suggestion: 'You are not a member of this project' },
        { status: 403 }
      )
    }

    const project = await getProject(id)
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found', suggestion: 'List available: GET /api/projects' },
        { status: 404 }
      )
    }

    return NextResponse.json(project)
  } catch (error) {
    console.error('Failed to fetch project:', error)
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = parseInt(params.id)
    if (isNaN(id)) {
      return NextResponse.json(
        { error: 'Invalid ID', suggestion: 'ID must be an integer' },
        { status: 400 }
      )
    }

    // Check if user has admin/owner role
    const role = await getProjectMemberRole(id, session.user.id)
    if (!role || !['owner', 'admin'].includes(role)) {
      return NextResponse.json(
        { error: 'Forbidden', suggestion: 'Only project owners and admins can update projects' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const project = await updateProject(id, body)

    if (!project) {
      return NextResponse.json(
        { error: 'Project not found or no changes', suggestion: 'Check project ID' },
        { status: 404 }
      )
    }

    return NextResponse.json(project)
  } catch (error) {
    console.error('Failed to update project:', error)
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    )
  }
}

