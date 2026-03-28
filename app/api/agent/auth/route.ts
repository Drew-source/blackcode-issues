import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { createApiKey } from '@/lib/db'
import { authenticateApiKey } from '@/lib/api-auth'

// POST — generate API key (requires Google OAuth session first)
export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Login via Google OAuth first to generate an API key' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const name = body.name || 'default'

  const result = await createApiKey(session.user.id, name)

  return NextResponse.json({
    ok: true,
    data: {
      api_key: result.raw_key,
      prefix: result.key_prefix,
      name: result.name,
      message: 'Save this key — it will not be shown again.',
    }
  }, { status: 201 })
}

// GET — verify current API key
export async function GET(req: Request) {
  const agent = await authenticateApiKey(req)
  if (!agent) {
    return NextResponse.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Invalid or missing API key', suggestion: 'Provide a valid bc_agent_ key via Bearer token' } }, { status: 401 })
  }

  return NextResponse.json({
    ok: true,
    data: { user_id: agent.user_id, user_name: agent.user_name, email: agent.email, role: agent.role }
  })
}
