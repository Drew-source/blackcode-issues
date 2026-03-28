import { NextResponse } from 'next/server'
import { withAgentAuth } from '@/lib/agent-response'
import { getMilestones, getAllMilestones, createMilestone } from '@/lib/db'

export async function GET(req: Request) {
  return withAgentAuth(req, async () => {
    const url = new URL(req.url)
    const projectId = url.searchParams.get('project_id')

    let milestones
    if (projectId) {
      milestones = await getMilestones(parseInt(projectId))
    } else {
      milestones = await getAllMilestones()
    }

    return NextResponse.json({ ok: true, data: { milestones } })
  })
}

export async function POST(req: Request) {
  return withAgentAuth(req, async () => {
    const body = await req.json()
    const { project_id, name, description, due_date } = body

    if (!project_id || typeof project_id !== 'number') {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'project_id is required and must be an integer', suggestion: 'GET /api/agent/projects to list available projects' }
      }, { status: 400 })
    }

    if (!name || typeof name !== 'string') {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'name is required', suggestion: 'Provide a string name' }
      }, { status: 400 })
    }

    const milestone = await createMilestone({ project_id, name, description, due_date })

    return NextResponse.json({ ok: true, data: { milestone } }, { status: 201 })
  })
}
