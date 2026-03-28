import bcrypt from 'bcryptjs'
import { sql, updateApiKeyLastUsed } from './db'

interface AuthenticatedAgent {
  id: number
  user_id: number
  user_name: string
  email: string
  role: string
}

export async function authenticateApiKey(req: Request): Promise<AuthenticatedAgent | null> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return null

  const apiKey = authHeader.substring(7)
  if (!apiKey.startsWith('bc_agent_')) return null

  const prefix = apiKey.substring(0, 18)

  const { rows: result } = await sql`
    SELECT ak.id, ak.key_hash, ak.user_id, u.name as user_name, u.email, u.role
    FROM api_keys ak
    JOIN users u ON ak.user_id = u.id
    WHERE ak.key_prefix = ${prefix} AND ak.is_active = true
  `

  if (result.length === 0) return null

  const keyRecord = result[0]
  const isValid = await bcrypt.compare(apiKey, keyRecord.key_hash as string)
  if (!isValid) return null

  updateApiKeyLastUsed(keyRecord.id as number).catch(() => {})

  return {
    id: keyRecord.id as number,
    user_id: keyRecord.user_id as number,
    user_name: keyRecord.user_name as string,
    email: keyRecord.email as string,
    role: keyRecord.role as string,
  }
}
