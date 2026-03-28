import { sql } from './db'

export interface ParsedQuery {
  status?: string
  priority?: number
  assignee_name?: string
  project_name?: string
  date_range?: { start: string; end: string }
  text_search?: string
}

export function parseNaturalLanguageQuery(query: string): ParsedQuery {
  const result: ParsedQuery = {}
  let remaining = query

  // Status extraction
  const statusMap: Record<string, string> = {
    'blocked': 'blocked',
    'done': 'done',
    'completed': 'done',
    'finished': 'done',
    'in progress': 'in_progress',
    'in-progress': 'in_progress',
    'wip': 'in_progress',
    'working': 'in_progress',
    'todo': 'todo',
    'to do': 'todo',
    'to-do': 'todo',
    'backlog': 'backlog',
    'in review': 'in_review',
    'in-review': 'in_review',
    'review': 'in_review',
    'cancelled': 'cancelled',
    'canceled': 'cancelled',
    'open': 'todo',
  }

  for (const [keyword, status] of Object.entries(statusMap)) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i')
    if (regex.test(remaining)) {
      result.status = status
      remaining = remaining.replace(regex, '').trim()
      break
    }
  }

  // Priority extraction
  const priorityMap: Record<string, number> = {
    'urgent': 1,
    'critical': 1,
    'high priority': 2,
    'high': 2,
    'medium priority': 3,
    'medium': 3,
    'normal': 3,
    'low priority': 4,
    'low': 4,
  }

  for (const [keyword, priority] of Object.entries(priorityMap)) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i')
    if (regex.test(remaining)) {
      result.priority = priority
      remaining = remaining.replace(regex, '').trim()
      break
    }
  }

  // Assignee extraction: "assigned to X" or "by X"
  const assigneeMatch = remaining.match(/(?:assigned to|assigned|by)\s+([A-Za-z][A-Za-z\s]*?)(?:\s+(?:in|from|during|for|since|before|after|last|this|q[1-4])|$)/i)
  if (assigneeMatch) {
    result.assignee_name = assigneeMatch[1].trim()
    remaining = remaining.replace(assigneeMatch[0], assigneeMatch[0].replace(assigneeMatch[1], '')).trim()
    remaining = remaining.replace(/\b(?:assigned to|assigned|by)\s*/i, '').trim()
  }

  // Project extraction: "in Project X" or "project X"
  const projectMatch = remaining.match(/(?:in project|in|project)\s+([A-Za-z][A-Za-z0-9\s]*?)(?:\s+(?:assigned|by|during|for|since|before|after|last|this|q[1-4])|$)/i)
  if (projectMatch) {
    result.project_name = projectMatch[1].trim()
    remaining = remaining.replace(projectMatch[0], '').trim()
  }

  // Date range extraction
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() // 0-indexed

  // Quarter patterns: "Q1", "Q4 2024"
  const quarterMatch = remaining.match(/\bq([1-4])(?:\s+(\d{4}))?\b/i)
  if (quarterMatch) {
    const q = parseInt(quarterMatch[1])
    let year = quarterMatch[2] ? parseInt(quarterMatch[2]) : currentYear

    // If no year specified, use the most recent occurrence of that quarter
    if (!quarterMatch[2]) {
      const quarterStartMonth = (q - 1) * 3
      if (quarterStartMonth > currentMonth) {
        year = currentYear - 1
      }
    }

    const startMonth = (q - 1) * 3
    const endMonth = startMonth + 2
    result.date_range = {
      start: `${year}-${String(startMonth + 1).padStart(2, '0')}-01`,
      end: `${year}-${String(endMonth + 1).padStart(2, '0')}-${endMonth === 1 ? (year % 4 === 0 ? '29' : '28') : [3, 5, 8, 10].includes(endMonth) ? '30' : '31'}`,
    }
    remaining = remaining.replace(quarterMatch[0], '').trim()
  }

  // "last week"
  if (/\blast\s+week\b/i.test(remaining)) {
    const lastWeekStart = new Date(now)
    lastWeekStart.setDate(now.getDate() - now.getDay() - 7)
    const lastWeekEnd = new Date(lastWeekStart)
    lastWeekEnd.setDate(lastWeekStart.getDate() + 6)
    result.date_range = {
      start: lastWeekStart.toISOString().split('T')[0],
      end: lastWeekEnd.toISOString().split('T')[0],
    }
    remaining = remaining.replace(/\blast\s+week\b/i, '').trim()
  }

  // "this month"
  if (/\bthis\s+month\b/i.test(remaining)) {
    const monthStart = new Date(currentYear, currentMonth, 1)
    const monthEnd = new Date(currentYear, currentMonth + 1, 0)
    result.date_range = {
      start: monthStart.toISOString().split('T')[0],
      end: monthEnd.toISOString().split('T')[0],
    }
    remaining = remaining.replace(/\bthis\s+month\b/i, '').trim()
  }

  // "last month"
  if (/\blast\s+month\b/i.test(remaining)) {
    const monthStart = new Date(currentYear, currentMonth - 1, 1)
    const monthEnd = new Date(currentYear, currentMonth, 0)
    result.date_range = {
      start: monthStart.toISOString().split('T')[0],
      end: monthEnd.toISOString().split('T')[0],
    }
    remaining = remaining.replace(/\blast\s+month\b/i, '').trim()
  }

  // Clean up remaining text for full-text search
  remaining = remaining.replace(/\s+/g, ' ').trim()
  // Remove stray prepositions left behind
  remaining = remaining.replace(/^(?:in|from|for|the|and|or|with)\s+/i, '').trim()
  remaining = remaining.replace(/\s+(?:in|from|for|the|and|or|with)$/i, '').trim()

  if (remaining.length > 0) {
    result.text_search = remaining
  }

  return result
}

export async function executeNLSearch(parsed: ParsedQuery) {
  const conditions: string[] = []
  const params: unknown[] = []
  let paramIndex = 1

  if (parsed.status) {
    conditions.push(`i.status = $${paramIndex++}`)
    params.push(parsed.status)
  }

  if (parsed.priority) {
    conditions.push(`i.priority = $${paramIndex++}`)
    params.push(parsed.priority)
  }

  if (parsed.assignee_name) {
    conditions.push(`LOWER(u.name) LIKE $${paramIndex++}`)
    params.push(`%${parsed.assignee_name.toLowerCase()}%`)
  }

  if (parsed.project_name) {
    conditions.push(`LOWER(p.name) LIKE $${paramIndex++}`)
    params.push(`%${parsed.project_name.toLowerCase()}%`)
  }

  if (parsed.date_range) {
    conditions.push(`i.created_at >= $${paramIndex++}`)
    params.push(parsed.date_range.start)
    conditions.push(`i.created_at <= $${paramIndex++}`)
    params.push(parsed.date_range.end + 'T23:59:59.999Z')
  }

  if (parsed.text_search) {
    conditions.push(`(LOWER(i.title) LIKE $${paramIndex} OR LOWER(i.description) LIKE $${paramIndex})`)
    params.push(`%${parsed.text_search.toLowerCase()}%`)
    paramIndex++
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const query = `
    SELECT
      i.*,
      u.name as assignee_name,
      u.avatar_url as assignee_avatar,
      m.name as milestone_name,
      p.name as project_name,
      (SELECT COUNT(*)::int FROM comments c WHERE c.issue_id = i.id) as comment_count,
      (SELECT COUNT(*)::int FROM attachments a WHERE a.issue_id = i.id) as attachment_count
    FROM issues i
    LEFT JOIN users u ON u.id = i.assignee_id
    LEFT JOIN milestones m ON m.id = i.milestone_id
    LEFT JOIN projects p ON p.id = i.project_id
    ${whereClause}
    ORDER BY i.priority ASC, i.updated_at DESC
    LIMIT 100
  `

  const { rows } = await sql.query(query, params)
  return rows
}
