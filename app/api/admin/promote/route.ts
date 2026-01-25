import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL!)

// POST /api/admin/promote - Promote first user (id=1) to admin
// This is a one-time bootstrap endpoint
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only allow user id=1 (first user / owner) to use this
    if (session.user.id !== 1) {
      return NextResponse.json({ error: 'Only the original owner can use this' }, { status: 403 })
    }

    // Check if there are any admins already
    const admins = await sql`SELECT id FROM users WHERE role = 'admin'`
    
    if (admins.length > 0) {
      return NextResponse.json({ 
        error: 'Admin already exists',
        message: 'This bootstrap endpoint can only be used once'
      }, { status: 400 })
    }

    // Promote user id=1 to admin
    await sql`UPDATE users SET role = 'admin' WHERE id = 1`

    return NextResponse.json({
      success: true,
      message: 'You are now an admin!',
    })
  } catch (error) {
    console.error('Promote failed:', error)
    return NextResponse.json(
      { error: 'Promote failed', details: String(error) },
      { status: 500 }
    )
  }
}
