-- =============================================================================
-- FORAYS TASK APP — realtime publication + scheduled reminders
-- =============================================================================

-- Supabase Realtime evaluates each subscriber's RLS SELECT policy before
-- delivering a change, so publishing these tables leaks nothing.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table
  public.tasks,
  public.task_assignments,
  public.task_activity,
  public.notifications,
  public.messages,
  public.conversation_participants;

-- Full old-row images so UPDATE events carry every column.
alter table public.task_assignments replica identity full;
alter table public.messages replica identity full;

-- Reminder generator every 5 minutes (pg_cron is available on every Supabase
-- plan; skipped silently on plain Postgres used for local RLS tests).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'forays-task-reminders';
    perform cron.schedule('forays-task-reminders', '*/5 * * * *', 'select public.generate_due_reminders()');
  end if;
end $$;
