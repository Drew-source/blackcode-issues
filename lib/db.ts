import { neon, neonConfig } from '@neondatabase/serverless'

// Configure Neon for serverless
neonConfig.fetchConnectionCache = true

// Type definitions
export interface Project {
  id: number
  name: string
  description?: string
  status?: string
  owner_id?: number
  priority?: string
  visibility?: string
  color?: string
  icon_url?: string
  banner_url?: string
  start_date?: string
  end_date?: string
  created_at?: string
  updated_at?: string
}

export interface User {
  id: number
  email: string
  name?: string
  avatar_url?: string
  created_at?: string
}

export interface Issue {
  id: number
  project_id: number
  title: string
  description?: string
  status: string
  priority: number
  assignee_id?: number
  assignee_name?: string
  assignee_avatar?: string
  milestone_id?: number
  milestone_name?: string
  start_date?: string
  due_date?: string
  estimated_hours?: number
  comment_count?: number
  attachment_count?: number
  created_at?: string
  updated_at?: string
}

// Initialize Neon client - supports both tagged template and raw query forms
const neonSql = neon(process.env.DATABASE_URL!)

// Type for raw query support (neon supports both forms)
type NeonSql = typeof neonSql & ((query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>)

// Wrapper to return { rows } like @vercel/postgres
const sqlTagged = async (strings: TemplateStringsArray, ...values: unknown[]): Promise<{ rows: Record<string, unknown>[] }> => {
  const rows = await neonSql(strings, ...values)
  return { rows: rows as Record<string, unknown>[] }
}

// For parameterized queries with dynamic SQL strings
// Neon's sql function supports: sql('SELECT * FROM t WHERE id = $1', [1])
const sqlQuery = async (query: string, params: unknown[] = []): Promise<{ rows: Record<string, unknown>[] }> => {
  try {
    const rows = await (neonSql as NeonSql)(query, params)
    return { rows: rows as Record<string, unknown>[] }
  } catch (error) {
    console.error('SQL query error:', error, { query, params })
    throw error
  }
}

// Combined interface
const sql = Object.assign(sqlTagged, { query: sqlQuery })

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

export async function getProject(id: number): Promise<Project | null> {
  const { rows } = await sql`
    SELECT * FROM projects WHERE id = ${id}
  `
  return (rows[0] as unknown as Project) || null
}

export async function createProject(data: { name: string; description?: string; owner_id?: number }): Promise<Project | null> {
  const { rows } = await sql`
    INSERT INTO projects (name, description, owner_id)
    VALUES (${data.name}, ${data.description || null}, ${data.owner_id || null})
    RETURNING *
  `
  const project = rows[0] as unknown as Project | undefined
  
  // Automatically add creator as project owner
  if (data.owner_id && project) {
    await addProjectMember(project.id, data.owner_id, 'owner')
  }
  
  return project || null
}

export async function updateProject(id: number, data: Partial<{
  name: string
  description: string
  status: string
  priority: string
  visibility: string
  color: string
  icon_url: string | null
  banner_url: string | null
  start_date: string | null
  end_date: string | null
  owner_id: number | null
}>): Promise<Project | null> {
  // Get current project first
  const current = await getProject(id)
  if (!current) return null

  // Merge with updates
  const name = data.name !== undefined ? data.name : current.name
  const description = data.description !== undefined ? data.description : current.description
  const status = data.status !== undefined ? data.status : current.status
  const priority = data.priority !== undefined ? data.priority : current.priority
  const visibility = data.visibility !== undefined ? data.visibility : current.visibility
  const color = data.color !== undefined ? data.color : current.color
  const icon_url = data.icon_url !== undefined ? data.icon_url : current.icon_url
  const banner_url = data.banner_url !== undefined ? data.banner_url : current.banner_url
  const start_date = data.start_date !== undefined ? data.start_date : current.start_date
  const end_date = data.end_date !== undefined ? data.end_date : current.end_date
  const owner_id = data.owner_id !== undefined ? data.owner_id : current.owner_id

  const { rows } = await sql`
    UPDATE projects
    SET
      name = ${name},
      description = ${description},
      status = ${status},
      priority = ${priority},
      visibility = ${visibility},
      color = ${color},
      icon_url = ${icon_url},
      banner_url = ${banner_url},
      start_date = ${start_date},
      end_date = ${end_date},
      owner_id = ${owner_id},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return (rows[0] as unknown as Project) || null
}

export async function deleteProject(id: number): Promise<void> {
  await sql`DELETE FROM projects WHERE id = ${id}`
}

// ============================================
// ISSUES
// ============================================

// NOTE: getIssues with dynamic queries deprecated due to Neon serverless incompatibility
// Use getIssuesByProject() or getAllIssuesWithProjects() instead

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
  return (rows[0] as unknown as Issue) || null
}

export async function updateIssue(id: number, data: Partial<{
  title: string
  description: string
  status: string
  priority: number
  assignee_id: number | null
  milestone_id: number | null
  start_date: string | null
  due_date: string | null
}>) {
  // Get current issue first
  const current = await getIssue(id)
  if (!current) return null

  // Merge with updates
  const title = data.title !== undefined ? data.title : current.title
  const description = data.description !== undefined ? data.description : current.description
  const status = data.status !== undefined ? data.status : current.status
  const priority = data.priority !== undefined ? data.priority : current.priority
  const assignee_id = data.assignee_id !== undefined ? data.assignee_id : current.assignee_id
  const milestone_id = data.milestone_id !== undefined ? data.milestone_id : current.milestone_id
  const start_date = data.start_date !== undefined ? data.start_date : (current as any).start_date
  const due_date = data.due_date !== undefined ? data.due_date : (current as any).due_date

  const { rows } = await sql`
    UPDATE issues 
    SET 
      title = ${title},
      description = ${description},
      status = ${status},
      priority = ${priority},
      assignee_id = ${assignee_id},
      milestone_id = ${milestone_id},
      start_date = ${start_date},
      due_date = ${due_date},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return (rows[0] as unknown as Issue) || null
}

export async function deleteIssue(id: number) {
  await sql`DELETE FROM issues WHERE id = ${id}`
}

// ============================================
// KANBAN VIEW
// ============================================

// Simple issues fetch using tagged template (avoids sql.query issues)
export async function getIssuesByProject(projectId: number): Promise<Issue[]> {
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
  `
  return rows as unknown as Issue[]
}

// Get all issues with project info (for All Issues page)
export async function getAllIssuesWithProjects(): Promise<Issue[]> {
  const { rows } = await sql`
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
    ORDER BY i.priority ASC, i.updated_at DESC
  `
  return rows as unknown as Issue[]
}

export async function getKanbanView(projectId: number) {
  // Use the simpler tagged template version to avoid sql.query issues
  const issues = await getIssuesByProject(projectId)
  
  const kanban: Record<string, Issue[]> = {
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

export async function getAllMilestones() {
  const { rows } = await sql`
    SELECT 
      m.*,
      p.name as project_name,
      COUNT(i.id)::int as issue_count,
      COUNT(i.id) FILTER (WHERE i.status = 'done')::int as completed_issues
    FROM milestones m
    LEFT JOIN projects p ON p.id = m.project_id
    LEFT JOIN issues i ON i.milestone_id = m.id
    GROUP BY m.id, p.name
    ORDER BY m.due_date ASC NULLS LAST
  `
  return rows
}

export async function getMilestone(id: number) {
  const { rows } = await sql`
    SELECT * FROM milestones WHERE id = ${id}
  `
  return rows[0] || null
}

export async function getMilestoneWithDetails(id: number) {
  const { rows } = await sql`
    SELECT
      m.*,
      p.name as project_name,
      COUNT(i.id)::int as issue_count,
      COUNT(i.id) FILTER (WHERE i.status = 'done')::int as completed_issues
    FROM milestones m
    LEFT JOIN projects p ON p.id = m.project_id
    LEFT JOIN issues i ON i.milestone_id = m.id
    WHERE m.id = ${id}
    GROUP BY m.id, p.name
  `
  return rows[0] || null
}

export async function getIssuesByMilestone(milestoneId: number): Promise<Issue[]> {
  const { rows } = await sql`
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
    WHERE i.milestone_id = ${milestoneId}
    ORDER BY i.priority ASC, i.updated_at DESC
  `
  return rows as unknown as Issue[]
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
  return rows[0] || null
}

export async function updateMilestone(id: number, data: Partial<{
  name: string
  description: string
  due_date: string
}>) {
  // Get current milestone first
  const current = await getMilestone(id)
  if (!current) return null

  // Merge with updates
  const name = data.name !== undefined ? data.name : current.name
  const description = data.description !== undefined ? data.description : current.description
  const due_date = data.due_date !== undefined ? data.due_date : current.due_date

  const { rows } = await sql`
    UPDATE milestones 
    SET 
      name = ${name},
      description = ${description},
      due_date = ${due_date},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `
  return rows[0] || null
}

export async function deleteMilestone(id: number) {
  await sql`DELETE FROM milestones WHERE id = ${id}`
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
  return rows[0] || null
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
  return rows[0] || null
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

export async function getUserByEmail(email: string): Promise<User | null> {
  const { rows } = await sql`
    SELECT * FROM users WHERE email = ${email}
  `
  return (rows[0] as unknown as User) || null
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
  return rows[0] || null
}

export async function getTransactionLog(limit = 50) {
  const { rows } = await sql`
    SELECT * FROM transaction_log
    ORDER BY created_at DESC
    LIMIT ${limit}
  `
  return rows
}

export async function getActivityFeed(limit = 50, offset = 0) {
  const { rows } = await sql`
    SELECT 
      t.*,
      u.name as user_name,
      u.avatar_url as user_avatar
    FROM transaction_log t
    LEFT JOIN users u ON u.id = t.user_id
    ORDER BY t.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
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
    try {
      // Only handle issue updates for now (most common case)
      // Dynamic SQL doesn't work with Neon serverless
      if (op.table_name === 'issues' && op.operation_type === 'UPDATE' && op.old_data) {
        const old = op.old_data as any
        await sql`
          UPDATE issues 
          SET 
            title = ${old.title},
            description = ${old.description},
            status = ${old.status},
            priority = ${old.priority},
            assignee_id = ${old.assignee_id},
            milestone_id = ${old.milestone_id},
            updated_at = NOW()
          WHERE id = ${op.record_id}
        `
      } else if (op.table_name === 'issues' && op.operation_type === 'INSERT') {
        await sql`DELETE FROM issues WHERE id = ${op.record_id}`
      }
      // Other table operations not supported due to Neon serverless limitations

      // Mark as rolled back
      await sql`UPDATE transaction_log SET rolled_back = true WHERE id = ${op.id}`
      results.push(op)
    } catch (error) {
      console.error('Undo operation failed:', error)
    }
  }

  return results
}

// ============================================
// ANALYTICS
// ============================================

export async function getAnalytics() {
  // Issues by status
  const { rows: issuesByStatus } = await sql`
    SELECT status, COUNT(*)::int as count
    FROM issues
    GROUP BY status
    ORDER BY count DESC
  `

  // Issues by project
  const { rows: issuesByProject } = await sql`
    SELECT 
      p.id,
      p.name,
      COUNT(i.id)::int as count
    FROM projects p
    LEFT JOIN issues i ON i.project_id = p.id
    GROUP BY p.id, p.name
    ORDER BY count DESC
    LIMIT 10
  `

  // Top assignees
  const { rows: topAssignees } = await sql`
    SELECT 
      u.id,
      u.name,
      u.avatar_url,
      COUNT(i.id)::int as count
    FROM users u
    INNER JOIN issues i ON i.assignee_id = u.id
    GROUP BY u.id, u.name, u.avatar_url
    ORDER BY count DESC
    LIMIT 10
  `

  // Issues created per day (last 30 days)
  const { rows: issuesOverTime } = await sql`
    SELECT 
      DATE(created_at) as date,
      COUNT(*)::int as count
    FROM issues
    WHERE created_at >= NOW() - INTERVAL '30 days'
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `

  return {
    issuesByStatus,
    issuesByProject,
    topAssignees,
    issuesOverTime,
  }
}

// ============================================
// ATTACHMENTS
// ============================================

export interface Attachment {
  id: number
  issue_id: number
  filename: string
  file_url: string
  file_size?: number
  mime_type?: string
  uploaded_by?: number
  uploader_name?: string
  uploader_avatar?: string
  created_at?: string
}

export async function getAttachments(issueId: number): Promise<Attachment[]> {
  const { rows } = await sql`
    SELECT
      a.*,
      u.name as uploader_name,
      u.avatar_url as uploader_avatar
    FROM attachments a
    LEFT JOIN users u ON u.id = a.uploaded_by
    WHERE a.issue_id = ${issueId}
    ORDER BY a.created_at DESC
  `
  return rows as unknown as Attachment[]
}

export async function createAttachment(data: {
  issue_id: number
  filename: string
  file_url: string
  file_size?: number
  mime_type?: string
  uploaded_by?: number
}): Promise<Attachment | null> {
  const { rows } = await sql`
    INSERT INTO attachments (issue_id, filename, file_url, file_size, mime_type, uploaded_by)
    VALUES (
      ${data.issue_id},
      ${data.filename},
      ${data.file_url},
      ${data.file_size || null},
      ${data.mime_type || null},
      ${data.uploaded_by || null}
    )
    RETURNING *
  `
  return (rows[0] as unknown as Attachment) || null
}

export async function deleteAttachment(id: number): Promise<void> {
  await sql`DELETE FROM attachments WHERE id = ${id}`
}

export async function getAttachment(id: number): Promise<Attachment | null> {
  const { rows } = await sql`
    SELECT * FROM attachments WHERE id = ${id}
  `
  return (rows[0] as unknown as Attachment) || null
}

// ============================================
// ACTIVITY HISTORY
// ============================================

export async function getIssueActivity(issueId: number) {
  // Get comments
  const { rows: comments } = await sql`
    SELECT
      c.id,
      'comment' as type,
      c.content,
      c.user_id,
      u.name as user_name,
      u.avatar_url as user_avatar,
      c.created_at
    FROM comments c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.issue_id = ${issueId}
    ORDER BY c.created_at DESC
  `

  // Get changes from transaction log
  const { rows: changes } = await sql`
    SELECT
      t.id,
      'change' as type,
      t.operation_type,
      t.old_data,
      t.new_data,
      t.user_id,
      u.name as user_name,
      u.avatar_url as user_avatar,
      t.created_at
    FROM transaction_log t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.table_name = 'issues' AND t.record_id = ${issueId}
    ORDER BY t.created_at DESC
    LIMIT 50
  `

  // Combine and sort by date
  const activity = [...comments, ...changes].sort(
    (a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime()
  )

  return activity
}

