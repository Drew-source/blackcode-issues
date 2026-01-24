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
  const [projectData, kanban] = await Promise.all([
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

  return (
    <KanbanBoard
      project={project}
      initialKanban={kanban}
      user={session.user}
    />
  )
}
