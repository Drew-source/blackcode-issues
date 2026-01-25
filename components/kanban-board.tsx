'use client'

import { useState, useCallback } from 'react'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import Link from 'next/link'
import Image from 'next/image'
import {
  ArrowLeft,
  Plus,
  MoreHorizontal,
  MessageSquare,
  Paperclip,
  Clock,
  AlertCircle,
  ChevronDown,
  Search,
  Filter,
  Calendar,
  User2,
  Tag,
  Undo2,
  X,
  LayoutGrid,
  List,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

// Status configuration
const STATUSES = [
  { id: 'backlog', label: 'Backlog', color: 'gray' },
  { id: 'todo', label: 'To Do', color: 'blue' },
  { id: 'in_progress', label: 'In Progress', color: 'amber' },
  { id: 'blocked', label: 'Blocked', color: 'red' },
  { id: 'in_review', label: 'In Review', color: 'purple' },
  { id: 'done', label: 'Done', color: 'green' },
] as const

const PRIORITY_CONFIG = {
  1: { label: 'Urgent', color: 'text-red-500', bg: 'bg-red-500/10' },
  2: { label: 'High', color: 'text-amber-500', bg: 'bg-amber-500/10' },
  3: { label: 'Medium', color: 'text-blue-500', bg: 'bg-blue-500/10' },
  4: { label: 'Low', color: 'text-gray-500', bg: 'bg-gray-500/10' },
  5: { label: 'None', color: 'text-gray-400', bg: 'bg-gray-400/10' },
} as const

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

interface Project {
  id: number
  name: string
  description?: string
}

interface KanbanData {
  [status: string]: Issue[]
}

interface User {
  name?: string | null
  email?: string | null
  image?: string | null
}

export function KanbanBoard({
  project,
  initialKanban,
  user,
  view = 'kanban',
  onViewChange,
}: {
  project: Project
  initialKanban: KanbanData
  user: User
  view?: 'kanban' | 'timeline'
  onViewChange?: (view: 'kanban' | 'timeline') => void
}) {
  const [kanban, setKanban] = useState<KanbanData>(initialKanban)
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewIssue, setShowNewIssue] = useState<string | null>(null)
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [priorityFilter, setPriorityFilter] = useState<number | null>(null)
  const [assigneeFilter, setAssigneeFilter] = useState<boolean | null>(null) // true = assigned, false = unassigned, null = all
  const queryClient = useQueryClient()

  // Fetch fresh data to keep kanban in sync
  useQuery({
    queryKey: ['project-issues', project.id],
    queryFn: async () => {
      const res = await fetch(`/api/issues?project_id=${project.id}`)
      if (!res.ok) throw new Error('Failed to fetch issues')
      const issues: Issue[] = await res.json()
      
      // Group issues by status
      const grouped: KanbanData = {}
      for (const issue of issues) {
        if (!grouped[issue.status]) {
          grouped[issue.status] = []
        }
        grouped[issue.status].push(issue)
      }
      
      // Update local state with fresh data
      setKanban(grouped)
      return grouped
    },
    refetchOnWindowFocus: true,
    staleTime: 10000, // Consider data stale after 10 seconds
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  const updateIssueStatus = useMutation({
    mutationFn: async ({ issueId, status }: { issueId: number; status: string }) => {
      const res = await fetch(`/api/issues/${issueId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        console.error('Update failed:', errorData)
        throw new Error('Failed to update issue')
      }
      return res.json()
    },
    onSuccess: () => {
      // Invalidate caches to ensure persistence
      queryClient.invalidateQueries({ queryKey: ['all-issues'] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (error) => {
      console.error('Mutation error:', error)
      toast.error('Failed to update issue')
      // Revert optimistic update by refetching
      queryClient.invalidateQueries({ queryKey: ['project-issues', project.id] })
    },
  })

  const createIssue = useMutation({
    mutationFn: async (data: {
      title: string
      description?: string
      status: string
      priority?: number
      assignee_id?: number
      milestone_id?: number
    }) => {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          project_id: project.id,
        }),
      })
      if (!res.ok) throw new Error('Failed to create issue')
      return res.json()
    },
    onSuccess: (newIssue, variables) => {
      // Optimistic update to local state
      setKanban((prev) => ({
        ...prev,
        [variables.status]: [...(prev[variables.status] || []), newIssue],
      }))
      setShowNewIssue(null)
      toast.success('Issue created!')
      // Invalidate all related caches to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['all-issues'] })
      queryClient.invalidateQueries({ queryKey: ['project-issues', project.id] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: () => {
      toast.error('Failed to create issue')
    },
  })

  const handleDragEnd = useCallback((result: DropResult) => {
    const { source, destination, draggableId } = result

    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const issueId = parseInt(draggableId)
    const sourceStatus = source.droppableId
    const destStatus = destination.droppableId

    // Optimistic update
    setKanban((prev) => {
      const newKanban = { ...prev }
      const sourceItems = [...(newKanban[sourceStatus] || [])]
      const destItems = sourceStatus === destStatus ? sourceItems : [...(newKanban[destStatus] || [])]
      
      const [movedItem] = sourceItems.splice(source.index, 1)
      movedItem.status = destStatus
      destItems.splice(destination.index, 0, movedItem)

      newKanban[sourceStatus] = sourceItems
      if (sourceStatus !== destStatus) {
        newKanban[destStatus] = destItems
      }

      return newKanban
    })

    // Update server
    if (sourceStatus !== destStatus) {
      updateIssueStatus.mutate({ issueId, status: destStatus })
    }
  }, [updateIssueStatus])

  // Filter issues by search query, priority, and assignee
  const filterIssues = (issues: Issue[]) => {
    return issues.filter((issue) => {
      // Search query filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        if (!issue.title.toLowerCase().includes(query) && !issue.id.toString().includes(query)) {
          return false
        }
      }
      
      // Priority filter
      if (priorityFilter !== null && issue.priority !== priorityFilter) {
        return false
      }
      
      // Assignee filter
      if (assigneeFilter === true && !issue.assignee_id) {
        return false
      }
      if (assigneeFilter === false && issue.assignee_id) {
        return false
      }
      
      return true
    })
  }
  
  const activeFiltersCount = (priorityFilter !== null ? 1 : 0) + (assigneeFilter !== null ? 1 : 0)

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-card/80 backdrop-blur border-b border-border">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="p-2 hover:bg-secondary rounded-lg transition-colors"
              >
                <ArrowLeft size={20} />
              </Link>
              <div>
                <h1 className="text-xl font-bold">{project.name}</h1>
                <p className="text-sm text-muted-foreground">
                  #{project.id} • {Object.values(kanban).flat().length} issues
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* View Toggle */}
              {onViewChange && (
                <div className="flex items-center gap-1 bg-background border border-input rounded-lg p-1">
                  <button
                    onClick={() => onViewChange('kanban')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      view === 'kanban'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <LayoutGrid size={16} className="inline mr-1.5" />
                    Kanban
                  </button>
                  <button
                    onClick={() => onViewChange('timeline')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      view === 'timeline'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <List size={16} className="inline mr-1.5" />
                    Timeline
                  </button>
                </div>
              )}

              {/* Search */}
              <div className="relative">
                <Search
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 pl-9 pr-4 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {/* Filters */}
              <div className="relative">
                <button 
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-2 px-3 py-2 bg-background border border-input rounded-lg text-sm hover:bg-secondary transition-colors ${activeFiltersCount > 0 ? 'border-primary' : ''}`}
                >
                  <Filter size={16} />
                  Filters
                  {activeFiltersCount > 0 && (
                    <span className="px-1.5 py-0.5 bg-primary text-primary-foreground text-xs rounded-full">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
                
                {showFilters && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-card border border-border rounded-lg shadow-lg p-4 z-30">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium text-sm">Filters</span>
                      {activeFiltersCount > 0 && (
                        <button
                          onClick={() => {
                            setPriorityFilter(null)
                            setAssigneeFilter(null)
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear all
                        </button>
                      )}
                    </div>
                    
                    {/* Priority filter */}
                    <div className="mb-3">
                      <label className="block text-xs text-muted-foreground mb-1.5">Priority</label>
                      <select
                        value={priorityFilter ?? ''}
                        onChange={(e) => setPriorityFilter(e.target.value ? parseInt(e.target.value) : null)}
                        className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-sm"
                      >
                        <option value="">All priorities</option>
                        <option value="1">Urgent</option>
                        <option value="2">High</option>
                        <option value="3">Medium</option>
                        <option value="4">Low</option>
                      </select>
                    </div>
                    
                    {/* Assignee filter */}
                    <div>
                      <label className="block text-xs text-muted-foreground mb-1.5">Assignee</label>
                      <select
                        value={assigneeFilter === null ? '' : assigneeFilter ? 'assigned' : 'unassigned'}
                        onChange={(e) => {
                          if (e.target.value === '') setAssigneeFilter(null)
                          else if (e.target.value === 'assigned') setAssigneeFilter(true)
                          else setAssigneeFilter(false)
                        }}
                        className="w-full px-2 py-1.5 bg-background border border-input rounded-md text-sm"
                      >
                        <option value="">All</option>
                        <option value="assigned">Assigned</option>
                        <option value="unassigned">Unassigned</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Rollback */}
              <button className="flex items-center gap-2 px-3 py-2 bg-background border border-input rounded-lg text-sm hover:bg-secondary transition-colors text-muted-foreground">
                <Undo2 size={16} />
                Undo
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Kanban board */}
      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="p-6">
          <div className="flex gap-6 overflow-x-auto pb-6">
            {STATUSES.map((status) => (
              <Column
                key={status.id}
                status={status}
                issues={filterIssues(kanban[status.id] || [])}
                projectId={project.id}
                onNewIssue={() => setShowNewIssue(status.id)}
                showNewIssue={showNewIssue === status.id}
                onCancelNewIssue={() => setShowNewIssue(null)}
                onCreateIssue={(data) =>
                  createIssue.mutate({ ...data, status: status.id })
                }
                isCreating={createIssue.isPending}
                onSelectIssue={setSelectedIssue}
              />
            ))}
          </div>
        </div>
      </DragDropContext>

      {/* Issue detail modal */}
      <AnimatePresence>
        {selectedIssue && (
          <IssueDetailModal
            issue={selectedIssue}
            onClose={() => setSelectedIssue(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function Column({
  status,
  issues,
  projectId,
  onNewIssue,
  showNewIssue,
  onCancelNewIssue,
  onCreateIssue,
  isCreating,
  onSelectIssue,
}: {
  status: typeof STATUSES[number]
  issues: Issue[]
  projectId: number
  onNewIssue: () => void
  showNewIssue: boolean
  onCancelNewIssue: () => void
  onCreateIssue: (data: {
    title: string
    description?: string
    priority?: number
    assignee_id?: number
    milestone_id?: number
  }) => void
  isCreating: boolean
  onSelectIssue: (issue: Issue) => void
}) {
  const [newTitle, setNewTitle] = useState('')
  const [showExpanded, setShowExpanded] = useState(false)
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<number>(3)
  const [assigneeId, setAssigneeId] = useState<number | undefined>(undefined)
  const [milestoneId, setMilestoneId] = useState<number | undefined>(undefined)

  const resetForm = () => {
    setNewTitle('')
    setDescription('')
    setPriority(3)
    setAssigneeId(undefined)
    setMilestoneId(undefined)
    setShowExpanded(false)
  }

  // Fetch project members and milestones
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/members`)
      if (!res.ok) return []
      return res.json()
    },
  })

  const { data: milestones = [] } = useQuery({
    queryKey: ['milestones', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/milestones?project_id=${projectId}`)
      if (!res.ok) return []
      return res.json()
    },
  })

  const colorClasses = {
    gray: 'bg-gray-500',
    blue: 'bg-blue-500',
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    purple: 'bg-purple-500',
    green: 'bg-green-500',
  }

  return (
    <div className="flex-shrink-0 w-80">
      {/* Column header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${colorClasses[status.color]}`} />
          <span className="font-medium">{status.label}</span>
          <span className="text-sm text-muted-foreground ml-1">
            {issues.length}
          </span>
        </div>
        <button
          onClick={onNewIssue}
          className="p-1.5 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
        >
          <Plus size={16} />
        </button>
      </div>

      {/* Droppable area */}
      <Droppable droppableId={status.id}>
        {(provided, snapshot) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className={`kanban-column transition-colors ${
              snapshot.isDraggingOver ? 'bg-primary/5 border-primary/20 border-2 border-dashed' : ''
            }`}
          >
            {/* New issue form */}
            <AnimatePresence>
              {showNewIssue && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="mb-3"
                >
                  <div className="bg-card rounded-lg border border-primary p-3 shadow-lg space-y-3">
                    <input
                      autoFocus
                      placeholder="Issue title..."
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && newTitle.trim() && !showExpanded) {
                          e.preventDefault()
                          onCreateIssue({ title: newTitle.trim() })
                          resetForm()
                        }
                        if (e.key === 'Escape') {
                          resetForm()
                          onCancelNewIssue()
                        }
                      }}
                      className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    />

                    {showExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-3"
                      >
                        <textarea
                          placeholder="Description (optional)..."
                          value={description}
                          onChange={(e) => setDescription(e.target.value)}
                          className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                          rows={3}
                        />

                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={priority}
                            onChange={(e) => setPriority(parseInt(e.target.value))}
                            className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value={1}>Urgent</option>
                            <option value={2}>High</option>
                            <option value={3}>Medium</option>
                            <option value={4}>Low</option>
                          </select>

                          <select
                            value={assigneeId || ''}
                            onChange={(e) =>
                              setAssigneeId(e.target.value ? parseInt(e.target.value) : undefined)
                            }
                            className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">Unassigned</option>
                            {members.map((m: any) => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.name || m.email}
                              </option>
                            ))}
                          </select>
                        </div>

                        <select
                          value={milestoneId || ''}
                          onChange={(e) =>
                            setMilestoneId(e.target.value ? parseInt(e.target.value) : undefined)
                          }
                          className="w-full px-2 py-1.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          <option value="">No milestone</option>
                          {milestones.map((m: any) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </motion.div>
                    )}

                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setShowExpanded(!showExpanded)}
                        className="text-xs text-muted-foreground hover:text-foreground"
                      >
                        {showExpanded ? 'Less' : 'More options'}
                      </button>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            resetForm()
                            onCancelNewIssue()
                          }}
                          className="px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (newTitle.trim()) {
                              onCreateIssue({
                                title: newTitle.trim(),
                                description: description.trim() || undefined,
                                priority,
                                assignee_id: assigneeId,
                                milestone_id: milestoneId,
                              })
                              resetForm()
                            }
                          }}
                          disabled={!newTitle.trim() || isCreating}
                          className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded-md disabled:opacity-50"
                        >
                          {isCreating ? '...' : 'Create'}
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Issues */}
            {issues.map((issue, index) => (
              <Draggable
                key={issue.id}
                draggableId={issue.id.toString()}
                index={index}
              >
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    {...provided.dragHandleProps}
                  >
                    <IssueCard
                      issue={issue}
                      isDragging={snapshot.isDragging}
                      onClick={() => onSelectIssue(issue)}
                    />
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  )
}

function IssueCard({
  issue,
  isDragging,
  onClick,
}: {
  issue: Issue
  isDragging: boolean
  onClick: () => void
}) {
  const priority = PRIORITY_CONFIG[issue.priority as keyof typeof PRIORITY_CONFIG]

  return (
    <motion.div
      layout
      onClick={onClick}
      className={`kanban-card mb-3 ${isDragging ? 'shadow-xl ring-2 ring-primary' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs text-muted-foreground font-mono">
          #{issue.id}
        </span>
        {priority && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${priority.bg} ${priority.color}`}>
            {priority.label}
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="font-medium text-sm mb-3 line-clamp-2">{issue.title}</h4>

      {/* Meta */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-3">
          {issue.comment_count > 0 && (
            <span className="flex items-center gap-1">
              <MessageSquare size={12} />
              {issue.comment_count}
            </span>
          )}
          {issue.attachment_count > 0 && (
            <span className="flex items-center gap-1">
              <Paperclip size={12} />
              {issue.attachment_count}
            </span>
          )}
        </div>

        {/* Assignee */}
        {issue.assignee_avatar ? (
          <Image
            src={issue.assignee_avatar}
            alt={issue.assignee_name || 'Assignee'}
            width={20}
            height={20}
            className="rounded-full"
            title={issue.assignee_name}
          />
        ) : issue.assignee_name ? (
          <div
            className="w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center text-[10px] font-medium"
            title={issue.assignee_name}
          >
            {issue.assignee_name.charAt(0)}
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}

function IssueDetailModal({
  issue,
  onClose,
}: {
  issue: Issue
  onClose: () => void
}) {
  const priority = PRIORITY_CONFIG[issue.priority as keyof typeof PRIORITY_CONFIG]
  const status = STATUSES.find((s) => s.id === issue.status)

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
      />

      {/* Modal */}
      <motion.div
        initial={{ opacity: 0, x: 100 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 100 }}
        className="fixed right-0 top-0 h-full w-full max-w-xl bg-card border-l border-border shadow-2xl z-50 overflow-y-auto"
      >
        {/* Header */}
        <div className="sticky top-0 bg-card/80 backdrop-blur border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-mono text-muted-foreground">
              #{issue.id}
            </span>
            <button
              onClick={onClose}
              className="p-2 hover:bg-secondary rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">{issue.title}</h1>

          {/* Properties */}
          <div className="space-y-4 mb-8">
            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className={`status-badge status-${issue.status}`}>
                {status?.label}
              </span>
            </div>

            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Priority</span>
              {priority && (
                <span className={`text-sm ${priority.color}`}>
                  {priority.label}
                </span>
              )}
            </div>

            {issue.assignee_name && (
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Assignee</span>
                <div className="flex items-center gap-2">
                  {issue.assignee_avatar && (
                    <Image
                      src={issue.assignee_avatar}
                      alt={issue.assignee_name}
                      width={20}
                      height={20}
                      className="rounded-full"
                    />
                  )}
                  <span className="text-sm">{issue.assignee_name}</span>
                </div>
              </div>
            )}

            {issue.milestone_name && (
              <div className="flex items-center justify-between py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">Milestone</span>
                <span className="text-sm">{issue.milestone_name}</span>
              </div>
            )}

            <div className="flex items-center justify-between py-2 border-b border-border">
              <span className="text-sm text-muted-foreground">Created</span>
              <span className="text-sm text-muted-foreground">
                {formatDistanceToNow(new Date(issue.created_at))} ago
              </span>
            </div>
          </div>

          {/* Description */}
          {issue.description && (
            <div className="mb-8">
              <h3 className="text-sm font-medium mb-2">Description</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {issue.description}
              </p>
            </div>
          )}

          {/* Comments */}
          <div>
            <h3 className="text-sm font-medium mb-4">
              Comments ({issue.comment_count})
            </h3>
            <div className="bg-secondary/50 rounded-lg p-4 text-center text-sm text-muted-foreground">
              Comments will appear here
            </div>
          </div>
        </div>
      </motion.div>
    </>
  )
}

