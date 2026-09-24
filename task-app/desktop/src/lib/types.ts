// Types mirroring the Supabase schema (supabase/migrations). Kept by hand
// because the schema is small; regenerate with `supabase gen types` if it grows.

export type Role = 'admin' | 'user' | (string & {});
export type UserStatus = 'active' | 'inactive';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskStatus = 'open' | 'completed' | 'cancelled';
export type AssignmentStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
/** Assignment/task status as shown in the UI: stored status + derived "overdue". */
export type EffectiveStatus = AssignmentStatus | 'overdue';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  employee_code: string | null;
  department: string | null;
  designation: string | null;
  mobile: string | null;
  avatar_url: string | null;
  role: Role;
  status: UserStatus;
  must_change_password: boolean;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface UserSettings {
  user_id: string;
  notify_task_assigned: boolean;
  notify_task_updates: boolean;
  notify_reminders: boolean;
  notify_chat: boolean;
  reminder_offsets_minutes: number[];
}

/** Row of v_task_assignments (one per assignee). */
export interface AssignmentRow {
  assignment_id: string;
  task_id: string;
  task_no: number;
  title: string;
  description: string | null;
  priority: Priority;
  task_status: TaskStatus;
  assigned_date: string;
  start_date: string | null;
  due_at: string;
  timezone: string;
  due_date: string;
  due_time: string;
  created_by: string;
  created_by_name: string;
  user_id: string;
  assignee_name: string;
  assignee_email: string;
  status: AssignmentStatus;
  effective_status: EffectiveStatus;
  progress: number;
  remarks: string | null;
  completion_remarks: string | null;
  completed_at: string | null;
  updated_at: string;
  created_at: string;
}

/** Row of v_tasks (one per task, with assignee roll-up). */
export interface TaskRow {
  id: string;
  task_no: number;
  title: string;
  description: string | null;
  priority: Priority;
  status: TaskStatus;
  assigned_date: string;
  start_date: string | null;
  due_at: string;
  timezone: string;
  due_date: string;
  due_time: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  cancelled_at: string | null;
  assignee_count: number;
  completed_count: number;
  avg_progress: number;
  assignee_names: string;
  effective_status: EffectiveStatus;
}

export interface TaskActivity {
  id: number;
  task_id: string;
  assignment_id: string | null;
  user_id: string | null;
  target_user_id: string | null;
  action: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor: { full_name: string } | null;
}

export interface StatBlock {
  total: number;
  pending: number;
  in_progress: number;
  completed: number;
  overdue: number;
}

export interface TaskStats {
  mine: StatBlock;
  assigned_by_me: StatBlock;
}

export interface AppNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  task_id: string | null;
  conversation_id: string | null;
  read_at: string | null;
  delivered_at: string | null;
  created_at: string;
}

export interface ConversationSummary {
  conversation_id: string;
  other_user_id: string;
  other_name: string;
  other_designation: string | null;
  other_status: UserStatus;
  last_message: string | null;
  last_message_at: string;
  last_sender_id: string | null;
  unread_count: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}
