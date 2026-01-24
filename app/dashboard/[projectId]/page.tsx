import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'
import { authOptions } from '../../api/auth/[...nextauth]/route'
import { ProjectView } from '@/components/project-view'
import { getProject, getKanbanView } from '@/lib/db'

export default async function ProjectPage({
  params,
}: {
  params: { projectId: string }
}) {
  const session = await getServerSession(authOptions)

  if (!session) {
    redirect('/login')
  }

  const projectId = parseInt(params.projectId)
  const [project, kanban] = await Promise.all([
    getProject(projectId),
    getKanbanView(projectId),
  ])

  if (!project) {
    redirect('/dashboard')
  }

  return (
    <ProjectView
      project={project}
      initialKanban={kanban}
      user={session.user}
    />
  )
}

