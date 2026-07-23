# Forays Group HR Solutions — Enterprise HR Management System

Enterprise-grade HR Management System with Role-Based Access Control (RBAC) and
Project-Based (Site-Based) Data Security. Covers Dashboard, Recruitment,
Employees, Attendance, Wages, Compliance, Advances, Reports and Settings,
all secured by a project-scoped, module/CRUD permission matrix enforced on
the backend.

## Architecture

```
HR_App/
  backend/   Node.js + TypeScript + Express + Prisma + PostgreSQL API
  frontend/  React + TypeScript + Vite + Tailwind CSS SPA
```

### RBAC + Project-Based Data Security model

- **Roles**: Super Administrator, Site Administrator, HR Executive, Project
  Manager, Finance. Roles set defaults; actual access is driven entirely by
  the **Permission Matrix** stored in the database (`permissions` table) —
  never hardcoded.
- **Project isolation**: every operational table (`employees`,
  `recruitment_candidates`, `attendance`, `wage_records`, `compliance`,
  `advances`) carries a `project_id`. Every query is filtered through
  `getAccessibleProjectIds()` / `projectScopeWhere()`
  (`backend/src/middleware/project.middleware.ts`), so a user can never see
  or mutate a project they aren't assigned to — including by guessing IDs
  in the URL or calling the API directly. Super Admin bypasses this (full,
  unrestricted access).
- **Auth**: JWT access tokens (15m) embed the user's role, assigned
  projects and full permission matrix so authorization checks don't hit the
  DB on every request; a rotating refresh token (7d, hashed at rest,
  revocable) reloads that payload from the DB, so admin changes to a user's
  role/projects/permissions take effect on next refresh/login. Passwords are
  hashed with bcrypt.
- **Middleware stack** (`backend/src/middleware/`): `authenticate`
  (JWT + live-disabled-account check), `requirePermission(module, action)`
  (module + CRUD/approve), `requireProjectParam` / `assertProjectAccess`
  (project scoping), `validate` (Zod schema validation), rate limiting, and
  a single global `auditUnauthorizedResponses` listener that writes one
  audit-log row for every 401/403 response.
- **Audit Log**: every login, logout, create/update/delete, approval,
  failed login, unauthorized access attempt and password reset is recorded
  with user, IP, device, browser, module, project and timestamp
  (`audit_logs` table, viewable only by Super Admin under User Management →
  Audit Logs API).
- **Frontend**: the sidebar and every Add/Edit/Delete/Approve button is
  rendered from the same permission matrix delivered at login — but this is
  UX only. The backend is the final authority; a forged request to a
  disallowed module or project always gets `403 Access Denied`.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+

## Backend setup

```bash
cd backend
cp .env.example .env      # edit DATABASE_URL, JWT secrets, etc.
npm install
npx prisma migrate dev    # creates schema
npm run seed               # seeds Super Admin + sample projects/roles
npm run dev                 # http://localhost:4000
```

Seeded logins (password from `SUPER_ADMIN_PASSWORD` in `.env`, default
`ChangeMe@12345`):

| Email | Role | Assigned Projects |
|---|---|---|
| admin@foraysgroup.com | Super Administrator | All (unrestricted) |
| site.admin@foraysgroup.com | Site Administrator | RIL Jamnagar, IOCL Panipat |
| hr.executive@foraysgroup.com | HR Executive | RIL Jamnagar |
| project.manager@foraysgroup.com | Project Manager | IOCL Panipat |
| finance@foraysgroup.com | Finance | OPaL |

## Frontend setup

```bash
cd frontend
cp .env.example .env
npm install
npm run dev   # http://localhost:5173 (proxies /api to :4000)
```

## Production build

```bash
cd backend && npm run build && npm start
cd frontend && npm run build   # outputs static assets to dist/
```

## Key backend endpoints

All routes are namespaced under `/api/v1` and require `Authorization: Bearer
<accessToken>` except `/auth/login` and `/auth/refresh`.

- `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`
- `GET/POST/PUT/DELETE /users` + `/users/:id/disable`, `/enable`,
  `/reset-password` — Super Admin only
- `GET/POST/PUT/DELETE /projects` (list scoped to caller; write = Super Admin)
- `GET/POST/PUT/DELETE /departments`, `/designations`
- `GET/POST/PUT/DELETE /employees`, `POST /employees/from-candidate/:id`
- `GET/POST/PUT/DELETE /recruitment`
- `GET/POST/PUT/DELETE /attendance` + `/approve`, `/reject`, `/lock`, `/unlock`
- `GET/POST/PUT/DELETE /wages` + `/approve`, `/mark-paid`
- `GET/POST/PUT/DELETE /compliance` + `/expiring-soon`
- `GET/POST/PUT/DELETE /advances` + `/approve`, `/reject`, `/:id/recoveries`
- `GET /dashboard/summary`
- `GET /reports/{manpower,employees,attendance,recruitment,payroll}`
- `GET /audit-logs` — Super Admin only

## Notes on scope

This is a from-scratch implementation (the repository had no prior code).
The RBAC/project-security core, authentication, User Management, and
Settings masters are fully production-shaped. The operational modules
(Recruitment, Employees, Attendance, Wages, Compliance, Advances, Reports)
implement complete, project-scoped, permission-checked CRUD with the fields
and workflows described in the spec; deeper ERP-style features (e.g.
statutory return filing, full document management, scheduled expiry email
notifications) are left as natural extension points on top of this
foundation — the compliance `expiring-soon` endpoint and `Compliance`
model, for instance, are ready to be wired into a notification/cron job.
