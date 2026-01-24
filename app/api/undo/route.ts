import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../auth/[...nextauth]/route'
import { undoLastOperations, getTransactionLog } from '@/lib/db'

// GET /api/undo - Get transaction history
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const log = await getTransactionLog(50)
    return NextResponse.json(log)
  } catch (error) {
    console.error('Failed to fetch transaction log:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transaction log' },
      { status: 500 }
    )
  }
}

// POST /api/undo - Undo last N operations
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const count = Math.min(Math.max(body.count || 1, 1), 10) // 1-10 operations

    const undone = await undoLastOperations(session.user.id, count)

    return NextResponse.json({
      success: true,
      undone_count: undone.length,
      operations: undone,
    })
  } catch (error) {
    console.error('Failed to undo operations:', error)
    return NextResponse.json(
      { error: 'Failed to undo operations' },
      { status: 500 }
    )
  }
}

