import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../../api/auth/[...nextauth]/route'
import { KanbanBoard } from '@/components/kanban-board'
import { getProject, getKanbanView } from '@/lib/db'

interface Project {
  id: number
  name: string
  description?: string
}

interface Issue {
  id: number
  title: string
  description?: string
  status: string
  priority: number
  assignee_id?: number
  assignee_name?: string
  assignee_avatar?: string
  milestone_id?: number
  milestone_name?: string
  labels?: string[]
  comment_count: number
  attachment_count: number
  created_at: string
  updated_at: string
}

interface KanbanData {
  [status: string]: Issue[]
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const { projectId: projectIdStr } = await params
  const projectId = parseInt(projectIdStr)
  const [projectData, kanbanData] = await Promise.all([
    getProject(projectId),
    getKanbanView(projectId),
  ])

  if (!projectData) {
    redirect('/dashboard')
  }

  const project: Project = {
    id: projectData.id,
    name: projectData.name,
    description: projectData.description,
  }

  // Type assertion for kanban data
  const kanban = kanbanData as KanbanData

  return (
    <KanbanBoard
      project={project}
      initialKanban={kanban}
      user={session.user}
    />
  )
}
