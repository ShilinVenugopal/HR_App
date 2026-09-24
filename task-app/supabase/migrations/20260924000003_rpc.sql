-- =============================================================================
-- FORAYS TASK APP — views and RPCs
--
-- All writes to tasks, assignments, activity and notifications go through the
-- SECURITY DEFINER functions below. Each one re-checks who the caller is, so
-- the only way to change data is the way the business rules allow.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Derived status. Overdue is computed, never stored.
-- ---------------------------------------------------------------------------
create or replace function public.effective_assignment_status(
  p_status public.assignment_status, p_task_status public.task_status, p_due_at timestamptz)
returns text language sql stable as $$
  select case
    when p_task_status = 'cancelled' or p_status = 'cancelled' then 'cancelled'
    when p_status = 'completed' then 'completed'
    when now() > p_due_at then 'overdue'
    else p_status::text
  end;
$$;

-- ---------------------------------------------------------------------------
-- Views (security_invoker => the caller's RLS on the base tables applies)
-- ---------------------------------------------------------------------------

-- One row per assignment: drives "My Tasks" and the dashboard.
create or replace view public.v_task_assignments with (security_invoker = true) as
select
  a.id                 as assignment_id,
  a.task_id,
  t.task_no,
  t.title,
  t.description,
  t.priority,
  t.status             as task_status,
  t.assigned_date,
  t.start_date,
  t.due_at,
  t.timezone,
  (t.due_at at time zone t.timezone)::date as due_date,
  (t.due_at at time zone t.timezone)::time as due_time,
  t.created_by,
  cp.full_name         as created_by_name,
  a.user_id,
  ap.full_name         as assignee_name,
  ap.email             as assignee_email,
  a.status,
  public.effective_assignment_status(a.status, t.status, t.due_at) as effective_status,
  a.progress,
  a.remarks,
  a.completion_remarks,
  a.completed_at,
  a.updated_at,
  t.created_at
from public.task_assignments a
join public.tasks t     on t.id = a.task_id
join public.profiles cp on cp.id = t.created_by
join public.profiles ap on ap.id = a.user_id;

-- One row per task with assignee roll-up: drives "Assigned by Me" / admin view.
create or replace view public.v_tasks with (security_invoker = true) as
select
  t.id,
  t.task_no,
  t.title,
  t.description,
  t.priority,
  t.status,
  t.assigned_date,
  t.start_date,
  t.due_at,
  t.timezone,
  (t.due_at at time zone t.timezone)::date as due_date,
  (t.due_at at time zone t.timezone)::time as due_time,
  t.created_by,
  cp.full_name as created_by_name,
  t.created_at,
  t.updated_at,
  t.completed_at,
  t.cancelled_at,
  coalesce(agg.assignee_count, 0)  as assignee_count,
  coalesce(agg.completed_count, 0) as completed_count,
  coalesce(agg.avg_progress, 0)    as avg_progress,
  coalesce(agg.assignee_names, '') as assignee_names,
  case
    when t.status = 'cancelled' then 'cancelled'
    when t.status = 'completed' then 'completed'
    when now() > t.due_at then 'overdue'
    when coalesce(agg.started_count, 0) > 0 then 'in_progress'
    else 'pending'
  end as effective_status
from public.tasks t
join public.profiles cp on cp.id = t.created_by
left join lateral (
  select
    (count(*) filter (where a.status <> 'cancelled'))::int                  as assignee_count,
    (count(*) filter (where a.status = 'completed'))::int                   as completed_count,
    (count(*) filter (where a.status = 'in_progress' or (a.status = 'pending' and a.progress > 0)))::int as started_count,
    round(avg(a.progress) filter (where a.status <> 'cancelled'))::int      as avg_progress,
    string_agg(p.full_name, ', ' order by p.full_name)                      as assignee_names
  from public.task_assignments a
  join public.profiles p on p.id = a.user_id
  where a.task_id = t.id
) agg on true;

revoke all on public.v_task_assignments, public.v_tasks from anon, authenticated;
grant select on public.v_task_assignments, public.v_tasks to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------
create or replace function public._require_active_user()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null or not public.current_user_active() then
    raise exception 'Not signed in or account inactive' using errcode = '42501';
  end if;
  return v_uid;
end $$;

create or replace function public._notify(
  p_user uuid, p_type text, p_title text, p_message text,
  p_task uuid default null, p_conversation uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into notifications (user_id, type, title, message, task_id, conversation_id)
  values (p_user, p_type, p_title, p_message, p_task, p_conversation);
$$;

create or replace function public._log(
  p_task uuid, p_actor uuid, p_action text,
  p_old text default null, p_new text default null,
  p_assignment uuid default null, p_target uuid default null)
returns void language sql security definer set search_path = public as $$
  insert into task_activity (task_id, user_id, action, old_value, new_value, assignment_id, target_user_id)
  values (p_task, p_actor, p_action, p_old, p_new, p_assignment, p_target);
$$;

create or replace function public._fmt_due(p_due timestamptz, p_tz text)
returns text language sql stable as $$
  select to_char(p_due at time zone p_tz, 'DD Mon YYYY "at" HH12:MI AM');
$$;

-- Marks the task completed once all non-cancelled assignments are done, or
-- reopens it if someone moves back from completed.
create or replace function public._refresh_task_completion(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_open int; v_total int;
begin
  select count(*) filter (where status in ('pending', 'in_progress')),
         count(*) filter (where status <> 'cancelled')
    into v_open, v_total
    from task_assignments where task_id = p_task;

  if v_total > 0 and v_open = 0 then
    update tasks set status = 'completed', completed_at = coalesce(completed_at, now())
     where id = p_task and status = 'open';
  else
    update tasks set status = 'open', completed_at = null
     where id = p_task and status = 'completed';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- create_task: task + one assignment per assignee + activity + notifications,
-- atomically.
-- ---------------------------------------------------------------------------
create or replace function public.create_task(
  p_title         text,
  p_description   text,
  p_due_at        timestamptz,
  p_assignee_ids  uuid[],
  p_priority      public.task_priority default 'medium',
  p_assigned_date date default null,
  p_start_date    date default null,
  p_timezone      text default 'Asia/Kolkata')
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := public._require_active_user();
  v_task    uuid;
  v_user    uuid;
  v_assign  uuid;
  v_creator text;
  v_ids     uuid[];
begin
  select array_agg(distinct x) into v_ids from unnest(p_assignee_ids) x where x is not null;
  if v_ids is null or array_length(v_ids, 1) = 0 then
    raise exception 'Select at least one assignee' using errcode = '22023';
  end if;
  if array_length(v_ids, 1) > 100 then
    raise exception 'A task can have at most 100 assignees' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(v_ids) x
             where not exists (select 1 from profiles p where p.id = x and p.status = 'active')) then
    raise exception 'One or more assignees are not active users' using errcode = '22023';
  end if;
  if p_due_at is null then
    raise exception 'Due date and time are required' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then
    raise exception 'Unknown timezone %', p_timezone using errcode = '22023';
  end if;

  insert into tasks (title, description, created_by, assigned_date, start_date, due_at, timezone, priority)
  values (trim(p_title), nullif(trim(p_description), ''), v_uid,
          coalesce(p_assigned_date, (now() at time zone p_timezone)::date),
          p_start_date, p_due_at, p_timezone, coalesce(p_priority, 'medium'))
  returning id into v_task;

  perform public._log(v_task, v_uid, 'created', null, trim(p_title));
  select full_name into v_creator from profiles where id = v_uid;

  foreach v_user in array v_ids loop
    insert into task_assignments (task_id, user_id) values (v_task, v_user) returning id into v_assign;
    perform public._log(v_task, v_uid, 'assigned', null, (select full_name from profiles where id = v_user), v_assign, v_user);
    if v_user <> v_uid then
      perform public._notify(v_user, 'task_assigned', 'New task assigned',
        format('%s assigned you "%s" — due %s', v_creator, trim(p_title), public._fmt_due(p_due_at, p_timezone)),
        v_task);
    end if;
  end loop;

  return v_task;
end $$;

-- ---------------------------------------------------------------------------
-- update_task: creator (or admin) edits task details.
-- ---------------------------------------------------------------------------
create or replace function public.update_task(
  p_task_id     uuid,
  p_title       text,
  p_description text,
  p_due_at      timestamptz,
  p_priority    public.task_priority,
  p_start_date  date default null,
  p_timezone    text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_active_user();
  t     tasks%rowtype;
  v_tz  text;
  r     record;
begin
  select * into t from tasks where id = p_task_id for update;
  if not found or (t.created_by <> v_uid and not public.is_admin()) then
    raise exception 'Task not found or you are not allowed to edit it' using errcode = '42501';
  end if;
  if t.status = 'cancelled' then
    raise exception 'Cancelled tasks cannot be edited' using errcode = '22023';
  end if;
  v_tz := coalesce(p_timezone, t.timezone);

  update tasks set
    title = trim(p_title),
    description = nullif(trim(p_description), ''),
    due_at = p_due_at,
    timezone = v_tz,
    priority = p_priority,
    start_date = p_start_date
  where id = p_task_id;

  if t.title is distinct from trim(p_title) then
    perform public._log(p_task_id, v_uid, 'title_changed', t.title, trim(p_title));
  end if;
  if t.description is distinct from nullif(trim(p_description), '') then
    perform public._log(p_task_id, v_uid, 'description_changed');
  end if;
  if t.priority is distinct from p_priority then
    perform public._log(p_task_id, v_uid, 'priority_changed', t.priority::text, p_priority::text);
  end if;
  if t.due_at is distinct from p_due_at then
    perform public._log(p_task_id, v_uid, 'due_changed', public._fmt_due(t.due_at, t.timezone), public._fmt_due(p_due_at, v_tz));
    -- New deadline => reminders should fire again for it.
    delete from reminder_log where assignment_id in (select id from task_assignments where task_id = p_task_id);
  end if;

  for r in select user_id from task_assignments where task_id = p_task_id and status <> 'cancelled' and user_id <> v_uid loop
    perform public._notify(r.user_id, 'task_updated', 'Task updated',
      format('"%s" was updated — due %s', trim(p_title), public._fmt_due(p_due_at, v_tz)), p_task_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- set_task_assignees: creator (or admin) adds/removes assignees.
-- ---------------------------------------------------------------------------
create or replace function public.set_task_assignees(p_task_id uuid, p_assignee_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid     uuid := public._require_active_user();
  t         tasks%rowtype;
  v_ids     uuid[];
  v_user    uuid;
  v_assign  uuid;
  v_creator text;
  r         record;
begin
  select * into t from tasks where id = p_task_id for update;
  if not found or (t.created_by <> v_uid and not public.is_admin()) then
    raise exception 'Task not found or you are not allowed to edit it' using errcode = '42501';
  end if;
  if t.status = 'cancelled' then
    raise exception 'Cancelled tasks cannot be edited' using errcode = '22023';
  end if;
  select array_agg(distinct x) into v_ids from unnest(p_assignee_ids) x where x is not null;
  if v_ids is null or array_length(v_ids, 1) = 0 then
    raise exception 'A task needs at least one assignee' using errcode = '22023';
  end if;
  select full_name into v_creator from profiles where id = v_uid;

  -- removals
  for r in select a.id, a.user_id, p.full_name from task_assignments a join profiles p on p.id = a.user_id
           where a.task_id = p_task_id and not (a.user_id = any (v_ids)) loop
    perform public._log(p_task_id, v_uid, 'unassigned', r.full_name, null, null, r.user_id);
    delete from task_assignments where id = r.id;
    if r.user_id <> v_uid then
      perform public._notify(r.user_id, 'task_updated', 'Removed from task',
        format('You were removed from "%s"', t.title), null);
    end if;
  end loop;

  -- additions
  foreach v_user in array v_ids loop
    if not exists (select 1 from task_assignments where task_id = p_task_id and user_id = v_user) then
      if not exists (select 1 from profiles where id = v_user and status = 'active') then
        raise exception 'One or more assignees are not active users' using errcode = '22023';
      end if;
      insert into task_assignments (task_id, user_id) values (p_task_id, v_user) returning id into v_assign;
      perform public._log(p_task_id, v_uid, 'assigned', null, (select full_name from profiles where id = v_user), v_assign, v_user);
      if v_user <> v_uid then
        perform public._notify(v_user, 'task_assigned', 'New task assigned',
          format('%s assigned you "%s" — due %s', v_creator, t.title, public._fmt_due(t.due_at, t.timezone)), p_task_id);
      end if;
    end if;
  end loop;

  perform public._refresh_task_completion(p_task_id);
end $$;

-- ---------------------------------------------------------------------------
-- cancel_task: creator (or admin).
-- ---------------------------------------------------------------------------
create or replace function public.cancel_task(p_task_id uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := public._require_active_user();
  t     tasks%rowtype;
  r     record;
begin
  select * into t from tasks where id = p_task_id for update;
  if not found or (t.created_by <> v_uid and not public.is_admin()) then
    raise exception 'Task not found or you are not allowed to cancel it' using errcode = '42501';
  end if;
  if t.status = 'cancelled' then return; end if;

  update tasks set status = 'cancelled', cancelled_at = now() where id = p_task_id;
  update task_assignments set status = 'cancelled' where task_id = p_task_id and status in ('pending', 'in_progress');
  perform public._log(p_task_id, v_uid, 'cancelled', null, nullif(trim(p_reason), ''));

  for r in select user_id from task_assignments where task_id = p_task_id and user_id <> v_uid loop
    perform public._notify(r.user_id, 'task_cancelled', 'Task cancelled',
      format('"%s" was cancelled%s', t.title, coalesce(' — ' || nullif(trim(p_reason), ''), '')), p_task_id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- update_assignment_progress: ONLY the assignee may update their own
-- assignment. Completing forces progress to 100%; setting 100% completes.
-- ---------------------------------------------------------------------------
create or replace function public.update_assignment_progress(
  p_assignment_id uuid,
  p_status        public.assignment_status,
  p_progress      integer,
  p_remarks       text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := public._require_active_user();
  a          task_assignments%rowtype;
  t          tasks%rowtype;
  v_status   public.assignment_status := p_status;
  v_progress integer := greatest(0, least(100, coalesce(p_progress, 0)));
  v_remarks  text := nullif(trim(p_remarks), '');
  v_name     text;
begin
  select * into a from task_assignments where id = p_assignment_id for update;
  if not found or a.user_id <> v_uid then
    raise exception 'Assignment not found or not assigned to you' using errcode = '42501';
  end if;
  select * into t from tasks where id = a.task_id;
  if t.status = 'cancelled' or a.status = 'cancelled' then
    raise exception 'This task has been cancelled' using errcode = '22023';
  end if;
  if v_status = 'cancelled' then
    raise exception 'Only the task creator can cancel a task' using errcode = '42501';
  end if;

  if v_progress = 100 then v_status := 'completed'; end if;
  if v_status = 'completed' then v_progress := 100; end if;
  if v_status = 'pending' and v_progress > 0 then v_status := 'in_progress'; end if;

  update task_assignments set
    status = v_status,
    progress = v_progress,
    remarks = case when v_status = 'completed' then remarks else coalesce(v_remarks, remarks) end,
    completion_remarks = case when v_status = 'completed' then v_remarks else null end,
    completed_at = case when v_status = 'completed' then coalesce(a.completed_at, now()) else null end
  where id = p_assignment_id;

  if a.status is distinct from v_status and v_status = 'completed' then
    -- new_value carries the completion remark (if any)
    perform public._log(t.id, v_uid, 'completed', a.status::text, v_remarks, a.id, v_uid);
  elsif a.status is distinct from v_status then
    perform public._log(t.id, v_uid, 'status_changed', a.status::text, v_status::text, a.id, v_uid);
  end if;
  if a.progress is distinct from v_progress and v_status <> 'completed' then
    perform public._log(t.id, v_uid, 'progress_updated', a.progress || '%', v_progress || '%', a.id, v_uid);
  end if;
  if v_status <> 'completed' and v_remarks is not null and v_remarks is distinct from a.remarks then
    perform public._log(t.id, v_uid, 'remarks_updated', a.remarks, v_remarks, a.id, v_uid);
  end if;

  perform public._refresh_task_completion(t.id);

  if t.created_by <> v_uid and (a.status is distinct from v_status or a.progress is distinct from v_progress or v_remarks is not null) then
    select full_name into v_name from profiles where id = v_uid;
    if v_status = 'completed' and a.status <> 'completed' then
      perform public._notify(t.created_by, 'task_completed', 'Task completed',
        format('%s completed "%s"%s', v_name, t.title, coalesce(' — ' || v_remarks, '')), t.id);
    else
      perform public._notify(t.created_by, 'task_progress', 'Task progress updated',
        format('%s updated "%s" to %s%% (%s)%s', v_name, t.title, v_progress, replace(v_status::text, '_', ' '),
               coalesce(' — ' || v_remarks, '')), t.id);
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Dashboard counters for the caller.
-- ---------------------------------------------------------------------------
create or replace function public.my_task_stats()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'mine', (
      select jsonb_build_object(
        'total',       count(*) filter (where effective_status <> 'cancelled'),
        'pending',     count(*) filter (where effective_status = 'pending'),
        'in_progress', count(*) filter (where effective_status = 'in_progress'),
        'completed',   count(*) filter (where effective_status = 'completed'),
        'overdue',     count(*) filter (where effective_status = 'overdue'))
      from v_task_assignments where user_id = auth.uid()),
    'assigned_by_me', (
      select jsonb_build_object(
        'total',       count(*) filter (where effective_status <> 'cancelled'),
        'pending',     count(*) filter (where effective_status = 'pending'),
        'in_progress', count(*) filter (where effective_status = 'in_progress'),
        'completed',   count(*) filter (where effective_status = 'completed'),
        'overdue',     count(*) filter (where effective_status = 'overdue'))
      from v_tasks where created_by = auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Chat
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_direct_conversation(p_other_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := public._require_active_user();
  v_key  text;
  v_conv uuid;
begin
  if p_other_user is null or p_other_user = v_uid then
    raise exception 'Choose another user to chat with' using errcode = '22023';
  end if;
  if not exists (select 1 from profiles where id = p_other_user and status = 'active') then
    raise exception 'User not found or inactive' using errcode = '22023';
  end if;
  v_key := least(v_uid::text, p_other_user::text) || ':' || greatest(v_uid::text, p_other_user::text);

  select id into v_conv from conversations where direct_key = v_key;
  if v_conv is null then
    insert into conversations (kind, direct_key, created_by) values ('direct', v_key, v_uid)
      on conflict (direct_key) do nothing
      returning id into v_conv;
    if v_conv is null then
      select id into v_conv from conversations where direct_key = v_key;
    else
      insert into conversation_participants (conversation_id, user_id)
      values (v_conv, v_uid), (v_conv, p_other_user);
    end if;
  end if;
  return v_conv;
end $$;

create or replace function public.list_conversations()
returns table (
  conversation_id  uuid,
  other_user_id    uuid,
  other_name       text,
  other_designation text,
  other_status     public.user_status,
  last_message     text,
  last_message_at  timestamptz,
  last_sender_id   uuid,
  unread_count     bigint)
language sql stable security invoker set search_path = public as $$
  select c.id, op.user_id, p.full_name, p.designation, p.status,
         lm.body, coalesce(lm.created_at, c.created_at), lm.sender_id,
         (select count(*) from messages m
           where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.read_at is null)
  from conversation_participants me
  join conversations c on c.id = me.conversation_id
  join conversation_participants op on op.conversation_id = c.id and op.user_id <> me.user_id
  join profiles p on p.id = op.user_id
  left join lateral (
    select m.body, m.created_at, m.sender_id from messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_active_user();
begin
  if not public.is_conversation_participant(p_conversation_id) then
    raise exception 'Conversation not found' using errcode = '42501';
  end if;
  update messages set read_at = now()
   where conversation_id = p_conversation_id and sender_id <> v_uid and read_at is null;
  update conversation_participants set last_read_at = now()
   where conversation_id = p_conversation_id and user_id = v_uid;
end $$;

create or replace function public.touch_conversation_on_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;

create trigger messages_touch_conversation after insert on public.messages
  for each row execute function public.touch_conversation_on_message();

create or replace function public.unread_message_count()
returns bigint language sql stable security invoker set search_path = public as $$
  select count(*) from messages m
  where m.sender_id <> auth.uid() and m.read_at is null
    and public.is_conversation_participant(m.conversation_id);
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_active_user();
begin
  update notifications set read_at = now()
   where user_id = v_uid and read_at is null and (p_ids is null or id = any (p_ids));
end $$;

create or replace function public.mark_notifications_delivered(p_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_active_user();
begin
  update notifications set delivered_at = now()
   where user_id = v_uid and delivered_at is null and id = any (p_ids);
end $$;

create or replace function public.clear_must_change_password()
returns void language plpgsql security definer set search_path = public as $$
declare v_uid uuid := public._require_active_user();
begin
  update profiles set must_change_password = false where id = v_uid;
end $$;

-- ---------------------------------------------------------------------------
-- Reminders. Run every 5 minutes by pg_cron (all users) and also invoked by
-- each desktop client on start/reconnect (then limited to the caller).
-- reminder_log guarantees each reminder is sent once:
--   * before deadline : only the nearest configured offset fires (if the app
--                       was off for a day you get one reminder, not three)
--   * at deadline     : "Task due now" within 30 minutes of the due time
--   * overdue         : at most one per assignee per local calendar day,
--                       for up to 30 days; the creator is told once.
-- ---------------------------------------------------------------------------
create or replace function public.generate_due_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  r        record;
  v_offset integer;
  v_count  integer := 0;
  v_day    text;
begin
  for r in
    select a.id as assignment_id, a.user_id, t.id as task_id, t.title, t.due_at, t.timezone, t.created_by,
           coalesce(s.reminder_offsets_minutes, '{1440,120,30}') as offsets,
           coalesce(s.notify_reminders, true) as wants_reminders,
           p.timezone as user_tz, p.full_name
    from task_assignments a
    join tasks t    on t.id = a.task_id
    join profiles p on p.id = a.user_id and p.status = 'active'
    left join user_settings s on s.user_id = a.user_id
    where a.status in ('pending', 'in_progress')
      and t.status = 'open'
      and t.due_at <= now() + interval '7 days'
      and t.due_at >= now() - interval '30 days'
      and (v_uid is null or a.user_id = v_uid or t.created_by = v_uid)
  loop
    if now() < r.due_at then
      if not r.wants_reminders then continue; end if;
      select min(o) into v_offset from unnest(r.offsets) o
       where o > 0 and now() >= r.due_at - make_interval(mins => o);
      if v_offset is not null then
        insert into reminder_log (assignment_id, kind) values (r.assignment_id, 'before_' || v_offset)
          on conflict do nothing;
        if found then
          insert into reminder_log (assignment_id, kind)
            select r.assignment_id, 'before_' || o from unnest(r.offsets) o where o > v_offset
            on conflict do nothing;
          perform public._notify(r.user_id, 'task_reminder', 'Task deadline approaching',
            format('"%s" is due %s', r.title, public._fmt_due(r.due_at, r.user_tz)), r.task_id);
          v_count := v_count + 1;
        end if;
      end if;

    elsif now() < r.due_at + interval '30 minutes' then
      insert into reminder_log (assignment_id, kind) values (r.assignment_id, 'due') on conflict do nothing;
      if found then
        perform public._notify(r.user_id, 'task_due', 'Task due now',
          format('"%s" was due %s. Please update the task status.', r.title, public._fmt_due(r.due_at, r.user_tz)),
          r.task_id);
        v_count := v_count + 1;
      end if;

    else
      v_day := to_char((now() at time zone r.user_tz)::date, 'YYYY-MM-DD');
      insert into reminder_log (assignment_id, kind) values (r.assignment_id, 'overdue_' || v_day) on conflict do nothing;
      if found then
        perform public._notify(r.user_id, 'task_overdue', 'Task overdue',
          format('"%s" was due %s. Please update the task status.', r.title, public._fmt_due(r.due_at, r.user_tz)),
          r.task_id);
        v_count := v_count + 1;
      end if;
      if r.created_by <> r.user_id then
        insert into reminder_log (assignment_id, kind) values (r.assignment_id, 'creator_overdue') on conflict do nothing;
        if found then
          perform public._notify(r.created_by, 'task_overdue', 'Assigned task overdue',
            format('"%s" assigned to %s is overdue (due %s)', r.title, r.full_name, public._fmt_due(r.due_at, r.timezone)),
            r.task_id);
          v_count := v_count + 1;
        end if;
      end if;
    end if;
  end loop;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Privileges for the functions above
-- ---------------------------------------------------------------------------
revoke all on function
  public.effective_assignment_status(public.assignment_status, public.task_status, timestamptz),
  public._require_active_user(),
  public._notify(uuid, text, text, text, uuid, uuid),
  public._log(uuid, uuid, text, text, text, uuid, uuid),
  public._fmt_due(timestamptz, text),
  public._refresh_task_completion(uuid),
  public.create_task(text, text, timestamptz, uuid[], public.task_priority, date, date, text),
  public.update_task(uuid, text, text, timestamptz, public.task_priority, date, text),
  public.set_task_assignees(uuid, uuid[]),
  public.cancel_task(uuid, text),
  public.update_assignment_progress(uuid, public.assignment_status, integer, text),
  public.my_task_stats(),
  public.get_or_create_direct_conversation(uuid),
  public.list_conversations(),
  public.mark_conversation_read(uuid),
  public.touch_conversation_on_message(),
  public.unread_message_count(),
  public.mark_notifications_read(uuid[]),
  public.mark_notifications_delivered(uuid[]),
  public.clear_must_change_password(),
  public.generate_due_reminders()
from public, anon, authenticated;

grant execute on function
  public.effective_assignment_status(public.assignment_status, public.task_status, timestamptz),
  public.create_task(text, text, timestamptz, uuid[], public.task_priority, date, date, text),
  public.update_task(uuid, text, text, timestamptz, public.task_priority, date, text),
  public.set_task_assignees(uuid, uuid[]),
  public.cancel_task(uuid, text),
  public.update_assignment_progress(uuid, public.assignment_status, integer, text),
  public.my_task_stats(),
  public.get_or_create_direct_conversation(uuid),
  public.list_conversations(),
  public.mark_conversation_read(uuid),
  public.unread_message_count(),
  public.mark_notifications_read(uuid[]),
  public.mark_notifications_delivered(uuid[]),
  public.clear_must_change_password(),
  public.generate_due_reminders()
to authenticated;
