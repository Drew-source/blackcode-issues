import { NextResponse } from 'next/server'
import { withAgentAuth } from '@/lib/agent-response'
import { getProject, getProjectMembers } from '@/lib/db'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return withAgentAuth(req, async () => {
    const { id: idStr } = await params
    const id = parseInt(idStr)
    if (isNaN(id)) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'ID must be an integer', suggestion: 'Use a numeric project ID' }
      }, { status: 400 })
    }

    const project = await getProject(id)
    if (!project) {
      return NextResponse.json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'Project not found', suggestion: 'GET /api/agent/projects to list available projects' }
      }, { status: 404 })
    }

    const members = await getProjectMembers(id)

    return NextResponse.json({ ok: true, data: { project, members } })
  })
}
