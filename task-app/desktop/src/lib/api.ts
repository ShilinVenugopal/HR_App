// Typed data-access layer. Every call goes through Supabase with the signed-in
// user's JWT, so RLS decides what comes back — nothing here is a security
// boundary, it just keeps the pages tidy.
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type {
  AppNotification,
  AssignmentRow,
  AssignmentStatus,
  ConversationSummary,
  EffectiveStatus,
  Message,
  Priority,
  Profile,
  TaskActivity,
  TaskRow,
  TaskStats,
  UserSettings,
} from './types';

type Result<T> = { data: T | null; error: { message: string; code?: string } | null; count?: number | null };

/** Turn Postgres/PostgREST errors into messages fit for a toast. */
function friendly(message: string, code?: string) {
  if (code === '42501' && /row-level security|permission denied/i.test(message)) return 'You do not have access to do that.';
  if (/Failed to fetch|NetworkError|fetch failed/i.test(message)) return 'Cannot reach the server. Check your internet connection.';
  if (/JWT expired/i.test(message)) return 'Your session expired. Please sign in again.';
  return message;
}

async function unwrap<T>(p: PromiseLike<Result<T>>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(friendly(error.message, error.code));
  return data as T;
}

async function unwrapCount<T>(p: PromiseLike<Result<T[]>>): Promise<{ rows: T[]; count: number }> {
  const { data, error, count } = await p;
  if (error) throw new Error(friendly(error.message, error.code));
  return { rows: data ?? [], count: count ?? 0 };
}

/** Strip characters that have meaning inside a PostgREST `or=(...)` filter. */
const safeSearch = (s: string) => s.replace(/[,()*%\\]/g, ' ').trim();

export const PAGE_SIZE = 25;

// ---------------------------------------------------------------------------
// Users / profile
// ---------------------------------------------------------------------------
export const getProfile = (id: string) =>
  unwrap<Profile>(supabase.from('profiles').select('*').eq('id', id).single());

/** Active staff directory (for assignee pickers and new chats). */
export const listActiveUsers = () =>
  unwrap<Profile[]>(supabase.from('profiles').select('*').eq('status', 'active').order('full_name'));

export const listAllUsers = () => unwrap<Profile[]>(supabase.from('profiles').select('*').order('full_name'));

export const listRoles = () =>
  unwrap<{ code: string; name: string }[]>(supabase.from('roles').select('code, name').order('name'));

export const updateOwnProfile = (id: string, patch: Pick<Partial<Profile>, 'full_name' | 'mobile' | 'timezone' | 'avatar_url'>) =>
  unwrap(supabase.from('profiles').update(patch).eq('id', id));

export const adminUpdateProfile = (
  id: string,
  patch: Pick<Partial<Profile>, 'full_name' | 'mobile' | 'employee_code' | 'department' | 'designation' | 'role'>,
) => unwrap(supabase.from('profiles').update(patch).eq('id', id));

async function adminFunction(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context.json().catch(() => null);
      throw new Error(payload?.error ?? 'Request failed');
    }
    throw new Error(friendly(error.message));
  }
  return data;
}

export interface NewUserInput {
  email: string;
  full_name: string;
  password: string;
  role: string;
  employee_code?: string;
  department?: string;
  designation?: string;
  mobile?: string;
}
export const adminCreateUser = (input: NewUserInput) => adminFunction({ action: 'create', ...input });
export const adminSetStatus = (user_id: string, status: 'active' | 'inactive') =>
  adminFunction({ action: 'set_status', user_id, status });
export const adminResetPassword = (user_id: string, password: string) =>
  adminFunction({ action: 'reset_password', user_id, password });

export const clearMustChangePassword = () => unwrap(supabase.rpc('clear_must_change_password'));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const getSettings = () => unwrap<UserSettings>(supabase.from('user_settings').select('*').single());
export const updateSettings = (userId: string, patch: Partial<Omit<UserSettings, 'user_id'>>) =>
  unwrap(supabase.from('user_settings').update(patch).eq('user_id', userId));

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export const getTaskStats = () => unwrap<TaskStats>(supabase.rpc('my_task_stats'));

export interface TaskFilters {
  search?: string;
  status?: EffectiveStatus | '';
  priority?: Priority | '';
  dueFrom?: string;
  dueTo?: string;
  sort?: { column: string; ascending: boolean };
  page?: number;
}

export function listMyAssignments(userId: string, f: TaskFilters) {
  let q = supabase.from('v_task_assignments').select('*', { count: 'exact' }).eq('user_id', userId);
  const s = safeSearch(f.search ?? '');
  if (s) q = q.or(`title.ilike.*${s}*,created_by_name.ilike.*${s}*,description.ilike.*${s}*`);
  if (f.status) q = q.eq('effective_status', f.status);
  if (f.priority) q = q.eq('priority', f.priority);
  if (f.dueFrom) q = q.gte('due_date', f.dueFrom);
  if (f.dueTo) q = q.lte('due_date', f.dueTo);
  const sort = f.sort ?? { column: 'due_at', ascending: true };
  const page = f.page ?? 0;
  return unwrapCount<AssignmentRow>(
    q.order(sort.column, { ascending: sort.ascending }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
  );
}

/** scope 'created' = tasks I assigned; 'all' = everything RLS lets me see (admins: all). */
export function listTasks(userId: string, scope: 'created' | 'all', f: TaskFilters) {
  let q = supabase.from('v_tasks').select('*', { count: 'exact' });
  if (scope === 'created') q = q.eq('created_by', userId);
  const s = safeSearch(f.search ?? '');
  if (s) q = q.or(`title.ilike.*${s}*,assignee_names.ilike.*${s}*,created_by_name.ilike.*${s}*`);
  if (f.status) q = q.eq('effective_status', f.status);
  if (f.priority) q = q.eq('priority', f.priority);
  if (f.dueFrom) q = q.gte('due_date', f.dueFrom);
  if (f.dueTo) q = q.lte('due_date', f.dueTo);
  const sort = f.sort ?? { column: 'due_at', ascending: true };
  const page = f.page ?? 0;
  return unwrapCount<TaskRow>(
    q.order(sort.column, { ascending: sort.ascending }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1),
  );
}

/** Upcoming/overdue open assignments for the dashboard. */
export const listUpcomingAssignments = (userId: string) =>
  unwrap<AssignmentRow[]>(
    supabase
      .from('v_task_assignments')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['pending', 'in_progress'])
      .eq('task_status', 'open')
      .order('due_at', { ascending: true })
      .limit(8),
  );

export const getTask = (id: string) => unwrap<TaskRow | null>(supabase.from('v_tasks').select('*').eq('id', id).maybeSingle());

export const getTaskAssignments = (taskId: string) =>
  unwrap<AssignmentRow[]>(supabase.from('v_task_assignments').select('*').eq('task_id', taskId).order('assignee_name'));

export const getTaskActivity = (taskId: string) =>
  unwrap<TaskActivity[]>(
    supabase
      .from('task_activity')
      .select('*, actor:profiles!task_activity_user_id_fkey(full_name)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true }),
  );

export interface TaskInput {
  title: string;
  description: string;
  dueAt: string;
  priority: Priority;
  assignedDate?: string;
  startDate?: string | null;
  timezone: string;
  assigneeIds: string[];
}

export const createTask = (t: TaskInput) =>
  unwrap<string>(
    supabase.rpc('create_task', {
      p_title: t.title,
      p_description: t.description,
      p_due_at: t.dueAt,
      p_assignee_ids: t.assigneeIds,
      p_priority: t.priority,
      p_assigned_date: t.assignedDate || null,
      p_start_date: t.startDate || null,
      p_timezone: t.timezone,
    }),
  );

export async function updateTask(id: string, t: TaskInput) {
  await unwrap(
    supabase.rpc('update_task', {
      p_task_id: id,
      p_title: t.title,
      p_description: t.description,
      p_due_at: t.dueAt,
      p_priority: t.priority,
      p_start_date: t.startDate || null,
      p_timezone: t.timezone,
    }),
  );
  await unwrap(supabase.rpc('set_task_assignees', { p_task_id: id, p_assignee_ids: t.assigneeIds }));
}

export const cancelTask = (id: string, reason: string) =>
  unwrap(supabase.rpc('cancel_task', { p_task_id: id, p_reason: reason }));

export const updateProgress = (assignmentId: string, status: AssignmentStatus, progress: number, remarks: string) =>
  unwrap(
    supabase.rpc('update_assignment_progress', {
      p_assignment_id: assignmentId,
      p_status: status,
      p_progress: progress,
      p_remarks: remarks,
    }),
  );

export const generateReminders = () => unwrap<number>(supabase.rpc('generate_due_reminders'));

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
export const listNotifications = (onlyUnread = false) => {
  let q = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200);
  if (onlyUnread) q = q.is('read_at', null);
  return unwrap<AppNotification[]>(q);
};

export async function unreadNotificationCount() {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw new Error(friendly(error.message, error.code));
  return count ?? 0;
}

export const listUndelivered = () =>
  unwrap<AppNotification[]>(
    supabase.from('notifications').select('*').is('delivered_at', null).order('created_at').limit(50),
  );

export const markNotificationsRead = (ids?: string[]) =>
  unwrap(supabase.rpc('mark_notifications_read', { p_ids: ids ?? null }));

export const markNotificationsDelivered = (ids: string[]) =>
  unwrap(supabase.rpc('mark_notifications_delivered', { p_ids: ids }));

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
export const listConversations = () => unwrap<ConversationSummary[]>(supabase.rpc('list_conversations'));

export const openDirectConversation = (otherUserId: string) =>
  unwrap<string>(supabase.rpc('get_or_create_direct_conversation', { p_other_user: otherUserId }));

export async function listMessages(conversationId: string) {
  const rows = await unwrap<Message[]>(
    supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(200),
  );
  return rows.reverse();
}

export const sendMessage = (conversationId: string, senderId: string, body: string) =>
  unwrap<Message>(
    supabase.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, body }).select().single(),
  );

export const markConversationRead = (conversationId: string) =>
  unwrap(supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId }));

export const unreadMessageCount = () => unwrap<number>(supabase.rpc('unread_message_count'));
