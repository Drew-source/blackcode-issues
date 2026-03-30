# Blackcode Issues - Project Context for AI Agents

> **Purpose of this document:** Provide a complete understanding of the Blackcode Issues project to any AI agent working on a companion project that will integrate with it. Read this fully before making architectural or integration decisions.

---

## What Is This?

**Blackcode Issues** is an issue/bounty tracking web application for a company called Blackcode. It serves two purposes:

1. **Internal issue tracking** - The Blackcode team posts issues (bugs, features, tasks) for their own projects.
2. **Paid bounty system (planned)** - External developers can browse issues, fork the relevant repo, implement fixes or features, submit their work, and get paid upon acceptance. The Blackcode team reviews submissions by testing forks.

Think of it as a hybrid between **Linear** (issue tracking) and **Gitcoin/Bountysource** (paid open-source bounties), built specifically for Blackcode's workflow.

**Status:** ~60-70% complete. Core issue tracking works. The bounty/payment flow is not yet implemented.

**Live URL:** https://blackcode-issues.vercel.app
**Repo:** https://github.com/Drew-source/blackcode-issues

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | **Next.js 16** (App Router) |
| Language | **TypeScript** |
| Database | **Neon PostgreSQL** (serverless) |
| DB Driver | **@neondatabase/serverless** (tagged template literals, NOT query strings) |
| Auth | **NextAuth.js v4** with Google OAuth |
| State | **TanStack React Query** (server state) + **Zustand** (client state) |
| Styling | **Tailwind CSS** with dark mode |
| Rich Text | **TipTap** editor |
| Drag & Drop | **@hello-pangea/dnd** |
| File Storage | **Vercel Blob** |
| Deployment | **Vercel** |

---

## Database Schema

### Core Tables

**users** - Synced from Google OAuth on login
- `id` (SERIAL PK), `google_id`, `email`, `name`, `avatar_url`, `role` ('admin' | 'member'), `last_login`, `created_at`, `updated_at`

**projects** - Top-level containers for issues
- `id` (SERIAL PK), `name`, `description`, `status`, `owner_id` (FK users), `created_at`, `updated_at`

**issues** - The central entity
- `id` (SERIAL PK), `project_id` (FK), `milestone_id` (FK, nullable), `title`, `description` (HTML from rich text editor), `status`, `priority` (1-5), `assignee_id` (FK users, nullable), `reporter_id` (FK users), `due_date`, `estimate_hours`, `start_date`, `created_at`, `updated_at`
- **Statuses:** `backlog`, `todo`, `in_progress`, `blocked`, `in_review`, `done`, `cancelled`
- **Priority:** 1=Urgent, 2=High, 3=Medium, 4=Low, 5=None

**comments** - Discussion threads on issues
- `id`, `issue_id` (FK), `user_id` (FK), `content`, `created_at`, `updated_at`

**attachments** - Files uploaded to issues
- `id`, `issue_id` (FK), `filename`, `file_url`, `file_size`, `mime_type`, `uploaded_by` (FK), `created_at`

**labels** - Color-coded tags (schema exists, UI not built)
- `id`, `project_id` (FK), `name`, `color`, `description`, `created_at`

**issue_labels** - Many-to-many junction for issues <-> labels

**milestones** - Sprint/release groupings
- `id`, `project_id` (FK), `name`, `description`, `due_date`, `status`, `created_at`, `updated_at`

**project_members** - Team roster per project
- `id`, `project_id` (FK), `user_id` (FK), `role` ('owner' | 'member' | 'viewer'), `joined_at`

**transaction_log** - Audit trail for undo support
- `id`, `user_id`, `operation_type` (INSERT | UPDATE | DELETE), `table_name`, `record_id`, `old_data` (JSONB), `new_data` (JSONB), `rolled_back`, `created_at`

### Important Notes
- All IDs are **integers** (SERIAL), not UUIDs
- The database uses **tagged template literals** with the Neon driver: `` sql`SELECT * FROM issues WHERE id = ${id}` ``
- Full-text search index exists on issues (title + description) but no search UI yet

---

## API Endpoints

All endpoints require authentication (NextAuth session) unless noted.

### Projects
```
GET    /api/projects                  - List projects for current user
POST   /api/projects                  - Create project
GET    /api/projects/[id]             - Get single project
PATCH  /api/projects/[id]             - Update project
DELETE /api/projects/[id]             - Delete project
GET    /api/projects/[id]/members     - List members
POST   /api/projects/[id]/members     - Add member (body: { email, role })
DELETE /api/projects/[id]/members     - Remove member (body: { userId })
```

### Issues
```
GET    /api/issues                    - List issues (?project_id=X&includeProject=true)
POST   /api/issues                    - Create issue (requires: project_id, title, status, priority)
GET    /api/issues/[id]               - Get issue with assignee + milestone details
PATCH  /api/issues/[id]               - Update any issue fields
DELETE /api/issues/[id]               - Delete issue
```

### Comments
```
GET    /api/issues/[id]/comments      - List comments on issue
POST   /api/issues/[id]/comments      - Add comment (body: { content })
```

### Attachments
```
GET    /api/issues/[id]/attachments   - List attachments
POST   /api/issues/[id]/attachments   - Create attachment record
DELETE /api/issues/[id]/attachments    - Delete attachment
```

### Activity
```
GET    /api/issues/[id]/activity      - Activity log for an issue
GET    /api/activity                   - Global activity feed
```

### Milestones
```
GET    /api/milestones                 - List milestones (?project_id=X)
POST   /api/milestones                 - Create milestone
GET    /api/milestones/[id]            - Get milestone with issue count
PATCH  /api/milestones/[id]            - Update milestone
DELETE /api/milestones/[id]            - Delete milestone
```

### Utilities
```
GET    /api/users                      - List all users
POST   /api/upload                     - Upload file to Vercel Blob (returns {url, filename, size})
POST   /api/admin/promote              - Bootstrap first admin (one-time)
POST   /api/migrate                    - Run DB migrations (admin only)
POST   /api/seed                       - Seed mock data (admin only)
```

---

## Authentication

- **Google OAuth** via NextAuth.js v4
- JWT strategy (no DB sessions)
- On sign-in, user is upserted into the `users` table
- Session includes: `user.id`, `user.email`, `user.name`, `user.image`, `user.role`
- Middleware protects all `/dashboard/*` and most `/api/*` routes
- Roles: `admin` (full access including migrations) and `member` (standard access)

---

## Application Pages & Features

### Working Features
- **Dashboard** (`/dashboard`) - Grid of projects with create/delete
- **Kanban Board** (`/dashboard/[projectId]`) - 6-column drag-and-drop board (Backlog, To Do, In Progress, Blocked, In Review, Done)
- **Issue Detail** (`/dashboard/issues/[id]`) - Full issue page with rich text description, sidebar metadata (assignee, priority, milestone, dates), comments, attachments, activity history
- **Issues List** (`/dashboard/issues`) - Filterable table of all issues across projects
- **Milestones** (`/dashboard/milestones`) - Create and manage milestones
- **Rich Text Editor** - TipTap with bold, italic, lists, code blocks, image uploads
- **File Attachments** - Upload via Vercel Blob
- **Dark Mode** - System detection + toggle
- **Timeline View** - Vertical feed grouped by date
- **Project Members** - Invite by email, assign roles

### Partially Built
- **Gantt Chart** - Exists but needs refinement
- **Analytics** (`/dashboard/analytics`) - Route exists, UI placeholder
- **Global Activity Feed** (`/dashboard/activity`) - Route exists, UI placeholder

### Not Yet Built
- **Labels UI** - Schema exists, no frontend
- **Search** - Full-text index exists, no search bar
- **Bounty/Payment System** - The external developer workflow (browse issues -> fork -> fix -> submit -> get paid)
- **Notifications**
- **Issue Templates**
- **Bulk Operations**

---

## Architecture: The Trinity System

Blackcode Issues is **Part 2** of a three-part architecture:

```
COMPANION (AI Desktop App)  <--MCP-->  BLACKCODE ISSUES (This App)  <--UI-->  HUMAN
```

1. **Companion** - An AI desktop application (separate project) that can interact with the computer, run code, take screenshots, etc.
2. **Blackcode Issues** - This web app. Acts as the persistent memory/task layer.
3. **Human** - The director who creates tasks, reviews work, and approves payments.

**Integration goal:** The Companion AI should be able to read issues, create issues with context/screenshots, update statuses, and log activity - all through the API endpoints listed above.

---

## Key Files for Integration

| File | What It Contains |
|------|-----------------|
| `lib/db.ts` | All 30+ database query functions - the complete data access layer |
| `lib/auth.ts` | NextAuth configuration and callbacks |
| `types/index.ts` | All shared TypeScript interfaces (User, Project, Issue, Comment, etc.) |
| `scripts/migrate.sql` | Complete database schema (~170 lines) |
| `middleware.ts` | Route protection rules |
| `app/api/` | All 19 API route handlers |

---

## What the Companion Project Needs to Know

If you are building a project that integrates with Blackcode Issues:

1. **All API calls require authentication.** You'll need a valid NextAuth session or need to implement an API key system (not yet built).
2. **Issue IDs are integers**, not UUIDs.
3. **Descriptions are HTML** (from TipTap rich text editor).
4. **Statuses are specific strings:** `backlog`, `todo`, `in_progress`, `blocked`, `in_review`, `done`, `cancelled`.
5. **Priority is 1-5** where 1 is most urgent.
6. **The bounty system doesn't exist yet.** The workflow of "external dev picks up issue -> forks -> fixes -> submits -> gets paid" needs to be designed and built. This is the main planned feature.
7. **File uploads go through** `/api/upload` which returns a Vercel Blob URL.
8. **The database is Neon PostgreSQL** - if you need direct DB access, use the same connection string with tagged template literals.

---

## Current Users

- **Andrea Edelman** (admin, owner) - id: 1
- **Achmad Bifari** (member) - id: 7

---

## Running Locally

```bash
npm install
# Set up .env.local with: NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, DATABASE_URL
npm run dev  # http://localhost:3000
```

---

---

## Agent API

For comprehensive Agent API documentation including authentication, all endpoints, request/response examples, and TaskHive sync behavior, see **[AGENT_API.md](./AGENT_API.md)**.

*Last updated: 2026-03-24*
