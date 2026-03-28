import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getSyncHealthMetrics, getDeadSyncEntries } from '@/lib/db'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const metrics = await getSyncHealthMetrics()
  const deadEntries = await getDeadSyncEntries()
  return NextResponse.json({ metrics, dead_entries: deadEntries })
}
