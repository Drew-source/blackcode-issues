'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Calendar,
  Target,
  CheckCircle2,
} from 'lucide-react'

interface Milestone {
  id: number
  name: string
  description?: string
  due_date?: string
  project_id: number
  project_name?: string
  issue_count: number
  completed_issues: number
  created_at: string
}

export default function MilestonesPage() {
  const [showNewMilestone, setShowNewMilestone] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState<Milestone | null>(null)
  const queryClient = useQueryClient()

  const { data: milestones = [], isLoading } = useQuery<Milestone[]>({
    queryKey: ['all-milestones'],
    queryFn: async () => {
      const res = await fetch('/api/milestones')
      if (!res.ok) throw new Error('Failed to fetch milestones')
      return res.json()
    },
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) return []
      return res.json()
    },
  })

  const createMilestone = useMutation({
    mutationFn: async (data: {
      project_id: number
      name: string
      description?: string
      due_date?: string
    }) => {
      const res = await fetch('/api/milestones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to create milestone')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-milestones'] })
      setShowNewMilestone(false)
      toast.success('Milestone created!')
    },
    onError: () => {
      toast.error('Failed to create milestone')
    },
  })

  const updateMilestone = useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: number
      data: Partial<Milestone>
    }) => {
      const res = await fetch(`/api/milestones/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error('Failed to update milestone')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-milestones'] })
      setEditingMilestone(null)
      toast.success('Milestone updated!')
    },
    onError: () => {
      toast.error('Failed to update milestone')
    },
  })

  const deleteMilestone = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/milestones/${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error('Failed to delete milestone')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-milestones'] })
      toast.success('Milestone deleted!')
    },
    onError: () => {
      toast.error('Failed to delete milestone')
    },
  })

  // Group milestones by project
  const milestonesByProject = milestones.reduce((acc, milestone) => {
    const projectId = milestone.project_id
    if (!acc[projectId]) {
      acc[projectId] = {
        project_id: projectId,
        project_name: milestone.project_name || `Project #${projectId}`,
        milestones: [],
      }
    }
    acc[projectId].milestones.push(milestone)
    return acc
  }, {} as Record<number, { project_id: number; project_name: string; milestones: Milestone[] }>)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/80 backdrop-blur border-b border-border">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Milestones</h1>
              <p className="text-sm text-muted-foreground mt-1">
                {milestones.length} milestone{milestones.length !== 1 ? 's' : ''} across{' '}
                {Object.keys(milestonesByProject).length} project
                {Object.keys(milestonesByProject).length !== 1 ? 's' : ''}
              </p>
            </div>
            <button
              onClick={() => setShowNewMilestone(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={18} />
              New Milestone
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="p-6">
        {isLoading ? (
          <div className="space-y-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-48 bg-card rounded-lg border border-border animate-pulse" />
            ))}
          </div>
        ) : Object.keys(milestonesByProject).length === 0 ? (
          <div className="text-center py-24">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary rounded-2xl mb-4">
              <Target className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No milestones yet</h2>
            <p className="text-muted-foreground mb-6">
              Create your first milestone to track project goals
            </p>
            <button
              onClick={() => setShowNewMilestone(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus size={18} />
              Create Milestone
            </button>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.values(milestonesByProject).map((group) => (
              <div key={group.project_id}>
                <div className="flex items-center gap-2 mb-4">
                  <Link
                    href={`/dashboard/${group.project_id}`}
                    className="text-lg font-semibold hover:text-primary transition-colors"
                  >
                    {group.project_name}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    ({group.milestones.length} milestone{group.milestones.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {group.milestones.map((milestone) => {
                    const progress =
                      milestone.issue_count > 0
                        ? (milestone.completed_issues / milestone.issue_count) * 100
                        : 0

                    return (
                      <motion.div
                        key={milestone.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-card rounded-lg border border-border p-5 hover:border-primary/50 transition-all group"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <Link
                            href={`/dashboard/milestones/${milestone.id}`}
                            className="flex-1 hover:text-primary transition-colors"
                          >
                            <h3 className="font-semibold mb-1">{milestone.name}</h3>
                            {milestone.description && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {milestone.description}
                              </p>
                            )}
                          </Link>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditingMilestone(milestone)
                              }}
                              className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
                            >
                              <Edit2 size={16} />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (
                                  confirm(
                                    'Are you sure you want to delete this milestone?'
                                  )
                                ) {
                                  deleteMilestone.mutate(milestone.id)
                                }
                              }}
                              className="p-1.5 hover:bg-secondary rounded-md transition-colors text-destructive hover:text-destructive"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>

                        <Link href={`/dashboard/milestones/${milestone.id}`}>
                          {milestone.due_date && (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                              <Calendar size={14} />
                              <span>{format(new Date(milestone.due_date), 'MMM d, yyyy')}</span>
                            </div>
                          )}

                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="font-medium">
                                {milestone.completed_issues} / {milestone.issue_count}
                                <span className="ml-1 text-muted-foreground">
                                  ({Math.round(progress)}%)
                                </span>
                              </span>
                            </div>
                            <div className="h-2 bg-secondary rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  progress === 100
                                    ? 'bg-green-500'
                                    : progress >= 50
                                    ? 'bg-primary'
                                    : 'bg-amber-500'
                                }`}
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        </Link>
                      </motion.div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Milestone Modal */}
      <AnimatePresence>
        {showNewMilestone && (
          <MilestoneModal
            projects={projects}
            onClose={() => setShowNewMilestone(false)}
            onSave={(data) => createMilestone.mutate(data)}
            isLoading={createMilestone.isPending}
          />
        )}
      </AnimatePresence>

      {/* Edit Milestone Modal */}
      <AnimatePresence>
        {editingMilestone && (
          <MilestoneModal
            projects={projects}
            milestone={editingMilestone}
            onClose={() => setEditingMilestone(null)}
            onSave={(data) =>
              updateMilestone.mutate({ id: editingMilestone.id, data })
            }
            isLoading={updateMilestone.isPending}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function MilestoneModal({
  projects,
  milestone,
  onClose,
  onSave,
  isLoading,
}: {
  projects: any[]
  milestone?: Milestone
  onClose: () => void
  onSave: (data: {
    project_id: number
    name: string
    description?: string
    due_date?: string
  }) => void
  isLoading: boolean
}) {
  const [name, setName] = useState(milestone?.name || '')
  const [description, setDescription] = useState(milestone?.description || '')
  const [projectId, setProjectId] = useState<number>(
    milestone?.project_id || projects[0]?.id || 0
  )
  const [dueDate, setDueDate] = useState(
    milestone?.due_date ? format(new Date(milestone.due_date), 'yyyy-MM-dd') : ''
  )

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-0 flex items-center justify-center z-50 p-4"
      >
        <div
          className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-xl font-bold mb-6">
            {milestone ? 'Edit Milestone' : 'Create New Milestone'}
          </h2>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (name.trim() && projectId) {
                onSave({
                  project_id: projectId,
                  name: name.trim(),
                  description: description.trim() || undefined,
                  due_date: dueDate || undefined,
                })
              }
            }}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Project</label>
                <select
                  value={projectId}
                  onChange={(e) => setProjectId(parseInt(e.target.value))}
                  disabled={!!milestone}
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  required
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Milestone name"
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this milestone about?"
                  rows={3}
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Due Date</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim() || !projectId || isLoading}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : milestone ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </>
  )
}

