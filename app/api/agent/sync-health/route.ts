import { NextResponse } from 'next/server'
import { withAgentAuth } from '@/lib/agent-response'
import { getSyncHealthMetrics, getDeadSyncEntries, retrySyncEntry } from '@/lib/db'

export async function GET(req: Request) {
  return withAgentAuth(req, async () => {
    const metrics = await getSyncHealthMetrics()
    const deadEntries = await getDeadSyncEntries()
    return NextResponse.json({ ok: true, data: { metrics, dead_entries: deadEntries } })
  })
}

export async function POST(req: Request) {
  return withAgentAuth(req, async () => {
    const body = await req.json()
    const { entry_id } = body
    if (!entry_id) return NextResponse.json({ ok: false, error: { code: 'MISSING_ID', message: 'entry_id required' } }, { status: 400 })
    await retrySyncEntry(entry_id)
    return NextResponse.json({ ok: true, data: { retried: entry_id } })
  })
}
