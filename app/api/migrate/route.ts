import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

// POST /api/migrate - Run database migrations
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const migrations: string[] = []

    // Add start_date and due_date columns to issues table if they don't exist
    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS start_date DATE`
      migrations.push('Added start_date column to issues')
    } catch (e) {
      // Column might already exist
    }

    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS due_date DATE`
      migrations.push('Added due_date column to issues')
    } catch (e) {
      // Column might already exist  
    }

    // Add estimated_hours column for better time tracking
    try {
      await sql`ALTER TABLE issues ADD COLUMN IF NOT EXISTS estimated_hours DECIMAL(5,1)`
      migrations.push('Added estimated_hours column to issues')
    } catch (e) {
      // Column might already exist
    }

    return NextResponse.json({
      success: true,
      migrations,
    })
  } catch (error) {
    console.error('Migration failed:', error)
    return NextResponse.json(
      { error: 'Migration failed', details: String(error) },
      { status: 500 }
    )
  }
}
