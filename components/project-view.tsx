'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { KanbanBoard } from './kanban-board'
import { GanttView } from './gantt-view'

interface Project {
  id: number
  name: string
  description?: string
}

interface User {
  id?: number
  name?: string | null
  email?: string | null
  image?: string | null
}

interface KanbanData {
  [status: string]: any[]
}

export function ProjectView({
  project,
  initialKanban,
  user,
}: {
  project: Project
  initialKanban: KanbanData
  user: User
}) {
  const [view, setView] = useState<'kanban' | 'timeline'>('kanban')
  const [allIssues, setAllIssues] = useState<any[]>(() => {
    // Flatten kanban data to get all issues
    return Object.values(initialKanban).flat()
  })

  // Fetch all issues for Gantt view
  const { data: ganttIssues = allIssues } = useQuery({
    queryKey: ['project-issues', project.id],
    queryFn: async () => {
      const res = await fetch(`/api/issues?project_id=${project.id}&includeProject=true`)
      if (!res.ok) return allIssues
      return res.json()
    },
    enabled: view === 'timeline',
    initialData: allIssues,
  })

  return (
    <>
      {/* View Toggle - will be rendered in KanbanBoard/GanttView header */}
      {view === 'kanban' ? (
        <KanbanBoard
          project={project}
          initialKanban={initialKanban}
          user={user}
          view={view}
          onViewChange={setView}
        />
      ) : (
        <GanttView
          project={project}
          issues={ganttIssues}
          user={user}
          view={view}
          onViewChange={setView}
        />
      )}
    </>
  )
}

