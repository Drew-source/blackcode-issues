# 🔺 Blackcode Issues - Frontend

AI-native issue tracking built on the Trinity Architecture.

## Quick Start

### 1. Setup Environment Variables

```bash
# Copy the template
# See ENV_TEMPLATE.md for all variables

# Local development
GOOGLE_CLIENT_ID=262959577842-vubdf9h4gvuepqsvk6ehpk9clsmnep5n.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<from downloaded JSON>
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>
POSTGRES_URL=postgres://localhost:5432/blackcode_issues
```

### 2. Setup Database

Run the migration script on your Vercel Postgres:

```bash
# Via Vercel Dashboard → Storage → Query
# Or via psql
psql $POSTGRES_URL < scripts/migrate.sql
```

### 3. Install & Run

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`

## Deployment to Vercel

### 1. Push to GitHub

The frontend code should be in the `blackcode-issues` repo:

```bash
# Copy these files to Drew-source/blackcode-issues
git clone https://github.com/Drew-source/blackcode-issues
cp -r * /path/to/blackcode-issues/
cd /path/to/blackcode-issues
git add .
git commit -m "Add Blackcode Issues frontend"
git push
```

### 2. Set Environment Variables in Vercel

In your Vercel Dashboard:

1. Go to Project Settings → Environment Variables
2. Add:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `NEXTAUTH_SECRET`
   - `NEXTAUTH_URL` = `https://blackcode-issues.vercel.app`

3. Vercel Postgres will auto-inject `POSTGRES_*` variables

### 3. Run Database Migration

In Vercel Dashboard:
1. Go to Storage → Postgres
2. Click "Query"
3. Paste contents of `scripts/migrate.sql`
4. Run

### 4. Deploy

Vercel will auto-deploy on push to main.

## Architecture

```
┌─────────────────────────────────────────────┐
│              FRONTEND                        │
├─────────────────────────────────────────────┤
│  Next.js 14 (App Router)                    │
│  ├── Google OAuth via NextAuth              │
│  ├── TanStack Query for data fetching       │
│  ├── Framer Motion for animations           │
│  ├── @hello-pangea/dnd for drag & drop      │
│  └── Tailwind CSS for styling               │
├─────────────────────────────────────────────┤
│  API Routes                                  │
│  ├── /api/auth/[...nextauth] - Auth         │
│  ├── /api/projects - CRUD projects          │
│  ├── /api/issues - CRUD issues              │
│  └── /api/undo - Rollback operations        │
├─────────────────────────────────────────────┤
│  Vercel Postgres                            │
│  └── Full schema in scripts/migrate.sql     │
└─────────────────────────────────────────────┘
```

## Features

- ✅ **Google OAuth** - Secure team authentication
- ✅ **Kanban Board** - Drag-and-drop issue management
- ✅ **Dark Mode** - Beautiful dark theme by default
- ✅ **Rollback** - Undo operations with transaction logging
- ✅ **Fast API** - 2-15ms response times
- ✅ **Integer IDs** - No more UUID chaos

## API Reference

### Projects

```
GET    /api/projects           List all projects
POST   /api/projects           Create project
GET    /api/projects/:id       Get project
PATCH  /api/projects/:id       Update project
```

### Issues

```
GET    /api/issues             List issues (with filters)
POST   /api/issues             Create issue
GET    /api/issues/:id         Get issue
PATCH  /api/issues/:id         Update issue
DELETE /api/issues/:id         Delete issue
```

### Undo

```
GET    /api/undo               Get transaction history
POST   /api/undo               Undo last N operations
```

## The Trinity

```
PROMPT ←────────→ TOOLS ←────────→ SOFTWARE
  │                 │                  │
  │                 │                  │
  ▼                 ▼                  ▼
Micro-verbose    MCP Server      This Frontend
specification    (companion)     + Vercel Postgres
```

---

Made with 💝 by Andrea David & AI

