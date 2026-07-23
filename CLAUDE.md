# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Forays Group HR Solutions — an Enterprise HR Management System with Role-Based
Access Control (RBAC) and Project-Based (Site-Based) Data Security. Modules:
Dashboard, Recruitment, Employees, Attendance, Wages, Compliance, Advances,
Reports, Settings, User Management, Audit Logs.

Monorepo, two independent Node projects, no shared root package.json:

```
backend/   Node.js + TypeScript + Express + Prisma + PostgreSQL API
frontend/  React + TypeScript + Vite + Tailwind CSS SPA
```

## Commands

All commands are run from inside `backend/` or `frontend/` respectively — there
is no root-level script runner.

### Backend (`backend/`)

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL / JWT secrets
npx prisma migrate dev        # apply schema, creates a migration if the schema changed
npm run seed                  # idempotent — seeds Super Admin + sample projects/roles, safe to re-run
npm run dev                   # tsx watch, http://localhost:4000, auto-reloads on save
npm run typecheck             # tsc --noEmit
npm run build                 # tsc + tsc-alias -> dist/
npm start                     # run the compiled build
npx prisma studio             # inspect the DB visually
```

There is no test runner configured in this project (no Jest/Vitest). Don't
invent test commands.

After changing `prisma/schema.prisma`, always run `npx prisma migrate dev`
(regenerates the client and creates a migration) before restarting the dev
server. After changing `prisma/seed.ts`, `npm run seed` is safe to re-run —
every upsert is keyed (email, project name, etc.), so it won't create
duplicates.

### Frontend (`frontend/`)

```bash
npm install
cp .env.example .env
npm run dev         # Vite dev server, http://localhost:5173, proxies /api and /uploads to :4000
npm run typecheck   # tsc -b --noEmit
npm run build        # tsc -b + vite build -> dist/
```

### Local Postgres for development

```bash
docker run -d --name hr_app_pg \
  -e POSTGRES_USER=hr_app -e POSTGRES_PASSWORD=hr_app_password -e POSTGRES_DB=hr_app_db \
  -p 5432:5432 postgres:16
```

Seeded logins (password `ChangeMe@12345` unless overridden by
`SUPER_ADMIN_PASSWORD` in `backend/.env`): `admin@foraysgroup.com` (Super
Admin, all projects), `site.admin@foraysgroup.com` (Site Admin — RIL
Jamnagar + IOCL Panipat), `hr.executive@foraysgroup.com` (HR Executive — RIL
Jamnagar), `project.manager@foraysgroup.com` (Project Manager — IOCL
Panipat), `finance@foraysgroup.com` (Finance — OPaL),
`normal.user@foraysgroup.com` (Normal User, view-only — RIL Jamnagar).

## Architecture — the one rule everything else follows

**Every operational record belongs to exactly one project, and every query
must be filtered to the caller's assigned projects.** This is not
per-module — it's a single choke point that every module CRUD service goes
through, and it's why the codebase is structured the way it is.

### The permission model

- Prisma `User.role` is one of `SUPER_ADMIN | SITE_ADMIN | HR_EXECUTIVE |
  PROJECT_MANAGER | FINANCE`, but the role is only a *default/seed*
  concept — actual authorization is driven entirely by the `Permission`
  table (`userId`, `module`, `canView/canAdd/canEdit/canDelete/canApprove`).
  Never hardcode role → capability mappings in route/controller code;
  always go through `requirePermission(module, action)`.
- `SUPER_ADMIN` is the one hardcoded bypass: it skips both the permission
  matrix and project scoping everywhere (see `Role.SUPER_ADMIN` checks in
  `backend/src/middleware/permission.middleware.ts` and
  `project.middleware.ts`, and `isSuperAdmin` in
  `frontend/src/context/AuthContext.tsx`).
- `USER_MANAGEMENT` and the Audit Logs viewer are gated by
  `requireSuperAdmin` (backend) / `RequireSuperAdmin` (frontend) — a
  separate, stricter gate than the per-module permission matrix, because
  these are not meant to be delegable via the matrix.

### JWT payload carries the permission matrix

`backend/src/utils/jwt.ts` (`AccessTokenPayload`) embeds `role`,
`projects: {id, projectName}[]`, and the full `permissions` matrix into the
15-minute access token at login (`backend/src/modules/auth/auth.service.ts`
→ `backend/src/modules/users/permission.util.ts`). This is deliberate: the
app must not re-fetch permissions from the DB on every request. The
7-day refresh token (hashed at rest in `RefreshToken`, rotated on every use)
is what reloads the matrix from the DB — so if an admin changes a user's
role/projects/permissions, it takes effect on that user's next
refresh/login, not instantly. `authenticate` middleware does one cheap DB
read per request (just `status`) so a disabled account is locked out
immediately even though permissions stay cached in the token.

### Backend middleware stack (`backend/src/middleware/`)

Applied per-route in this order: `authenticate` → `requirePermission(module,
action)` or `requireSuperAdmin` → route validation (`validate(zodSchema)`).
Project scoping is not a route-level middleware in most cases — it's called
inline in services:

- `projectScopeWhere(req)` — fold into a Prisma `where` clause for list/read
  queries scoped to the caller's assigned projects (`'ALL'` for Super Admin).
- `assertProjectAccess(req, projectId)` — throws `403` before any
  create/update that targets a specific project, so a forged `projectId` in
  the request body can never write outside the caller's assignment.

Unauthorized-attempt auditing is centralized, not scattered: middleware
that denies a request sets `req.auditContext` (module/action/reason) and
throws; the single global `auditUnauthorizedResponses` listener
(`backend/src/middleware/audit.middleware.ts`, mounted once in `app.ts`)
writes one audit-log row per 401/403 response using that context. Don't add
ad-hoc `recordAuditLog` calls for auth failures — extend `req.auditContext`
instead.

### Backend module layout

Every feature lives under `backend/src/modules/<name>/` as
`<name>.routes.ts` + `.controller.ts` + `.service.ts` + `.validation.ts`
(Zod schemas). Controllers are thin (`asyncHandler` + call service +
`sendSuccess`); all Prisma queries and business rules live in the service.
`Departments` and `Designations` share one generic implementation
(`backend/src/modules/masters/masters.service.ts`) since they're
structurally identical master-data tables — don't duplicate that pattern
into separate services if a third master-data type is added; extend the
generic one.

Wages: gross/net are always computed server-side from line items in
`wages.service.ts` (`computeTotals`) — never trust a client-submitted
total. Generated payroll is created directly in `PENDING_APPROVAL` (not
`DRAFT`), because the UI has no separate "submit for approval" step.

### Frontend structure

- `frontend/src/context/AuthContext.tsx` — holds the session (from
  `localStorage`, key `hr_app_session`) and exposes `can(module, action)`,
  used everywhere to gate both nav items and Add/Edit/Delete/Approve
  buttons. This is UX only; the backend re-checks independently.
- `frontend/src/api/resource.ts` — `createResourceApi<T>(basePath)` is a
  generic CRUD client factory; most of `frontend/src/api/modules.ts` is thin
  wrappers over it plus a few named extra actions (`approve`, `disable`,
  etc.). Prefer extending this pattern over hand-rolling new fetch calls.
- `frontend/src/components/layout/navConfig.ts` — single source of truth
  for the sidebar; each `NavItem` maps to a `ModuleName` and is filtered by
  `can(module, 'view')` (or `superAdminOnly`) in `Sidebar.tsx`.
- `frontend/src/components/common/` — shared building blocks used across
  every module page: `DataTable` (search/sort/pagination), `Modal`,
  `ConfirmDialog`, `MultiSelect`, `PermissionMatrixEditor` (the RBAC
  matrix editor used in User Management), `StatCard`, `Badge`, `Skeleton`.
  New module pages should compose these rather than building bespoke
  tables/modals.
- Dark mode: `frontend/src/context/ThemeContext.tsx` toggles a `dark` class
  on `<html>`; Tailwind `darkMode: 'class'` in `tailwind.config.js`.

### Database (`backend/prisma/schema.prisma`)

Core RBAC tables: `User`, `Project`, `UserProject` (many-to-many),
`Permission` (per-user-per-module CRUD/approve flags), `RefreshToken`,
`AuditLog`. Every operational table (`Employee`, `RecruitmentCandidate`,
`Attendance`, `WageRecord`, `Compliance`, `Advance`) carries `projectId` as
a required or nullable FK — this is the field every service filters on.
`Department`/`Designation` are simple master tables referenced by
Employees/Recruitment. Migrations are checked in under
`backend/prisma/migrations/` — after editing the schema, run `prisma
migrate dev` locally rather than hand-editing SQL or migration state.

## When adding a new module or route

1. Add the module to the `ModuleName` enum in `schema.prisma` (and the
   mirrored `ModuleName`/`ALL_MODULES` in `frontend/src/types/index.ts`) if
   it needs its own permission-matrix row.
2. Follow the existing `routes/controller/service/validation` split.
3. Gate every route with `requirePermission('YOUR_MODULE', action)`.
4. If the resource is project-scoped, filter list/read via
   `projectScopeWhere(req)` and guard writes with
   `assertProjectAccess(req, projectId)` — do not write a query that skips
   this, even for a "read-only" report.
5. Add the frontend nav entry to `navConfig.ts` and gate page actions with
   `can(module, action)` from `useAuth()`.
