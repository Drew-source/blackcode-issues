import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { 
  getProjectMembers, 
  addProjectMember, 
  removeProjectMember,
  getProjectMemberRole,
  getUserByEmail 
} from '@/lib/db'

// GET /api/projects/:id/members - List project members
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
    const projectId = parseInt(id)
    if (isNaN(projectId)) {
      return NextResponse.json(
        { error: 'Invalid project ID', suggestion: 'ID must be an integer' },
        { status: 400 }
      )
    }

    const members = await getProjectMembers(projectId)
    return NextResponse.json(members)
  } catch (error) {
    console.error('Failed to fetch project members:', error)
    return NextResponse.json(
      { error: 'Failed to fetch project members' },
      { status: 500 }
    )
  }
}

// POST /api/projects/:id/members - Add member to project
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const projectId = parseInt(id)
    if (isNaN(projectId)) {
      return NextResponse.json(
        { error: 'Invalid project ID', suggestion: 'ID must be an integer' },
        { status: 400 }
      )
    }

    // Check if current user is admin/owner of this project
    const currentUserRole = await getProjectMemberRole(projectId, session.user.id)
    if (!currentUserRole || !['owner', 'admin'].includes(currentUserRole)) {
      return NextResponse.json(
        { error: 'Forbidden', suggestion: 'Only project owners and admins can add members' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, role = 'member' } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Invalid email', suggestion: 'email is required' },
        { status: 400 }
      )
    }

    const validRoles = ['owner', 'admin', 'member', 'viewer']
    if (!validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role', suggestion: `Valid roles: ${validRoles.join(', ')}` },
        { status: 400 }
      )
    }

    // Find user by email
    const user = await getUserByEmail(email)
    if (!user) {
      return NextResponse.json(
        { error: 'User not found', suggestion: 'User must sign in at least once before being added' },
        { status: 404 }
      )
    }

    const member = await addProjectMember(projectId, user.id, role)
    return NextResponse.json({
      ...member,
      name: user.name,
      email: user.email,
      avatar_url: user.avatar_url,
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to add project member:', error)
    return NextResponse.json(
      { error: 'Failed to add project member' },
      { status: 500 }
    )
  }
}

// DELETE /api/projects/:id/members - Remove member from project
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const projectId = parseInt(id)
    if (isNaN(projectId)) {
      return NextResponse.json(
        { error: 'Invalid project ID', suggestion: 'ID must be an integer' },
        { status: 400 }
      )
    }

    // Check if current user is admin/owner of this project
    const currentUserRole = await getProjectMemberRole(projectId, session.user.id)
    if (!currentUserRole || !['owner', 'admin'].includes(currentUserRole)) {
      return NextResponse.json(
        { error: 'Forbidden', suggestion: 'Only project owners and admins can remove members' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { user_id } = body

    if (!user_id || typeof user_id !== 'number') {
      return NextResponse.json(
        { error: 'Invalid user_id', suggestion: 'user_id is required and must be an integer' },
        { status: 400 }
      )
    }

    await removeProjectMember(projectId, user_id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to remove project member:', error)
    return NextResponse.json(
      { error: 'Failed to remove project member' },
      { status: 500 }
    )
  }
}
