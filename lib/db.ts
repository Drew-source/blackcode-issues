import { neon, neonConfig } from '@neondatabase/serverless'

// Configure Neon for serverless
neonConfig.fetchConnectionCache = true

// Initialize Neon client - wraps to match @vercel/postgres API
const neonSql = neon(process.env.DATABASE_URL!)

// Wrapper to return { rows } like @vercel/postgres
const sql = async (strings: TemplateStringsArray, ...values: any[]) => {
  const rows = await neonSql(strings, ...values)
  return { rows }
}

// For raw queries with parameters
sql.query = async (query: string, params: any[]) => {
  const rows = await neonSql(query, params)
  return { rows }
}

// ============================================
// PROJECTS
// ============================================

export async function getProjects(userId?: number) {
  // If userId provided, only return projects they're a member of
  // If not, return all projects (for admin/backwards compatibility)
  if (userId) {
    const { rows } = await sql`
      SELECT 
        p.*,
        pm.role as member_role,
        COUNT(i.id)::int as issue_count,
        COUNT(i.id) FILTER (WHERE i.status NOT IN ('done', 'cancelled'))::int as open_issues
      FROM projects p
      INNER JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = ${userId}
      LEFT JOIN issues i ON i.project_id = p.id
      GROUP BY p.id, pm.role
      ORDER BY p.updated_at DESC
    `
    return rows
  }
  
  const { rows } = await sql`
    SELECT 
      p.*,
      COUNT(i.id)::int as issue_count,
      COUNT(i.id) FILTER (WHERE i.status NOT IN ('done', 'cancelled'))::int as open_issues
    FROM projects p
    LEFT JOIN issues i ON i.project_id = p.id
    GROUP BY p.id
    ORDER BY p.updated_at DESC
  `
  return rows
}

export async function getProject(id: number) {
  const { rows } = await sql`
    SELECT * FROM projects WHERE id = ${id}
  `
  return rows[0] || null
}

export async function createProject(data: { name: string; description?: string; owner_id?: number }) {
  const { rows } = await sql`
    INSERT INTO projects (name, description, owner_id)
    VALUES (${data.name}, ${data.description || null}, ${data.owner_id || null})
    RETURNING *
  `
  const project = rows[0]
  
  // Automatically add creator as project owner
  if (data.owner_id && project) {
    await addProjectMember(project.id, data.owner_id, 'owner')
  }
  
  return project
}

export async function updateProject(id: number, data: Partial<{ name: string; description: string; status: string }>) {
  const updates = []
  const values = []
  let idx = 1

  if (data.name !== undefined) {
    updates.push(`name = $${idx++}`)
    values.push(data.name)
  }
  if (data.description !== undefined) {
    updates.push(`description = $${idx++}`)
    values.push(data.description)
  }
  if (data.status !== undefined) {
    updates.push(`status = $${idx++}`)
    values.push(data.status)
  }

  if (updates.length === 0) return null

  updates.push('updated_at = NOW()')
  values.push(id)

  const query = `
    UPDATE projects 
    SET ${updates.join(', ')} 
    WHERE id = $${idx}
    RETURNING *
  `
  
  const { rows } = await sql.query(query, values)
  return rows[0]
}

// ============================================
// ISSUES
// ============================================

export async function getIssues(projectId?: number, options?: {
  status?: string
  priority?: number
  assignee_id?: number
  milestone_id?: number
  limit?: number
  offset?: number
}) {
  let query = `
    SELECT 
      i.*,
      u.name as assignee_name,
      u.avatar_url as assignee_avatar,
      m.name as milestone_name,
      (SELECT COUNT(*)::int FROM comments c WHERE c.issue_id = i.id) as comment_count,
      (SELECT COUNT(*)::int FROM attachments a WHERE a.issue_id = i.id) as attachment_count
    FROM issues i
    LEFT JOIN users u ON u.id = i.assignee_id
    LEFT JOIN milestones m ON m.id = i.milestone_id
    WHERE 1=1
  `
  const params: any[] = []
  let paramIdx = 1

  if (projectId) {
    query += ` AND i.project_id = $${paramIdx++}`
    params.push(projectId)
  }
  if (options?.status) {
    query += ` AND i.status = $${paramIdx++}`
    params.push(options.status)
  }
  if (options?.priority) {
    query += ` AND i.priority = $${paramIdx++}`
    params.push(options.priority)
  }
  if (options?.assignee_id) {
    query += ` AND i.assignee_id = $${paramIdx++}`
    params.push(options.assignee_id)
  }
  if (options?.milestone_id) {
    query += ` AND i.milestone_id = $${paramIdx++}`
    params.push(options.milestone_id)
  }

  query += ` ORDER BY i.priority ASC, i.updated_at DESC`

  if (options?.limit) {
    query += ` LIMIT $${paramIdx++}`
    params.push(options.limit)
  }
  if (options?.offset) {
    query += ` OFFSET $${paramIdx++}`
    params.push(options.offset)
  }

  const { rows } = await sql.query(query, params)
  return rows
}

export async function getIssue(id: number) {
  const { rows } = await sql`
    SELECT 
      i.*,
      u.name as assignee_name,
      u.avatar_url as assignee_avatar,
      m.name as milestone_name,
      (SELECT COUNT(*)::int FROM comments c WHERE c.issue_id = i.id) as comment_count,
      (SELECT COUNT(*)::int FROM attachments a WHERE a.issue_id = i.id) as attachment_count
    FROM issues i
    LEFT JOIN users u ON u.id = i.assignee_id
    LEFT JOIN milestones m ON m.id = i.milestone_id
    WHERE i.id = ${id}
  `
  return rows[0] || null
}

export async function createIssue(data: {
  project_id: number
  title: string
  description?: string
  status?: string
  priority?: number
  assignee_id?: number
  milestone_id?: number
  reporter_id?: number
}) {
  const { rows } = await sql`
    INSERT INTO issues (
      project_id, title, description, status, priority, 
      assignee_id, milestone_id, reporter_id
    )
    VALUES (
      ${data.project_id}, 
      ${data.title}, 
      ${data.description || null}, 
      ${data.status || 'backlog'}, 
      ${data.priority || 3},
      ${data.assignee_id || null}, 
      ${data.milestone_id || null}, 
      ${data.reporter_id || null}
    )
    RETURNING *
  `
  return rows[0]
}

export async function updateIssue(id: number, data: Partial<{
  title: string
  description: string
  status: string
  priority: number
  assignee_id: number | null
  milestone_id: number | null
}>) {
  const updates: string[] = []
  const values: any[] = []
  let idx = 1

  if (data.title !== undefined) {
    updates.push(`title = $${idx++}`)
    values.push(data.title)
  }
  if (data.description !== undefined) {
    updates.push(`description = $${idx++}`)
    values.push(data.description)
  }
  if (data.status !== undefined) {
    updates.push(`status = $${idx++}`)
    values.push(data.status)
  }
  if (data.priority !== undefined) {
    updates.push(`priority = $${idx++}`)
    values.push(data.priority)
  }
  if (data.assignee_id !== undefined) {
    updates.push(`assignee_id = $${idx++}`)
    values.push(data.assignee_id)
  }
  if (data.milestone_id !== undefined) {
    updates.push(`milestone_id = $${idx++}`)
    values.push(data.milestone_id)
  }

  if (updates.length === 0) return null

  updates.push('updated_at = NOW()')
  values.push(id)

  const query = `
    UPDATE issues 
    SET ${updates.join(', ')} 
    WHERE id = $${idx}
    RETURNING *
  `
  
  const { rows } = await sql.query(query, values)
  return rows[0]
}

export async function deleteIssue(id: number) {
  await sql`DELETE FROM issues WHERE id = ${id}`
}

// ============================================
// KANBAN VIEW
// ============================================

export async function getKanbanView(projectId: number) {
  const issues = await getIssues(projectId)
  
  const kanban: Record<string, typeof issues> = {
    backlog: [],
    todo: [],
    in_progress: [],
    blocked: [],
    in_review: [],
    done: [],
  }

  for (const issue of issues) {
    if (kanban[issue.status]) {
      kanban[issue.status].push(issue)
    } else {
      kanban.backlog.push(issue)
    }
  }

  return kanban
}

// ============================================
// MILESTONES
// ============================================

export async function getMilestones(projectId: number) {
  const { rows } = await sql`
    SELECT 
      m.*,
      COUNT(i.id)::int as issue_count,
      COUNT(i.id) FILTER (WHERE i.status = 'done')::int as completed_issues
    FROM milestones m
    LEFT JOIN issues i ON i.milestone_id = m.id
    WHERE m.project_id = ${projectId}
    GROUP BY m.id
    ORDER BY m.due_date ASC NULLS LAST
  `
  return rows
}

export async function createMilestone(data: {
  project_id: number
  name: string
  description?: string
  due_date?: string
}) {
  const { rows } = await sql`
    INSERT INTO milestones (project_id, name, description, due_date)
    VALUES (${data.project_id}, ${data.name}, ${data.description || null}, ${data.due_date || null})
    RETURNING *
  `
  return rows[0]
}

// ============================================
// COMMENTS
// ============================================

export async function getComments(issueId: number) {
  const { rows } = await sql`
    SELECT 
      c.*,
      u.name as author_name,
      u.avatar_url as author_avatar
    FROM comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.issue_id = ${issueId}
    ORDER BY c.created_at ASC
  `
  return rows
}

export async function createComment(data: {
  issue_id: number
  user_id: number
  content: string
}) {
  const { rows } = await sql`
    INSERT INTO comments (issue_id, user_id, content)
    VALUES (${data.issue_id}, ${data.user_id}, ${data.content})
    RETURNING *
  `
  return rows[0]
}

// ============================================
// PROJECT MEMBERS
// ============================================

export async function getProjectMembers(projectId: number) {
  const { rows } = await sql`
    SELECT 
      pm.*,
      u.name,
      u.email,
      u.avatar_url
    FROM project_members pm
    JOIN users u ON u.id = pm.user_id
    WHERE pm.project_id = ${projectId}
    ORDER BY pm.role, u.name
  `
  return rows
}

export async function addProjectMember(projectId: number, userId: number, role: string = 'member') {
  const { rows } = await sql`
    INSERT INTO project_members (project_id, user_id, role)
    VALUES (${projectId}, ${userId}, ${role})
    ON CONFLICT (project_id, user_id) DO UPDATE SET role = ${role}
    RETURNING *
  `
  return rows[0]
}

export async function removeProjectMember(projectId: number, userId: number) {
  await sql`
    DELETE FROM project_members 
    WHERE project_id = ${projectId} AND user_id = ${userId}
  `
}

export async function isProjectMember(projectId: number, userId: number): Promise<boolean> {
  const { rows } = await sql`
    SELECT 1 FROM project_members 
    WHERE project_id = ${projectId} AND user_id = ${userId}
  `
  return rows.length > 0
}

export async function getProjectMemberRole(projectId: number, userId: number): Promise<string | null> {
  const { rows } = await sql`
    SELECT role FROM project_members 
    WHERE project_id = ${projectId} AND user_id = ${userId}
  `
  return rows[0]?.role || null
}

// ============================================
// USERS
// ============================================

export async function getUsers() {
  const { rows } = await sql`
    SELECT id, name, email, avatar_url, role
    FROM users
    ORDER BY name ASC
  `
  return rows
}

export async function getUserByEmail(email: string) {
  const { rows } = await sql`
    SELECT * FROM users WHERE email = ${email}
  `
  return rows[0] || null
}

// ============================================
// TRANSACTION LOG (for rollback)
// ============================================

export async function logTransaction(data: {
  user_id: number
  operation_type: string
  table_name: string
  record_id: number
  old_data?: any
  new_data?: any
}) {
  const { rows } = await sql`
    INSERT INTO transaction_log (
      user_id, operation_type, table_name, record_id, old_data, new_data
    )
    VALUES (
      ${data.user_id}, 
      ${data.operation_type}, 
      ${data.table_name}, 
      ${data.record_id},
      ${data.old_data ? JSON.stringify(data.old_data) : null},
      ${data.new_data ? JSON.stringify(data.new_data) : null}
    )
    RETURNING *
  `
  return rows[0]
}

export async function getTransactionLog(limit = 50) {
  const { rows } = await sql`
    SELECT * FROM transaction_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows
}

export async function undoLastOperations(userId: number, count = 1) {
  // Get last N operations for this user
  const { rows: operations } = await sql`
    SELECT * FROM transaction_log
    WHERE user_id = ${userId} AND rolled_back = false
    ORDER BY created_at DESC
    LIMIT ${count}
  `

  const results = []
  for (const op of operations) {
    // Restore old data
    if (op.operation_type === 'UPDATE' && op.old_data) {
      await sql.query(
        `UPDATE ${op.table_name} SET ${Object.keys(op.old_data).map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${Object.keys(op.old_data).length + 1}`,
        [...Object.values(op.old_data), op.record_id]
      )
    } else if (op.operation_type === 'INSERT') {
      await sql.query(`DELETE FROM ${op.table_name} WHERE id = $1`, [op.record_id])
    } else if (op.operation_type === 'DELETE' && op.old_data) {
      const cols = Object.keys(op.old_data)
      const vals = Object.values(op.old_data)
      await sql.query(
        `INSERT INTO ${op.table_name} (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
        vals
      )
    }

    // Mark as rolled back
    await sql`UPDATE transaction_log SET rolled_back = true WHERE id = ${op.id}`
    results.push(op)
  }

  return results
}

