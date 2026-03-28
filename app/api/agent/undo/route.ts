import { NextResponse } from 'next/server'
import { withAgentAuth } from '@/lib/agent-response'
import { getTransactionLog, undoLastOperations } from '@/lib/db'

export async function GET(req: Request) {
  return withAgentAuth(req, async () => {
    const history = await getTransactionLog(50)
    return NextResponse.json({ ok: true, data: { history, count: history.length } })
  })
}

export async function POST(req: Request) {
  return withAgentAuth(req, async (agent) => {
    const body = await req.json()
    const count = body.count || 1

    if (typeof count !== 'number' || count < 1 || count > 10) {
      return NextResponse.json({
        ok: false,
        error: { code: 'VALIDATION_ERROR', message: 'count must be 1-10', suggestion: 'Provide a number between 1 and 10' }
      }, { status: 400 })
    }

    const undone = await undoLastOperations(agent.user_id, count)

    return NextResponse.json({
      ok: true,
      data: { undone_count: undone.length, operations: undone }
    })
  })
}
