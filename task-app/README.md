# FORAYS TASK APP

A small Windows desktop app for Forays Group. Staff use it to assign tasks to colleagues, track each person's progress, get deadline reminders, and chat. It runs quietly in the Windows system tray, and everything syncs live through one cloud backend, so colleagues in different locations see the same data.

```
task-app/
├── supabase/                      Cloud backend (Supabase = PostgreSQL + Auth + Realtime + Edge Functions)
│   ├── config.toml                Auth settings (public sign-up disabled, password length, realtime)
│   ├── migrations/                Schema, security (RLS), business-logic RPCs, realtime + cron — applied in order
│   │   ├── …0001_schema.sql       Tables, enums, indexes
│   │   ├── …0002_security.sql     Domain-restricted sign-up trigger, profile guard, RLS policies, grants
│   │   ├── …0003_rpc.sql          Views + create/update/cancel task, progress, chat, notifications, reminders
│   │   └── …0004_realtime_cron.sql Realtime publication + pg_cron reminder job (every 5 min)
│   ├── functions/admin-users/     Edge Function: admin creates users / (de)activates / resets passwords
│   └── tests/                     39 automated security + scenario tests (plain Postgres + Supabase auth stub)
└── desktop/                       Windows app: Electron + React + TypeScript + Vite + Tailwind
    ├── electron/                  Main process: window, tray, close-to-tray, Windows toasts, start-with-Windows
    │   ├── main.ts  preload.ts  prefs.ts  bridge.d.ts
    ├── src/
    │   ├── lib/                   Supabase client, typed API, date/timezone helpers, types
    │   ├── context/               AuthContext (session/profile), RealtimeContext (live sync, toasts, offline)
    │   ├── components/            Layout (title bar + sidebar), UI kit, badges, searchable multi-select
    │   └── pages/                 Login, Dashboard, My Tasks, Assigned by Me, All Tasks, Create/Edit Task,
    │                              Task Detail, Chat, Notifications, Users (admin), Settings, Profile
    ├── assets/  build/            App / tray / installer icons (generated from assets/icon.svg)
    ├── scripts/                   generate-icons.mjs, create-admin.mjs (first Admin bootstrap)
    └── electron-builder.yml       NSIS installer config → release/ForaysTaskApp-Setup-<version>.exe
```

## Technologies

| Layer | Choice | Why |
|---|---|---|
| Desktop | **Electron 44 + React 18 + TypeScript**, Vite, Tailwind CSS, TanStack Query, lucide icons | Native tray, toasts and auto-start on Windows with a modern UI. The renderer is sandboxed, with no Node.js access. |
| Backend | **Supabase**: PostgreSQL, Auth, Realtime, Edge Functions (Deno), pg_cron | Managed, low-ops, with row-level security in the database and live change feeds. |
| Installer | **electron-builder (NSIS)** | Standard Windows setup wizard: Start Menu and desktop shortcuts, uninstaller, per-user install with no admin rights needed. |

**Why a separate backend from the HR app?** The existing HR_App (`backend/`, `frontend/`) is an Express + Prisma API. Its users are HR and site staff and its permissions are project-scoped, and no Supabase project existed in the repo. The Task App needs *every* employee as a user, security enforced inside the database (RLS), realtime chat and push updates. Adding all of that to the HR API would mean building a websocket layer and tangling two unrelated permission models. So the Task App lives next to the HR app in the monorepo but has its own Supabase project. Nothing in `backend/` or `frontend/` was changed.

## Database schema

| Table | Purpose |
|---|---|
| `profiles` | One row per user: name, e-mail, employee code, department, designation, mobile, **role**, **status**, timezone, `must_change_password` |
| `roles` | Lookup table (`admin`, `user`). New roles can be added without a migration. |
| `allowed_email_domains` | Domains allowed to have accounts (seeded: `foraysgroup.in`) |
| `user_settings` | Notification toggles and reminder offsets in minutes (default 1 day / 2 h / 30 min) |
| `tasks` | Title, multi-line description, `created_by`, assigned date, start date, `due_at` (timestamptz) + `timezone`, priority, status (`open/completed/cancelled`), created/updated/completed timestamps. `task_no` is shown as **FT-00001**. |
| `task_assignments` | **One row per assignee**, each with its own status (`pending/in_progress/completed/cancelled`), progress %, remarks, completion remarks and completed timestamp |
| `task_activity` | Audit trail: created, assigned/unassigned, status, progress, remarks, completed, due/priority/title changes, cancelled |
| `conversations`, `conversation_participants`, `messages` | 1-to-1 chat with read receipts (`read_at`). `kind` leaves room for group chat. |
| `notifications` | In-app notification list and the source of Windows toasts (`read_at`, `delivered_at`) |
| `reminder_log` | Records which reminders were already sent, so none is sent twice |

Views `v_task_assignments` (one row per assignee) and `v_tasks` (one row per task, with assignee roll-up) add the derived **`effective_status`**. **Overdue** is never stored. It is computed as `now() > due_at` and not completed, so the original due date is never changed.

## Authentication

- Users sign in with their **Forays e-mail and password** through Supabase Auth. Public sign-up is **disabled**.
- Only an **Admin** creates accounts, from **Users → Add user** in the app. The app calls the `admin-users` Edge Function. That function holds the service-role key on the server and first checks that the caller is an active Admin.
- A database trigger on `auth.users` **rejects any e-mail whose domain is not in `allowed_email_domains`**, even if someone creates a user from the Supabase dashboard. New accounts always start as role `user`. Role information in sign-up data is ignored, so nobody can make themselves an admin.
- New users get a **temporary password** and must change it at first sign-in. Admins can reset passwords in the same way.
- **Deactivating** a user does two things. It bans the auth account, so the session cannot be refreshed. It also sets `status = inactive`, and every RLS policy checks status, so an already-issued token immediately returns nothing.

## Security / RLS approach

The desktop app is treated as an **untrusted client**. Hiding a button is only for convenience, and every rule is enforced in PostgreSQL:

- **RLS is on for every table.** `anon` (logged-out) has no privileges at all. `authenticated` gets `SELECT` filtered by policy, plus a few column-level grants. Examples: you can update your own mobile number, and you can insert a message only as yourself into a conversation you belong to.
- **Tasks:** visible only to the **creator, the assignees, and Admins**. The policy is `can_view_task(id)`. Changing a task id in a request returns nothing.
- **All task writes go through `SECURITY DEFINER` RPCs** (`create_task`, `update_task`, `set_task_assignees`, `cancel_task`, `update_assignment_progress`). Each one re-checks the caller:
  - Only the **assignee** can update their own assignment.
  - Only the **creator or an Admin** can edit, reassign or cancel a task.
  - Direct `INSERT/UPDATE/DELETE` on the task tables is refused.
- **Chat:** only **participants** can read or post. Admins get no special access to private chats.
- **Notifications:** your own only.
- **Profiles:** everyone active can see the staff directory, which is needed to assign tasks and start chats. Only Admins can change role, status, department or designation. A guard trigger enforces that per column, and **the last active Admin cannot be demoted or deactivated**.
- **Realtime** delivers a change only if the subscriber's RLS `SELECT` policy allows it, so live updates never leak.
- **Service-role key:** it exists only in the Edge Function's environment and in the one-time `create-admin` script run by an administrator. It is **never** in the desktop app. The app ships only the public anon key.
- **Electron hardening:** `contextIsolation`, `sandbox` and no `nodeIntegration`. There is a strict Content-Security-Policy, navigation is blocked, external links open in the browser, and only a narrow, typed IPC bridge is exposed.

## Reminders & notifications

- `generate_due_reminders()` runs **every 5 minutes on the server** (pg_cron). Each client also calls it when it starts or reconnects, limited to that user's own tasks. The function is idempotent, so both paths are safe.
  - **Before the deadline:** only the *nearest* configured offset fires. If the PC was off for a day, you get one reminder, not three.
  - **At the deadline:** a "Task due now" notification.
  - **Overdue:** at most **once per day** per assignee, for up to 30 days. The task creator is told once.
- Notifications are rows in `notifications`. The app receives them live over Realtime:
  - If the window is **hidden in the tray or not focused**, it raises a **Windows toast**. Clicking the toast opens the task.
  - If the window is focused, it shows an in-app toast instead.
- `delivered_at` stops the same toast from appearing again after a restart. Anything that arrived while the PC was off is shown when the app next starts; if there are many, they are summarized in one toast.
- New chat messages raise a toast unless you are already looking at that conversation. Unread counts appear in the sidebar, the tray tooltip and the taskbar overlay badge.

---

## 1. Set up the backend (once)

1. Create a project at <https://supabase.com>. Mumbai (`ap-south-1`) is closest to India.
2. Install the [Supabase CLI](https://supabase.com/docs/guides/cli), then from `task-app/`:
   ```bash
   supabase link --project-ref <your-project-ref>
   supabase db push                         # applies supabase/migrations/* (schema, RLS, RPCs, realtime, cron)
   supabase functions deploy admin-users    # SUPABASE_URL / keys are injected automatically by Supabase
   ```
3. In the dashboard, go to **Authentication → Sign In / Providers → Email**:
   - Keep Email enabled.
   - **Turn OFF "Allow new users to sign up".**
   - Set minimum password length to 10.
4. Check **Database → Cron** shows the job `forays-task-reminders`. The migration creates it automatically when `pg_cron` is available, which it is on every Supabase plan.
5. Create the first Admin from a trusted machine:
   ```bash
   cd task-app/desktop
   cp .env.example .env        # fill VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
   npm install
   npm run create-admin -- shilin@foraysgroup.in "Shilin Venugopal" "TempPassw0rd2026"
   ```
   Then **delete `SUPABASE_SERVICE_ROLE_KEY` from `.env`**. It is only needed for this one step. Every other user is added from **Users → Add user** in the app.

To allow another company domain (for example `foraysgroup.com`), run `insert into allowed_email_domains values ('foraysgroup.com');` in the SQL editor. Also add it to `VITE_COMPANY_DOMAINS` so the login screen accepts it.

## 2. Environment variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `desktop/.env` (build time) | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | `desktop/.env` (build time) | Public anon key. Safe to ship, because RLS enforces all access. |
| `VITE_COMPANY_DOMAINS` | `desktop/.env` (optional) | Comma-separated login domains (default `foraysgroup.in`) |
| `SUPABASE_SERVICE_ROLE_KEY` | `desktop/.env`, **only while running `create-admin`** | Never bundled into the app |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | Edge Function runtime | Provided automatically by hosted Supabase |

If you use a **custom domain** for Supabase instead of `*.supabase.co`, add it to `connect-src` in `desktop/index.html`.

## 3. Run in development

```bash
cd task-app/desktop
npm install
npm run dev          # Vite on :5173 + Electron window with hot reload
npm run typecheck
```

Database tests do not need Supabase or Docker, just any PostgreSQL 14+:

```bash
cd task-app/supabase/tests
npm install
PGHOST=localhost PGUSER=postgres PGPASSWORD=… npm test     # 39 tests: RLS isolation, scenarios 1–5, reminders
```

## 4. Build the Windows installer

**On a Windows PC** (recommended):

```bash
cd task-app/desktop
npm install
npm run dist
```

**Or in GitHub Actions:** run the **Forays Task App** workflow manually (Actions → Forays Task App → Run workflow). It builds on `windows-latest` and uploads **ForaysTaskApp-Setup** as a build artifact. First add the repository secrets `TASK_APP_SUPABASE_URL` and `TASK_APP_SUPABASE_ANON_KEY`.

Building from Linux or macOS also works, but it needs Wine, including 32-bit Wine on Linux.

## 5. Where the installer is

```
task-app/desktop/release/ForaysTaskApp-Setup-1.0.0.exe
```

It is about 112 MB, almost all of which is the Electron/Chromium runtime. The app code itself is about 1 MB. All libraries are listed as `devDependencies` on purpose: Vite bundles them, so nothing from `node_modules` needs to ship.

**What the installer does:**
- Installs per user, so no admin rights are needed. The install folder can be changed.
- Creates Start Menu and desktop shortcuts, plus an entry in *Apps & features* with an uninstaller.
- Launches the app when setup finishes.
- **Start with Windows** is on by default. The app starts hidden in the tray, which keeps reminders working. It can be switched off in **Settings**.

## Tray behaviour

- Closing the window **hides the app to the tray**. You see a one-time hint the first time this happens.
- The tray menu has: **Open Forays Task App, My Tasks, Create Task, Chat, Settings, Logout, Exit**.
- Only **Exit** fully quits the app. "Minimize to tray" can be turned off in Settings.

## Verification performed

| Area | How it was verified |
|---|---|
| Database security | 39 automated tests against PostgreSQL 16, with policies exercised as real `authenticated` sessions. Covers scenarios 1–5, overdue/reminder de-duplication, direct-write blocking, deactivation, the last-admin guard and domain restriction. |
| Full stack | Real **Supabase Auth (GoTrue v2.164)**, **PostgREST 12** and the **admin-users Edge Function under Deno**, driven with `supabase-js` exactly as the app uses it. Covers admin bootstrap, forced password change, adding users, 403 for non-admins, scenarios 1–5, and deactivation making login fail. |
| Desktop UI | Electron app driven by Playwright against that stack. Covers login (including the wrong-domain message), dashboard, lists, task detail, progress update, create task with multiple assignees, chat, notifications, users, settings, profile and close-to-tray, with no renderer errors. **Scenario 8:** going offline shows the banner and keeps cached data; coming back online clears it and reloads. |
| Installer | `npm run dist` produced a valid NSIS `ForaysTaskApp-Setup-1.0.0.exe` containing `ForaysTaskApp.exe` and `app.asar`. |

**Not verifiable in the build environment (please check on a Windows PC):**
- Supabase **Realtime** push. There was no Realtime server locally; the app showed "Reconnecting…" and still worked by refetching.
- Real **Windows toast** pop-ups (scenario 6).
- Two live users seeing each other's changes without refreshing (scenario 7).
- Running the installer wizard on Windows.

## Remaining limitations / future improvements

- **Code signing:** the installer is unsigned, so Windows SmartScreen shows a warning until a code-signing certificate is added (`win.certificateFile` / Azure Trusted Signing).
- **Auto-update:** not configured (`publish: null`). electron-updater with GitHub Releases or S3 can be added later.
- **Password reset** is done by an Admin. Self-service "forgot password" needs SMTP and a reset page. **Microsoft 365 / Google SSO** could replace passwords if Forays e-mail runs on either (Supabase supports Azure AD / Google OAuth).
- Chat is one-to-one text only. The `conversations.kind` column is ready for **group chat**. Attachments would use Supabase Storage.
- Rich-text descriptions, task comments, recurring tasks, a calendar view, e-mail/WhatsApp notifications, reports and department- or project-wise dashboards were intentionally left out of v1. The schema (roles table, activity log, per-assignment rows, per-task timezone) is designed so these can be added without restructuring.
- The user timezone defaults to Asia/Kolkata and is stored per user and per task, but there is no timezone picker in the UI yet.
