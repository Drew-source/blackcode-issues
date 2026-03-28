import { NextResponse } from 'next/server'
import { withAgentAuth } from '@/lib/agent-response'
import { getProjects, createProject } from '@/lib/db'

export async function GET(req: Request) {
  return withAgentAuth(req, async () => {
    const projects = await getProjects()
    return NextResponse.json({ ok: true, data: { projects } })
  })
}

export async function POST(req: Request) {
  return withAgentAuth(req, async (agent) => {
    const body = await req.json()
    const { name, description } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'name is required', suggestion: 'Provide a string name' }
      }, { status: 400 })
    }

    const project = await createProject({ name, description, owner_id: agent.user_id })

    return NextResponse.json({ ok: true, data: { project } }, { status: 201 })
  })
}
