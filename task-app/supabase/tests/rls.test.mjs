// Security + business-rule tests for the Forays Task App database.
//
// Runs against a scratch PostgreSQL database prepared by reset-db.sh (Supabase
// auth stub + all migrations). Each "as user" call runs exactly the way a
// Supabase API request does: role `authenticated` with the user's JWT claims,
// so every RLS policy and RPC check is exercised for real.
//
//   PGHOST=/tmp PGPORT=54329 PGUSER=postgres npm test
import pg from 'pg';
import assert from 'node:assert/strict';

const db = new pg.Client({ database: process.env.PGDATABASE || 'forays_task_test' });
await db.connect();

let passed = 0;
const failures = [];
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✘ ${name}\n      ${err.message}`);
  }
}

/** Run `fn(query)` inside a transaction as the given user (or anon when id is null). */
async function as(userId, fn) {
  await db.query('begin');
  try {
    await db.query(`set local role ${userId ? 'authenticated' : 'anon'}`);
    await db.query(`select set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' }),
    ]);
    const q = async (sql, params) => (await db.query(sql, params)).rows;
    const result = await fn(q);
    await db.query('commit');
    return result;
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}

async function expectError(promise, pattern) {
  try {
    await promise;
  } catch (err) {
    if (pattern) assert.match(err.message, pattern);
    return;
  }
  throw new Error('expected an error but the call succeeded');
}

async function createUser(email, fullName, role = 'user') {
  const { rows } = await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`,
    [email, { full_name: fullName }],
  );
  if (role !== 'user') await db.query(`update profiles set role = $1 where id = $2`, [role, rows[0].id]);
  return rows[0].id;
}

const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();

console.log('\nForays Task App — database security tests\n');

// ---------------------------------------------------------------------------
const shilin = await createUser('shilin@foraysgroup.in', 'Shilin Venugopal', 'admin');
const rahul = await createUser('rahul@foraysgroup.in', 'Rahul');
const anil = await createUser('anil@foraysgroup.in', 'Anil');
const manoj = await createUser('manoj@foraysgroup.in', 'Manoj');
const suresh = await createUser('suresh@foraysgroup.in', 'Suresh');

console.log('Authentication / users');
await test('non-Forays e-mail domains cannot be registered', async () => {
  await expectError(db.query(`insert into auth.users (email) values ('someone@gmail.com')`), /Only Forays Group/);
});
await test('a "role" in sign-up metadata is ignored (no self-made admins)', async () => {
  const { rows } = await db.query(
    `insert into auth.users (email, raw_user_meta_data) values ('sneaky@foraysgroup.in', '{"role":"admin"}') returning id`,
  );
  const p = await db.query(`select role from profiles where id = $1`, [rows[0].id]);
  assert.equal(p.rows[0].role, 'user');
});
await test('profile + settings are auto-created for Forays users', async () => {
  const rows = await as(rahul, (q) => q(`select full_name, role, status from profiles where id = $1`, [rahul]));
  assert.deepEqual(rows[0], { full_name: 'Rahul', role: 'user', status: 'active' });
  const s = await as(rahul, (q) => q(`select reminder_offsets_minutes from user_settings`));
  assert.deepEqual(s[0].reminder_offsets_minutes, [1440, 120, 30]);
});
await test('logged-out (anon) callers can read nothing', async () => {
  await expectError(as(null, (q) => q(`select * from profiles`)), /permission denied/);
  await expectError(as(null, (q) => q(`select * from tasks`)), /permission denied/);
  await expectError(as(null, (q) => q(`select public.create_task('x', null, now(), array[]::uuid[])`)), /permission denied/);
});
await test('a normal user cannot make themselves admin', async () => {
  await expectError(as(rahul, (q) => q(`update profiles set role = 'admin' where id = $1`, [rahul])), /only update your own/);
});
await test('a normal user cannot edit someone else\'s profile', async () => {
  const rows = await as(rahul, (q) => q(`update profiles set mobile = '1' where id = $1 returning id`, [anil]));
  assert.equal(rows.length, 0);
});
await test('a user can update their own mobile number', async () => {
  const rows = await as(rahul, (q) => q(`update profiles set mobile = '9999999999' where id = $1 returning mobile`, [rahul]));
  assert.equal(rows[0].mobile, '9999999999');
});
await test('admin can change roles and deactivate users', async () => {
  await as(shilin, (q) => q(`update profiles set designation = 'Engineer', status = 'inactive' where id = $1`, [suresh]));
  const [p] = await as(shilin, (q) => q(`select status, designation from profiles where id = $1`, [suresh]));
  assert.deepEqual(p, { status: 'inactive', designation: 'Engineer' });
});
await test('the last active admin cannot be demoted', async () => {
  await expectError(as(shilin, (q) => q(`update profiles set role = 'user' where id = $1`, [shilin])), /At least one active Admin/);
});
await test('non-admins cannot manage allowed e-mail domains', async () => {
  await expectError(as(rahul, (q) => q(`insert into allowed_email_domains values ('evil.com')`)), /row-level security/);
});

// ---------------------------------------------------------------------------
console.log('\nScenario 1 — assign, progress, complete');
let task1, rahulAssignment1;
await test('Shilin creates a task for Rahul', async () => {
  const [{ create_task }] = await as(shilin, (q) =>
    q(`select public.create_task($1, $2, $3, $4, 'high')`, [
      'Prepare RIL AMC manpower report',
      'Prepare the manpower report for August\nand submit it to management.',
      inHours(48),
      [rahul],
    ]),
  );
  task1 = create_task;
  assert.ok(task1);
});
await test('Rahul receives a "task assigned" notification', async () => {
  const rows = await as(rahul, (q) => q(`select type, title from notifications where task_id = $1`, [task1]));
  assert.deepEqual(rows, [{ type: 'task_assigned', title: 'New task assigned' }]);
});
await test('Rahul can open the task (multiline description kept)', async () => {
  const [t] = await as(rahul, (q) => q(`select * from v_task_assignments where task_id = $1`, [task1]));
  assert.equal(t.title, 'Prepare RIL AMC manpower report');
  assert.match(t.description, /\n/);
  assert.equal(t.effective_status, 'pending');
  rahulAssignment1 = t.assignment_id;
});
await test('Rahul updates progress to 50% with remarks', async () => {
  await as(rahul, (q) => q(`select public.update_assignment_progress($1, 'in_progress', 50, 'Documents collected. Waiting for project data.')`, [rahulAssignment1]));
});
await test('Shilin sees 50% / in progress and gets a progress notification', async () => {
  const [a] = await as(shilin, (q) => q(`select progress, effective_status, remarks from v_task_assignments where task_id = $1`, [task1]));
  assert.deepEqual(a, { progress: 50, effective_status: 'in_progress', remarks: 'Documents collected. Waiting for project data.' });
  const n = await as(shilin, (q) => q(`select type from notifications where task_id = $1`, [task1]));
  assert.deepEqual(n.map((x) => x.type), ['task_progress']);
});
await test('Rahul completes the task; Shilin sees Completed', async () => {
  await as(rahul, (q) => q(`select public.update_assignment_progress($1, 'completed', 80, 'Submitted to management')`, [rahulAssignment1]));
  const [a] = await as(shilin, (q) => q(`select progress, effective_status, completion_remarks, completed_at from v_task_assignments where task_id = $1`, [task1]));
  assert.equal(a.progress, 100);
  assert.equal(a.effective_status, 'completed');
  assert.equal(a.completion_remarks, 'Submitted to management');
  assert.ok(a.completed_at);
  const [t] = await as(shilin, (q) => q(`select status, completed_at from tasks where id = $1`, [task1]));
  assert.equal(t.status, 'completed');
  const n = await as(shilin, (q) => q(`select type from notifications where task_id = $1 order by created_at`, [task1]));
  assert.ok(n.some((x) => x.type === 'task_completed'));
});
await test('activity history records create, assign, progress, remarks, completion', async () => {
  const rows = await as(shilin, (q) => q(`select action from task_activity where task_id = $1 order by id`, [task1]));
  assert.deepEqual(rows.map((r) => r.action), ['created', 'assigned', 'status_changed', 'progress_updated', 'remarks_updated', 'completed']);
});

// ---------------------------------------------------------------------------
console.log('\nScenario 2 — one task, several assignees, independent progress');
let task2;
await test('Shilin assigns one task to Rahul, Anil and Manoj', async () => {
  [{ create_task: task2 }] = await as(shilin, (q) =>
    q(`select public.create_task('Prepare Project 101 monthly expense report', null, $1, $2)`, [inHours(72), [rahul, anil, manoj]]),
  );
  const rows = await db.query(`select count(*)::int as n from task_assignments where task_id = $1`, [task2]);
  assert.equal(rows.rows[0].n, 3);
});
await test('each assignee updates only their own row (100 / 50 / 25)', async () => {
  for (const [user, pct] of [[rahul, 100], [anil, 50], [manoj, 25]]) {
    await as(user, async (q) => {
      const [{ assignment_id }] = await q(`select assignment_id from v_task_assignments where task_id = $1 and user_id = $2`, [task2, user]);
      await q(`select public.update_assignment_progress($1, 'in_progress', $2, null)`, [assignment_id, pct]);
    });
  }
  const rows = await as(shilin, (q) => q(`select assignee_name, progress, effective_status from v_task_assignments where task_id = $1 order by assignee_name`, [task2]));
  assert.deepEqual(rows, [
    { assignee_name: 'Anil', progress: 50, effective_status: 'in_progress' },
    { assignee_name: 'Manoj', progress: 25, effective_status: 'in_progress' },
    { assignee_name: 'Rahul', progress: 100, effective_status: 'completed' },
  ]);
  const [t] = await as(shilin, (q) => q(`select avg_progress, completed_count, assignee_count, effective_status from v_tasks where id = $1`, [task2]));
  assert.deepEqual(t, { avg_progress: 58, completed_count: 1, assignee_count: 3, effective_status: 'in_progress' });
});
await test("Anil cannot update Rahul's assignment", async () => {
  const [{ assignment_id }] = await as(anil, (q) => q(`select assignment_id from v_task_assignments where task_id = $1 and user_id = $2`, [task2, rahul]));
  await expectError(as(anil, (q) => q(`select public.update_assignment_progress($1, 'completed', 100, null)`, [assignment_id])), /not assigned to you/);
});
await test('assignees cannot edit or cancel a task they did not create', async () => {
  await expectError(as(anil, (q) => q(`select public.cancel_task($1)`, [task2])), /not allowed/);
  await expectError(as(anil, (q) => q(`select public.update_task($1, 'x', null, now(), 'low')`, [task2])), /not allowed/);
});
await test('creator can change assignees (remove Manoj, add Suresh fails: inactive)', async () => {
  await expectError(as(shilin, (q) => q(`select public.set_task_assignees($1, $2)`, [task2, [rahul, anil, suresh]])), /not active/);
  await as(shilin, (q) => q(`select public.set_task_assignees($1, $2)`, [task2, [rahul, anil]]));
  const rows = await as(manoj, (q) => q(`select id from tasks where id = $1`, [task2]));
  assert.equal(rows.length, 0, 'Manoj should lose access once unassigned');
});

// ---------------------------------------------------------------------------
console.log('\nScenario 3 — reminders and overdue');
let task3;
await test('a task past its deadline shows as Overdue (due date untouched)', async () => {
  [{ create_task: task3 }] = await as(shilin, (q) => q(`select public.create_task('Submit compliance returns', null, $1, $2)`, [inHours(-2), [rahul]]));
  const [a] = await as(rahul, (q) => q(`select effective_status, status from v_task_assignments where task_id = $1`, [task3]));
  assert.deepEqual(a, { effective_status: 'overdue', status: 'pending' });
});
await test('the assignee gets exactly one overdue notification (no repeats)', async () => {
  await as(rahul, (q) => q(`select public.generate_due_reminders()`));
  await as(rahul, (q) => q(`select public.generate_due_reminders()`));
  await db.query(`select public.generate_due_reminders()`); // the pg_cron path (all users)
  const rows = await as(rahul, (q) => q(`select type, title from notifications where task_id = $1 and type = 'task_overdue'`, [task3]));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Task overdue');
  const creator = await as(shilin, (q) => q(`select title from notifications where task_id = $1 and type = 'task_overdue'`, [task3]));
  assert.deepEqual(creator.map((r) => r.title), ['Assigned task overdue']);
});
await test('approaching deadline: only the nearest reminder fires, once', async () => {
  const [{ create_task: t }] = await as(shilin, (q) => q(`select public.create_task('Call client', null, $1, $2)`, [inHours(0.3), [anil]]));
  await db.query(`select public.generate_due_reminders()`);
  await db.query(`select public.generate_due_reminders()`);
  const rows = await as(anil, (q) => q(`select type from notifications where task_id = $1 and type = 'task_reminder'`, [t]));
  assert.equal(rows.length, 1);
  const log = await db.query(`select kind from reminder_log l join task_assignments a on a.id = l.assignment_id where a.task_id = $1 order by kind`, [t]);
  assert.deepEqual(log.rows.map((r) => r.kind), ['before_120', 'before_1440', 'before_30']);
});
await test('completed tasks do not produce reminders', async () => {
  const before = (await db.query(`select count(*)::int n from notifications where task_id = $1`, [task1])).rows[0].n;
  await db.query(`select public.generate_due_reminders()`);
  const after = (await db.query(`select count(*)::int n from notifications where task_id = $1`, [task1])).rows[0].n;
  assert.equal(after, before);
});

// ---------------------------------------------------------------------------
console.log('\nScenario 4 — task isolation');
await test("Manoj cannot read Shilin→Rahul's task by id (tables and views)", async () => {
  await as(manoj, async (q) => {
    assert.equal((await q(`select * from tasks where id = $1`, [task1])).length, 0);
    assert.equal((await q(`select * from task_assignments where task_id = $1`, [task1])).length, 0);
    assert.equal((await q(`select * from task_activity where task_id = $1`, [task1])).length, 0);
    assert.equal((await q(`select * from v_tasks where id = $1`, [task1])).length, 0);
    assert.equal((await q(`select * from v_task_assignments where task_id = $1`, [task1])).length, 0);
  });
});
await test("Manoj cannot update Rahul's assignment via RPC by guessing its id", async () => {
  await expectError(as(manoj, (q) => q(`select public.update_assignment_progress($1, 'completed', 100, null)`, [rahulAssignment1])), /not assigned to you/);
});
await test('direct table writes are blocked (must go through RPCs)', async () => {
  await expectError(as(rahul, (q) => q(`insert into tasks (title, created_by, due_at) values ('x', $1, now())`, [rahul])), /permission denied/);
  await expectError(as(rahul, (q) => q(`update task_assignments set progress = 100 where id = $1`, [rahulAssignment1])), /permission denied/);
  await expectError(as(rahul, (q) => q(`delete from tasks where id = $1`, [task1])), /permission denied/);
  await expectError(as(rahul, (q) => q(`insert into notifications (user_id, type, title, message) values ($1, 'x', 'x', 'x')`, [anil])), /permission denied/);
});
await test("users only see their own notifications", async () => {
  const rows = await as(manoj, (q) => q(`select user_id from notifications`));
  assert.ok(rows.every((r) => r.user_id === manoj));
});
await test('admin can see system-wide tasks', async () => {
  // make Anil an admin temporarily to view a task he is not part of
  await db.query(`update profiles set role = 'admin' where id = $1`, [anil]);
  const rows = await as(anil, (q) => q(`select id from tasks where id = $1`, [task1]));
  assert.equal(rows.length, 1);
  await db.query(`update profiles set role = 'user' where id = $1`, [anil]);
});
await test('a deactivated user loses access immediately', async () => {
  await db.query(`update profiles set status = 'inactive' where id = $1`, [rahul]);
  const rows = await as(rahul, (q) => q(`select id from tasks`));
  assert.equal(rows.length, 0);
  await expectError(as(rahul, (q) => q(`select public.create_task('x', null, now(), $1)`, [[anil]])), /inactive/);
  await db.query(`update profiles set status = 'active' where id = $1`, [rahul]);
});

// ---------------------------------------------------------------------------
console.log('\nScenario 5 — private chat');
let conv;
await test('Rahul starts a chat with Manoj and sends a message', async () => {
  [{ get_or_create_direct_conversation: conv }] = await as(rahul, (q) => q(`select public.get_or_create_direct_conversation($1)`, [manoj]));
  await as(rahul, (q) => q(`insert into messages (conversation_id, sender_id, body) values ($1, $2, 'Hi Manoj, report status?')`, [conv, rahul]));
  const [{ get_or_create_direct_conversation: again }] = await as(manoj, (q) => q(`select public.get_or_create_direct_conversation($1)`, [rahul]));
  assert.equal(again, conv, 'same pair must reuse one conversation');
});
await test('Manoj sees it as unread, then marks it read', async () => {
  const [c] = await as(manoj, (q) => q(`select other_name, last_message, unread_count from list_conversations()`));
  assert.deepEqual(c, { other_name: 'Rahul', last_message: 'Hi Manoj, report status?', unread_count: '1' });
  await as(manoj, (q) => q(`select public.mark_conversation_read($1)`, [conv]));
  const [m] = await as(rahul, (q) => q(`select read_at from messages where conversation_id = $1`, [conv]));
  assert.ok(m.read_at, 'sender sees read receipt');
});
await test('Anil cannot read the Rahul↔Manoj chat', async () => {
  await as(anil, async (q) => {
    assert.equal((await q(`select * from messages where conversation_id = $1`, [conv])).length, 0);
    assert.equal((await q(`select * from conversations where id = $1`, [conv])).length, 0);
    assert.equal((await q(`select * from conversation_participants where conversation_id = $1`, [conv])).length, 0);
    assert.equal((await q(`select * from list_conversations()`)).length, 0);
  });
});
await test('Anil cannot post into or mark read the Rahul↔Manoj chat', async () => {
  await expectError(as(anil, (q) => q(`insert into messages (conversation_id, sender_id, body) values ($1, $2, 'spy')`, [conv, anil])), /row-level security/);
  await expectError(as(anil, (q) => q(`insert into messages (conversation_id, sender_id, body) values ($1, $2, 'forged')`, [conv, rahul])), /row-level security/);
  await expectError(as(anil, (q) => q(`select public.mark_conversation_read($1)`, [conv])), /not found/);
});
await test('admins get no special access to private chats', async () => {
  const rows = await as(shilin, (q) => q(`select * from messages where conversation_id = $1`, [conv]));
  assert.equal(rows.length, 0);
});
await test('messages cannot be edited or deleted by clients', async () => {
  await expectError(as(rahul, (q) => q(`update messages set body = 'edited' where conversation_id = $1`, [conv])), /permission denied/);
  await expectError(as(rahul, (q) => q(`delete from messages where conversation_id = $1`, [conv])), /permission denied/);
});

// ---------------------------------------------------------------------------
console.log('\nDashboard');
await test('my_task_stats counts per user', async () => {
  const [{ my_task_stats: s }] = await as(rahul, (q) => q(`select public.my_task_stats()`));
  assert.deepEqual(s.mine, { total: 3, pending: 0, in_progress: 0, completed: 2, overdue: 1 });
});

await db.end();
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
