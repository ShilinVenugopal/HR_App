-- =============================================================================
-- FORAYS TASK APP — authentication hooks, authorization helpers and RLS
--
-- The desktop app is an untrusted client. Everything below is enforced in the
-- database, so a forged API request (e.g. changing a task id) gets nothing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helper predicates. SECURITY DEFINER so they can read the tables they guard
-- without recursing into those tables' own RLS policies.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_active()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active');
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'active' and role = 'admin');
$$;

-- A user may see a task if they created it or are one of its assignees.
create or replace function public.is_task_participant(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from tasks where id = p_task_id and created_by = auth.uid())
      or exists (select 1 from task_assignments where task_id = p_task_id and user_id = auth.uid());
$$;

create or replace function public.can_view_task(p_task_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.current_user_active() and (public.is_task_participant(p_task_id) or public.is_admin());
$$;

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversation_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- New auth user -> profile. Rejects any e-mail outside allowed_email_domains,
-- so even an accidental public sign-up cannot create a Forays account.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_email  text := lower(new.email);
  v_domain text := split_part(lower(new.email), '@', 2);
  v_meta   jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if v_email is null or not exists (select 1 from allowed_email_domains where domain = v_domain) then
    raise exception 'Only Forays Group e-mail addresses can be registered (got %)', coalesce(v_email, '<none>')
      using errcode = '42501';
  end if;

  -- Role is ALWAYS 'user' here, never taken from client-supplied metadata;
  -- only an Admin (via the admin-users Edge Function / RLS) can promote.
  insert into profiles (id, email, full_name, employee_code, department, designation, mobile, role, must_change_password)
  values (
    new.id,
    v_email,
    coalesce(nullif(trim(v_meta ->> 'full_name'), ''), split_part(v_email, '@', 1)),
    nullif(trim(v_meta ->> 'employee_code'), ''),
    nullif(trim(v_meta ->> 'department'), ''),
    nullif(trim(v_meta ->> 'designation'), ''),
    nullif(trim(v_meta ->> 'mobile'), ''),
    'user',
    coalesce((v_meta ->> 'must_change_password')::boolean, false)
  );

  insert into user_settings (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Profile guard: non-admins may only edit their own contact fields. Admin
-- edits and service-role (Edge Function) edits are unrestricted, except that
-- the last active admin can never be demoted/deactivated.
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER on purpose: current_user must be the caller's role.
create or replace function public.guard_profile_update()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Requests arriving from API clients run as role "authenticated".
  -- SECURITY DEFINER RPCs and the service role run as their owner and skip this.
  if current_user = 'authenticated' and not public.is_admin() then
    if new.id <> auth.uid()
       or new.email is distinct from old.email
       or new.role is distinct from old.role
       or new.status is distinct from old.status
       or new.employee_code is distinct from old.employee_code
       or new.department is distinct from old.department
       or new.designation is distinct from old.designation
       or new.must_change_password is distinct from old.must_change_password then
      raise exception 'You can only update your own name, mobile, photo and timezone'
        using errcode = '42501';
    end if;
  end if;

  if old.role = 'admin' and old.status = 'active'
     and (new.role <> 'admin' or new.status <> 'active')
     and not exists (select 1 from profiles where role = 'admin' and status = 'active' and id <> old.id) then
    raise exception 'At least one active Admin must remain' using errcode = '23514';
  end if;

  return new;
end $$;

create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.roles                     enable row level security;
alter table public.allowed_email_domains     enable row level security;
alter table public.profiles                  enable row level security;
alter table public.user_settings             enable row level security;
alter table public.tasks                     enable row level security;
alter table public.task_assignments          enable row level security;
alter table public.task_activity             enable row level security;
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;
alter table public.notifications             enable row level security;
alter table public.reminder_log              enable row level security;

-- roles: readable by signed-in users (for dropdowns)
create policy roles_select on public.roles for select to authenticated
  using (public.current_user_active());

-- allowed domains: admins only
create policy domains_admin_all on public.allowed_email_domains for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- profiles: the staff directory is visible to every active user (needed to
-- assign tasks to "any user" and to start chats). Inactive users only see
-- their own row (so the app can explain why they are locked out).
create policy profiles_select on public.profiles for select to authenticated
  using (public.current_user_active() or id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid() and public.current_user_active())
  with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- No insert/delete policy: profiles are created by the auth trigger and users
-- are deactivated, never deleted (keeps task history intact).

-- user_settings: own row only
create policy user_settings_select on public.user_settings for select to authenticated
  using (user_id = auth.uid());
create policy user_settings_update on public.user_settings for update to authenticated
  using (user_id = auth.uid() and public.current_user_active())
  with check (user_id = auth.uid());

-- tasks / assignments / activity: creator, assignees, and admins.
-- Writes only through RPCs (no insert/update/delete policies).
create policy tasks_select on public.tasks for select to authenticated
  using (public.can_view_task(id));
create policy task_assignments_select on public.task_assignments for select to authenticated
  using (public.can_view_task(task_id));
create policy task_activity_select on public.task_activity for select to authenticated
  using (public.can_view_task(task_id));

-- chat: participants only (admins get no special access to private chats)
create policy conversations_select on public.conversations for select to authenticated
  using (public.current_user_active() and public.is_conversation_participant(id));
create policy conversation_participants_select on public.conversation_participants for select to authenticated
  using (public.current_user_active() and public.is_conversation_participant(conversation_id));
create policy messages_select on public.messages for select to authenticated
  using (public.current_user_active() and public.is_conversation_participant(conversation_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and read_at is null
    and public.current_user_active()
    and public.is_conversation_participant(conversation_id)
  );

-- notifications: own only; state changes via RPC
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() and public.current_user_active());

-- reminder_log: internal, no client access (RLS enabled, no policies)

-- ---------------------------------------------------------------------------
-- Privileges: anonymous (logged-out) callers get nothing at all.
-- ---------------------------------------------------------------------------
-- Signed-in users get SELECT (filtered by RLS) plus a few column-level
-- UPDATE/INSERT grants; every other write must go through an RPC.
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, public;

grant select on public.roles, public.profiles, public.user_settings, public.tasks,
  public.task_assignments, public.task_activity, public.conversations,
  public.conversation_participants, public.messages, public.notifications
  to authenticated;
grant update (full_name, mobile, avatar_url, timezone, role, status, employee_code,
              department, designation, must_change_password)
  on public.profiles to authenticated;
grant update (notify_task_assigned, notify_task_updates, notify_reminders, notify_chat,
              reminder_offsets_minutes)
  on public.user_settings to authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;
grant select, insert, delete on public.allowed_email_domains to authenticated;

grant execute on function public.current_user_active(), public.is_admin(),
  public.is_task_participant(uuid), public.can_view_task(uuid),
  public.is_conversation_participant(uuid)
  to authenticated;
