'use client'

import { useState, useCallback } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  X,
  Upload,
  FileText,
  ImageIcon,
  Trash2,
  Calendar,
} from 'lucide-react'
import { RichTextEditor } from './rich-text-editor'

const STATUSES = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'todo', label: 'To Do' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'blocked', label: 'Blocked' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
] as const

interface Project {
  id: number
  name: string
}

interface PendingAttachment {
  id: string
  file: File
  filename: string
  previewUrl?: string
  uploading: boolean
  uploadedUrl?: string
  error?: string
}

interface CreateIssueModalProps {
  projectId?: number
  defaultStatus?: string
  onClose: () => void
  onSuccess?: (issue: any) => void
}

function getFileIcon(mimeType?: string) {
  if (mimeType?.startsWith('image/')) return ImageIcon
  return FileText
}

export function CreateIssueModal({
  projectId,
  defaultStatus = 'backlog',
  onClose,
  onSuccess,
}: CreateIssueModalProps) {
  const queryClient = useQueryClient()

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState(defaultStatus)
  const [priority, setPriority] = useState<number>(3)
  const [assigneeId, setAssigneeId] = useState<number | null>(null)
  const [milestoneId, setMilestoneId] = useState<number | null>(null)
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(projectId || null)
  const [startDate, setStartDate] = useState('')
  const [dueDate, setDueDate] = useState('')

  // Attachments state
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([])
  const [isUploading, setIsUploading] = useState(false)

  // Fetch projects for dropdown (if no projectId provided)
  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: async () => {
      const res = await fetch('/api/projects')
      if (!res.ok) throw new Error('Failed to fetch projects')
      return res.json()
    },
    enabled: !projectId,
  })

  // Fetch project members for assignee dropdown
  const { data: members = [] } = useQuery({
    queryKey: ['project-members', selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return []
      const res = await fetch(`/api/projects/${selectedProjectId}/members`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!selectedProjectId,
  })

  // Fetch milestones for dropdown
  const { data: milestones = [] } = useQuery({
    queryKey: ['milestones', selectedProjectId],
    queryFn: async () => {
      if (!selectedProjectId) return []
      const res = await fetch(`/api/milestones?project_id=${selectedProjectId}`)
      if (!res.ok) return []
      return res.json()
    },
    enabled: !!selectedProjectId,
  })

  // Image upload handler for rich text editor
  const handleImageUpload = useCallback(async (file: File): Promise<string> => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })

    if (!res.ok) {
      throw new Error('Failed to upload image')
    }

    const data = await res.json()
    return data.url
  }, [])

  // File attachment handler
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files || files.length === 0) return

    const newAttachments: PendingAttachment[] = []

    for (const file of Array.from(files)) {
      const attachment: PendingAttachment = {
        id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
        file,
        filename: file.name,
        uploading: true,
      }

      // Create preview URL for images
      if (file.type.startsWith('image/')) {
        attachment.previewUrl = URL.createObjectURL(file)
      }

      newAttachments.push(attachment)
    }

    setPendingAttachments(prev => [...prev, ...newAttachments])
    setIsUploading(true)

    // Upload each file
    for (const attachment of newAttachments) {
      try {
        const formData = new FormData()
        formData.append('file', attachment.file)

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          throw new Error('Failed to upload')
        }

        const data = await res.json()

        setPendingAttachments(prev =>
          prev.map(a =>
            a.id === attachment.id
              ? { ...a, uploading: false, uploadedUrl: data.url }
              : a
          )
        )
      } catch (error) {
        setPendingAttachments(prev =>
          prev.map(a =>
            a.id === attachment.id
              ? { ...a, uploading: false, error: 'Failed to upload' }
              : a
          )
        )
      }
    }

    setIsUploading(false)
    // Reset input
    event.target.value = ''
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments(prev => {
      const attachment = prev.find(a => a.id === id)
      if (attachment?.previewUrl) {
        URL.revokeObjectURL(attachment.previewUrl)
      }
      return prev.filter(a => a.id !== id)
    })
  }, [])

  // Create issue mutation
  const createIssue = useMutation({
    mutationFn: async () => {
      if (!selectedProjectId) throw new Error('No project selected')
      if (!title.trim()) throw new Error('Title is required')

      // Create the issue
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: selectedProjectId,
          title: title.trim(),
          description: description || undefined,
          status,
          priority,
          assignee_id: assigneeId || undefined,
          milestone_id: milestoneId || undefined,
          start_date: startDate || undefined,
          due_date: dueDate || undefined,
        }),
      })

      if (!res.ok) throw new Error('Failed to create issue')
      const newIssue = await res.json()

      // Create attachment records for uploaded files
      const successfulAttachments = pendingAttachments.filter(a => a.uploadedUrl)

      for (const attachment of successfulAttachments) {
        await fetch(`/api/issues/${newIssue.id}/attachments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: attachment.filename,
            file_url: attachment.uploadedUrl,
            file_size: attachment.file.size,
            mime_type: attachment.file.type,
          }),
        })
      }

      return newIssue
    },
    onSuccess: (newIssue) => {
      // Invalidate relevant caches
      queryClient.invalidateQueries({ queryKey: ['all-issues'] })
      queryClient.invalidateQueries({ queryKey: ['project-issues', selectedProjectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })

      toast.success('Issue created!')
      onSuccess?.(newIssue)
      onClose()
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create issue')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) {
      toast.error('Title is required')
      return
    }
    if (!selectedProjectId) {
      toast.error('Please select a project')
      return
    }
    createIssue.mutate()
  }

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
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed inset-4 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-3xl md:max-h-[90vh] bg-card rounded-2xl border border-border shadow-2xl z-50 flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
          <h2 className="text-xl font-bold">Create New Issue</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-secondary rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Project Selection (if not pre-selected) */}
            {!projectId && (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Project <span className="text-red-500">*</span>
                </label>
                <select
                  value={selectedProjectId || ''}
                  onChange={(e) => {
                    setSelectedProjectId(e.target.value ? parseInt(e.target.value) : null)
                    setAssigneeId(null)
                    setMilestoneId(null)
                  }}
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                  required
                >
                  <option value="">Select a project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                autoFocus
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Description
              </label>
              <RichTextEditor
                content={description}
                onChange={setDescription}
                placeholder="Describe the issue in detail... Add images, code blocks, lists, and more."
                onImageUpload={handleImageUpload}
              />
            </div>

            {/* Status and Priority */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {STATUSES.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(parseInt(e.target.value))}
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value={1}>Urgent</option>
                  <option value={2}>High</option>
                  <option value={3}>Medium</option>
                  <option value={4}>Low</option>
                </select>
              </div>
            </div>

            {/* Assignee and Milestone */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Assignee
                </label>
                <select
                  value={assigneeId || ''}
                  onChange={(e) => setAssigneeId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={!selectedProjectId}
                >
                  <option value="">Unassigned</option>
                  {members.map((m: any) => (
                    <option key={m.user_id} value={m.user_id}>
                      {m.name || m.email}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Milestone
                </label>
                <select
                  value={milestoneId || ''}
                  onChange={(e) => setMilestoneId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                  disabled={!selectedProjectId}
                >
                  <option value="">No milestone</option>
                  {milestones.map((m: any) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  <Calendar size={14} className="inline mr-1" />
                  Start Date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  <Calendar size={14} className="inline mr-1" />
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>

            {/* Attachments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium">
                  Attachments
                </label>
                <label className="flex items-center gap-2 px-3 py-1.5 bg-secondary text-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 cursor-pointer">
                  <Upload size={16} />
                  {isUploading ? 'Uploading...' : 'Add files'}
                  <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    disabled={isUploading}
                    className="hidden"
                    accept="image/*,application/pdf,text/plain,application/json,text/markdown"
                  />
                </label>
              </div>

              {pendingAttachments.length > 0 && (
                <div className="space-y-2 mt-3">
                  {pendingAttachments.map((attachment) => {
                    const FileIcon = getFileIcon(attachment.file.type)
                    const isImage = attachment.file.type.startsWith('image/')

                    return (
                      <div
                        key={attachment.id}
                        className={`flex items-center gap-3 p-3 bg-secondary/50 rounded-lg ${
                          attachment.error ? 'border border-red-500/50' : ''
                        }`}
                      >
                        {isImage && attachment.previewUrl ? (
                          <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0">
                            <img
                              src={attachment.previewUrl}
                              alt={attachment.filename}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-10 h-10 bg-primary/10 rounded flex items-center justify-center flex-shrink-0">
                            <FileIcon size={20} className="text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{attachment.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {attachment.uploading
                              ? 'Uploading...'
                              : attachment.error
                              ? attachment.error
                              : 'Ready'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeAttachment(attachment.id)}
                          className="p-1.5 hover:bg-red-500/10 text-red-500 rounded transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-border bg-card flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!title.trim() || !selectedProjectId || createIssue.isPending || isUploading}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {createIssue.isPending ? 'Creating...' : 'Create Issue'}
            </button>
          </div>
        </form>
      </motion.div>
    </>
  )
}
