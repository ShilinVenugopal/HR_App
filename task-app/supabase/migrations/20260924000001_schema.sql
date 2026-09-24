-- =============================================================================
-- FORAYS TASK APP — core schema
-- Every table here is protected by Row Level Security (see 0002_security.sql).
-- Clients never write to tasks/assignments/notifications directly: they call
-- the SECURITY DEFINER RPCs in 0003_rpc.sql, which enforce authorization.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_status as enum ('active', 'inactive');
create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
-- Task-level lifecycle. 'completed' is set automatically once every
-- non-cancelled assignment is completed.
create type public.task_status as enum ('open', 'completed', 'cancelled');
-- Per-assignee status. "Overdue" is NOT stored: it is derived
-- (due_at < now() and not completed) so the original due date is never touched.
create type public.assignment_status as enum ('pending', 'in_progress', 'completed', 'cancelled');

-- ---------------------------------------------------------------------------
-- Roles (lookup table rather than an enum so new roles can be added later
-- without a type migration).
-- ---------------------------------------------------------------------------
create table public.roles (
  code        text primary key,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

insert into public.roles (code, name, description) values
  ('admin', 'Admin', 'Manages users and can view system-wide task information'),
  ('user',  'User',  'Creates, receives and updates tasks; chats with colleagues');

-- ---------------------------------------------------------------------------
-- Allowed login domains. Account creation for any other domain is rejected
-- by a trigger on auth.users (0002_security.sql).
-- ---------------------------------------------------------------------------
create table public.allowed_email_domains (
  domain     text primary key check (domain = lower(domain) and domain !~ '@'),
  created_at timestamptz not null default now()
);

insert into public.allowed_email_domains (domain) values ('foraysgroup.in');

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user (created by trigger on auth.users).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                   uuid primary key references auth.users (id) on delete cascade,
  email                text not null unique check (email = lower(email)),
  full_name            text not null check (length(trim(full_name)) between 1 and 120),
  employee_code        text unique,
  department           text,
  designation          text,
  mobile               text,
  avatar_url           text,
  role                 text not null default 'user' references public.roles (code),
  status               public.user_status not null default 'active',
  must_change_password boolean not null default false,
  timezone             text not null default 'Asia/Kolkata',
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index profiles_status_idx on public.profiles (status);
create index profiles_full_name_idx on public.profiles (lower(full_name));

-- Per-user preferences (reminder timing, notification toggles).
create table public.user_settings (
  user_id                  uuid primary key references public.profiles (id) on delete cascade,
  notify_task_assigned     boolean not null default true,
  notify_task_updates      boolean not null default true,
  notify_reminders         boolean not null default true,
  notify_chat              boolean not null default true,
  -- Minutes before the deadline at which a reminder is sent.
  reminder_offsets_minutes integer[] not null default '{1440,120,30}'
    check (array_length(reminder_offsets_minutes, 1) is null or array_length(reminder_offsets_minutes, 1) <= 6),
  updated_at               timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  -- Human-friendly Task ID shown in the UI as FT-000123.
  task_no       bigint generated always as identity unique,
  title         text not null check (length(trim(title)) between 1 and 200),
  description   text check (description is null or length(description) <= 10000),
  created_by    uuid not null references public.profiles (id),
  assigned_date date not null default (now() at time zone 'Asia/Kolkata')::date,
  start_date    date,
  -- Deadline stored as an absolute instant; `timezone` records the zone the
  -- creator entered it in so the UI can render the same wall-clock time.
  due_at        timestamptz not null,
  timezone      text not null default 'Asia/Kolkata',
  priority      public.task_priority not null default 'medium',
  status        public.task_status not null default 'open',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  completed_at  timestamptz,
  cancelled_at  timestamptz,
  constraint tasks_start_before_due check (start_date is null or start_date <= (due_at at time zone timezone)::date)
);

create index tasks_created_by_idx on public.tasks (created_by, created_at desc);
create index tasks_due_at_open_idx on public.tasks (due_at) where status = 'open';

-- One row per (task, assignee): each person's status/progress is independent.
create table public.task_assignments (
  id                 uuid primary key default gen_random_uuid(),
  task_id            uuid not null references public.tasks (id) on delete cascade,
  user_id            uuid not null references public.profiles (id),
  status             public.assignment_status not null default 'pending',
  progress           smallint not null default 0 check (progress between 0 and 100),
  remarks            text check (remarks is null or length(remarks) <= 4000),
  completion_remarks text check (completion_remarks is null or length(completion_remarks) <= 4000),
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (task_id, user_id)
);

create index task_assignments_user_idx on public.task_assignments (user_id, status);
create index task_assignments_task_idx on public.task_assignments (task_id);

-- Audit trail / activity history for a task.
create table public.task_activity (
  id            bigint generated always as identity primary key,
  task_id       uuid not null references public.tasks (id) on delete cascade,
  assignment_id uuid references public.task_assignments (id) on delete set null,
  user_id       uuid references public.profiles (id),          -- actor
  target_user_id uuid references public.profiles (id),         -- e.g. who was assigned
  action        text not null,
  old_value     text,
  new_value     text,
  created_at    timestamptz not null default now()
);

create index task_activity_task_idx on public.task_activity (task_id, created_at);

-- ---------------------------------------------------------------------------
-- Chat (one-to-one now; `kind` leaves room for group chat later)
-- ---------------------------------------------------------------------------
create table public.conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null default 'direct' check (kind in ('direct', 'group')),
  -- For direct chats: "<smaller uuid>:<larger uuid>" so a pair has one thread.
  direct_key      text unique,
  title           text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  last_message_at timestamptz
);

create table public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id),
  last_read_at    timestamptz,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index conversation_participants_user_idx on public.conversation_participants (user_id);

create table public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id       uuid not null references public.profiles (id),
  body            text not null check (length(trim(body)) between 1 and 4000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

create index messages_conversation_idx on public.messages (conversation_id, created_at desc);
create index messages_unread_idx on public.messages (conversation_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Notifications (in-app list + Windows toast source)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  type            text not null,  -- task_assigned | task_updated | task_progress | task_completed
                                  -- task_reminder | task_due | task_overdue | task_cancelled | system
  title           text not null,
  message         text not null,
  task_id         uuid references public.tasks (id) on delete cascade,
  conversation_id uuid references public.conversations (id) on delete cascade,
  read_at         timestamptz,
  -- Set once a desktop client has shown the Windows toast, so restarting the
  -- app does not re-pop the same notification.
  delivered_at    timestamptz,
  created_at      timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_undelivered_idx on public.notifications (user_id) where delivered_at is null;

-- Records which reminders were already sent so they are never repeated.
create table public.reminder_log (
  assignment_id uuid not null references public.task_assignments (id) on delete cascade,
  kind          text not null,   -- before_<minutes> | due | overdue_<yyyy-mm-dd> | creator_overdue
  sent_at       timestamptz not null default now(),
  primary key (assignment_id, kind)
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();
create trigger task_assignments_touch before update on public.task_assignments
  for each row execute function public.touch_updated_at();
