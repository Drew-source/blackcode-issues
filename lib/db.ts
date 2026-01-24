import { neon, neonConfig } from '@neondatabase/serverless'
import type { Project, Issue, KanbanData, Milestone, Comment, ProjectMember, TransactionLog } from '@/types'

// Configure Neon for serverless
neonConfig.fetchConnectionCache = true

// Initialize Neon client - wraps to match @vercel/postgres API
const neonSql = neon(process.env.DATABASE_URL!)

// Wrapper to return { rows } like @vercel/postgres
interface SqlFunction {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  query: (query: string, params: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
}

const baseSql = async (strings: TemplateStringsArray, ...values: unknown[]): Promise<{ rows: Record<string, unknown>[] }> => {
  const rows = await neonSql(strings, ...values)
  return { rows: rows as Record<string, unknown>[] }
}

// For raw queries with parameters - cast to any to bypass TS
const rawQuery = async (query: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }> => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = await (neonSql as any)(query, params)
  return { rows: rows as Record<string, unknown>[] }
}

// Combine into sql object
const sql = baseSql as SqlFunction
sql.query = rawQuery

// ============================================
// PROJECTS
// ============================================

export async function getProjects(userId?: number): Promise<Project[]> {
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
    return rows as unknown as Project[]
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
  return rows as unknown as Project[]
}

export async function getProject(id: number): Promise<Project | null> {
  const { rows } = await sql`
    SELECT * FROM projects WHERE id = ${id}
  `
  return (rows[0] as unknown as Project) || null
}

export async function createProject(data: { name: string; description?: string; owner_id?: number }): Promise<Project> {
  const { rows } = await sql`
    INSERT INTO projects (name, description, owner_id)
    VALUES (${data.name}, ${data.description || null}, ${data.owner_id || null})
    RETURNING *
  `
  const project = rows[0] as unknown as Project
  
  // Automatically add creator as project owner
  if (data.owner_id && project) {
    await addProjectMember(project.id, data.owner_id, 'owner')
  }
  
  return project
}

export async function updateProject(id: number, data: Partial<{ name: string; description: string; status: string }>): Promise<Project | null> {
  // Use tagged template literal - update all fields (null values are preserved)
  const { rows } = await sql`
    UPDATE projects 
    SET 
      name = COALESCE(${data.name ?? null}, name),
      description = COALESCE(${data.description ?? null}, description),
      status = COALESCE(${data.status ?? null}, status),
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return (rows[0] as unknown as Project) || null
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
}): Promise<Issue[]> {
  // Use tagged template literal for Neon compatibility
  // For complex filtering, we'd need multiple query variants
  if (projectId && !options?.status && !options?.priority && !options?.assignee_id && !options?.milestone_id) {
    // Simple case: just project_id filter (used by getKanbanView)
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
      WHERE i.project_id = ${projectId}
      ORDER BY i.priority ASC, i.updated_at DESC
      LIMIT ${options?.limit || 1000}
    `
    return rows as unknown as Issue[]
  }
  
  // All issues (no filter)
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
    ORDER BY i.priority ASC, i.updated_at DESC
    LIMIT 1000
  `
  return rows as unknown as Issue[]
}

export async function getIssue(id: number): Promise<Issue | null> {
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
  return (rows[0] as unknown as Issue) || null
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
}): Promise<Issue> {
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
  return rows[0] as unknown as Issue
}

export async function updateIssue(id: number, data: Partial<{
  title: string
  description: string
  status: string
  priority: number
  assignee_id: number | null
  milestone_id: number | null
}>): Promise<Issue | null> {
  // Use CASE to only update fields that were provided
  const { rows } = await sql`
    UPDATE issues 
    SET 
      title = CASE WHEN ${data.title !== undefined} THEN ${data.title ?? null} ELSE title END,
      description = CASE WHEN ${data.description !== undefined} THEN ${data.description ?? null} ELSE description END,
      status = CASE WHEN ${data.status !== undefined} THEN ${data.status ?? null} ELSE status END,
      priority = CASE WHEN ${data.priority !== undefined} THEN ${data.priority ?? null} ELSE priority END,
      assignee_id = CASE WHEN ${data.assignee_id !== undefined} THEN ${data.assignee_id ?? null} ELSE assignee_id END,
      milestone_id = CASE WHEN ${data.milestone_id !== undefined} THEN ${data.milestone_id ?? null} ELSE milestone_id END,
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return (rows[0] as unknown as Issue) || null
}

export async function deleteIssue(id: number): Promise<void> {
  await sql`DELETE FROM issues WHERE id = ${id}`
}

// ============================================
// KANBAN VIEW
// ============================================

export async function getKanbanView(projectId: number): Promise<KanbanData> {
  const issues = await getIssues(projectId)
  
  const kanban: KanbanData = {
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
  return (rows[0]?.role as string) || null
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

export async function getUserByEmail(email: string): Promise<{ id: number; name: string; email: string; avatar_url: string } | null> {
  const { rows } = await sql`
    SELECT * FROM users WHERE email = ${email}
  `
  return (rows[0] as { id: number; name: string; email: string; avatar_url: string }) || null
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
    // TODO: Implement proper rollback with dynamic table/column names
    // For now, just mark as rolled back (complex dynamic SQL not supported by Neon tagged templates)
    // Full rollback would need a different approach (stored procedures or multiple queries)
    
    // Mark as rolled back
    await sql`UPDATE transaction_log SET rolled_back = true WHERE id = ${(op as any).id}`
    results.push(op)
  }

  return results
}

