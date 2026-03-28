import { NextResponse } from 'next/server'
import { processSyncQueue } from '@/lib/sync'

export async function POST() {
  try {
    const result = await processSyncQueue()
    return NextResponse.json({ ok: true, ...result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
