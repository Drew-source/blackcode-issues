'use client'

import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import DOMPurify from 'dompurify'
import { useCallback, useRef } from 'react'

// Validate URL to prevent javascript: protocol XSS attacks
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Code,
  Link as LinkIcon,
  Image as ImageIcon,
  Heading1,
  Heading2,
  Quote,
  Undo,
  Redo,
  Strikethrough,
} from 'lucide-react'

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  editable?: boolean
  onImageUpload?: (file: File) => Promise<string>
}

interface MenuButtonProps {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  children: React.ReactNode
  title: string
}

function MenuButton({ onClick, isActive, disabled, children, title }: MenuButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={isActive}
      className={`p-1.5 rounded hover:bg-secondary transition-colors ${
        isActive ? 'bg-secondary text-primary' : 'text-muted-foreground'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {children}
    </button>
  )
}

interface MenuBarProps {
  editor: Editor
  onImageUpload?: (file: File) => Promise<string>
}

function MenuBar({ editor, onImageUpload }: MenuBarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const setLink = useCallback(() => {
    const previousUrl = editor.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)

    if (url === null) {
      return
    }

    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    // Validate URL to prevent XSS
    if (!isValidUrl(url)) {
      alert('Please enter a valid URL starting with http:// or https://')
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const handleImageUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !onImageUpload) return

    try {
      const url = await onImageUpload(file)
      editor.chain().focus().setImage({ src: url }).run()
    } catch (error) {
      console.error('Failed to upload image:', error)
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [editor, onImageUpload])

  const addImageFromUrl = useCallback(() => {
    const url = window.prompt('Image URL')
    if (url) {
      // Validate URL to prevent XSS
      if (!isValidUrl(url)) {
        alert('Please enter a valid URL starting with http:// or https://')
        return
      }
      editor.chain().focus().setImage({ src: url }).run()
    }
  }, [editor])

  return (
    <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-border bg-secondary/30">
      <MenuButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive('bold')}
        title="Bold (Ctrl+B)"
      >
        <Bold size={16} />
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive('italic')}
        title="Italic (Ctrl+I)"
      >
        <Italic size={16} />
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleStrike().run()}
        isActive={editor.isActive('strike')}
        title="Strikethrough"
      >
        <Strikethrough size={16} />
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleCode().run()}
        isActive={editor.isActive('code')}
        title="Inline Code"
      >
        <Code size={16} />
      </MenuButton>

      <div className="w-px h-5 bg-border mx-1" />

      <MenuButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        isActive={editor.isActive('heading', { level: 1 })}
        title="Heading 1"
      >
        <Heading1 size={16} />
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive('heading', { level: 2 })}
        title="Heading 2"
      >
        <Heading2 size={16} />
      </MenuButton>

      <div className="w-px h-5 bg-border mx-1" />

      <MenuButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive('bulletList')}
        title="Bullet List"
      >
        <List size={16} />
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive('orderedList')}
        title="Numbered List"
      >
        <ListOrdered size={16} />
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive('blockquote')}
        title="Blockquote"
      >
        <Quote size={16} />
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        isActive={editor.isActive('codeBlock')}
        title="Code Block"
      >
        <Code size={16} className="rotate-45" />
      </MenuButton>

      <div className="w-px h-5 bg-border mx-1" />

      <MenuButton
        onClick={setLink}
        isActive={editor.isActive('link')}
        title="Add Link"
      >
        <LinkIcon size={16} />
      </MenuButton>

      {onImageUpload ? (
        <>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            accept="image/*"
            className="hidden"
          />
          <MenuButton
            onClick={() => fileInputRef.current?.click()}
            title="Upload Image"
          >
            <ImageIcon size={16} />
          </MenuButton>
        </>
      ) : (
        <MenuButton
          onClick={addImageFromUrl}
          title="Add Image from URL"
        >
          <ImageIcon size={16} />
        </MenuButton>
      )}

      <div className="w-px h-5 bg-border mx-1" />

      <MenuButton
        onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()}
        title="Undo (Ctrl+Z)"
      >
        <Undo size={16} />
      </MenuButton>

      <MenuButton
        onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()}
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo size={16} />
      </MenuButton>
    </div>
  )
}

export function RichTextEditor({
  content,
  onChange,
  placeholder = 'Write something...',
  editable = true,
  onImageUpload,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full rounded-lg',
        },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline hover:no-underline',
        },
      }),
    ],
    content,
    editable,
    onUpdate: ({ editor }: { editor: Editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[150px] p-4',
      },
    },
  })

  if (!editor) {
    return (
      <div className="border border-input rounded-lg bg-background">
        <div className="h-10 border-b border-border bg-secondary/30 animate-pulse" />
        <div className="h-[150px] p-4 animate-pulse" />
      </div>
    )
  }

  return (
    <div className="border border-input rounded-lg bg-background overflow-hidden">
      {editable && <MenuBar editor={editor} onImageUpload={onImageUpload} />}
      <EditorContent editor={editor} />
      {editable && !content && (
        <style jsx global>{`
          .ProseMirror p.is-editor-empty:first-child::before {
            content: '${placeholder}';
            float: left;
            color: hsl(var(--muted-foreground));
            pointer-events: none;
            height: 0;
          }
        `}</style>
      )}
    </div>
  )
}

// Read-only HTML renderer for displaying rich content
export function RichTextDisplay({ content }: { content: string }) {
  // Sanitize HTML content to prevent XSS attacks
  const sanitizedContent = typeof window !== 'undefined'
    ? DOMPurify.sanitize(content)
    : content

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({
        HTMLAttributes: {
          class: 'max-w-full rounded-lg',
        },
      }),
      Link.configure({
        openOnClick: true,
        HTMLAttributes: {
          class: 'text-primary underline hover:no-underline',
        },
      }),
    ],
    content: sanitizedContent,
    editable: false,
  })

  if (!editor) {
    return <div className="animate-pulse h-20 bg-secondary/20 rounded" />
  }

  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <EditorContent editor={editor} />
    </div>
  )
}
