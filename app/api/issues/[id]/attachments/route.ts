import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getAttachments, createAttachment, deleteAttachment, getAttachment, getIssue, getProjectMemberRole } from '@/lib/db'

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

    const attachments = await getAttachments(issueId)
    return NextResponse.json(attachments)
  } catch (error) {
    console.error('Failed to fetch attachments:', error)
    return NextResponse.json(
      { error: 'Failed to fetch attachments' },
      { status: 500 }
    )
  }
}

export async function POST(
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

    const body = await request.json()
    const { filename, file_url, file_size, mime_type } = body

    if (!filename || !file_url) {
      return NextResponse.json(
        { error: 'Filename and file_url are required' },
        { status: 400 }
      )
    }

    const attachment = await createAttachment({
      issue_id: issueId,
      filename,
      file_url,
      file_size,
      mime_type,
      uploaded_by: session.user?.id,
    })

    return NextResponse.json(attachment, { status: 201 })
  } catch (error) {
    console.error('Failed to create attachment:', error)
    return NextResponse.json(
      { error: 'Failed to create attachment' },
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

    const { id } = await params
    const issueId = parseInt(id)
    if (isNaN(issueId)) {
      return NextResponse.json({ error: 'Invalid issue ID' }, { status: 400 })
    }

    // Get attachment ID from query params
    const { searchParams } = new URL(request.url)
    const attachmentId = searchParams.get('attachmentId')

    if (!attachmentId) {
      return NextResponse.json(
        { error: 'Attachment ID is required', suggestion: 'Add ?attachmentId=123 to the URL' },
        { status: 400 }
      )
    }

    const attachment = await getAttachment(parseInt(attachmentId))
    if (!attachment) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
    }

    // Verify attachment belongs to this issue
    if (attachment.issue_id !== issueId) {
      return NextResponse.json({ error: 'Attachment does not belong to this issue' }, { status: 403 })
    }

    // Authorization: Only the uploader or project admin/owner can delete
    if (attachment.uploaded_by !== session.user?.id) {
      // Check if user is project admin/owner
      const issue = await getIssue(issueId)
      if (issue) {
        const role = await getProjectMemberRole(issue.project_id, session.user?.id as number)
        if (!role || !['owner', 'admin'].includes(role)) {
          return NextResponse.json(
            { error: 'Forbidden', suggestion: 'Only the uploader or project admins can delete attachments' },
            { status: 403 }
          )
        }
      }
    }

    await deleteAttachment(parseInt(attachmentId))
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to delete attachment:', error)
    return NextResponse.json(
      { error: 'Failed to delete attachment' },
      { status: 500 }
    )
  }
}
