// Forays Task App — admin user management Edge Function.
//
// Creating auth users, resetting passwords and banning accounts need the
// Supabase service-role key, which must never ship inside the desktop app.
// This function holds that key server-side and only acts after verifying that
// the caller is an active Admin.
//
// Deploy:  supabase functions deploy admin-users
// Actions (POST JSON body):
//   { action: "create", email, full_name, password, role?, employee_code?, department?, designation?, mobile? }
//   { action: "set_status", user_id, status: "active" | "inactive" }
//   { action: "reset_password", user_id, password }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatePassword(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 10) return 'Password must be at least 10 characters';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Password must contain letters and numbers';
  return null;
}

const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // 1. Who is calling? Verify their JWT with the anon client.
  const authHeader = req.headers.get('Authorization') ?? '';
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await caller.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Not signed in' });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // 2. Are they an active Admin? (checked server-side, never trusted from the client)
  const { data: me } = await admin.from('profiles').select('role, status').eq('id', userData.user.id).single();
  if (!me || me.role !== 'admin' || me.status !== 'active') return json(403, { error: 'Admin access required' });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body' });
  }

  try {
    switch (body.action) {
      case 'create': {
        const email = String(body.email ?? '').trim().toLowerCase();
        const fullName = clean(body.full_name);
        if (!EMAIL_RE.test(email)) return json(400, { error: 'Enter a valid e-mail address' });
        if (!fullName) return json(400, { error: 'Employee name is required' });
        const pwErr = validatePassword(body.password);
        if (pwErr) return json(400, { error: pwErr });

        const domain = email.split('@')[1];
        const { data: allowed } = await admin.from('allowed_email_domains').select('domain').eq('domain', domain).maybeSingle();
        if (!allowed) return json(400, { error: `Only Forays Group e-mail addresses are allowed (@${domain} is not)` });

        const role = clean(body.role) ?? 'user';
        const { data: roleRow } = await admin.from('roles').select('code').eq('code', role).maybeSingle();
        if (!roleRow) return json(400, { error: `Unknown role "${role}"` });

        // The on_auth_user_created trigger turns this metadata into the profile row.
        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: body.password as string,
          email_confirm: true,
          user_metadata: {
            full_name: fullName,
            employee_code: clean(body.employee_code),
            department: clean(body.department),
            designation: clean(body.designation),
            mobile: clean(body.mobile),
            must_change_password: true,
          },
        });
        if (error) {
          const msg = /already|registered|exists/i.test(error.message) ? 'A user with this e-mail already exists' : error.message;
          return json(400, { error: msg });
        }
        // The trigger always creates role 'user'; promote here if requested.
        if (role !== 'user' && data.user) {
          const { error: roleErr } = await admin.from('profiles').update({ role }).eq('id', data.user.id);
          if (roleErr) return json(400, { error: `User created but role not set: ${roleErr.message}` });
        }
        return json(200, { user_id: data.user?.id });
      }

      case 'set_status': {
        const userId = clean(body.user_id);
        const status = body.status;
        if (!userId || (status !== 'active' && status !== 'inactive')) return json(400, { error: 'user_id and a valid status are required' });
        if (userId === userData.user.id && status === 'inactive') return json(400, { error: 'You cannot deactivate your own account' });

        // Profile first: the DB guard refuses to deactivate the last admin.
        const { error: pErr } = await admin.from('profiles').update({ status }).eq('id', userId);
        if (pErr) return json(400, { error: pErr.message });
        // Ban/unban so existing sessions cannot be refreshed. (RLS already
        // blocks an inactive user's data access immediately.)
        const { error } = await admin.auth.admin.updateUserById(userId, {
          ban_duration: status === 'inactive' ? '876000h' : 'none',
        });
        if (error) return json(400, { error: error.message });
        return json(200, { ok: true });
      }

      case 'reset_password': {
        const userId = clean(body.user_id);
        if (!userId) return json(400, { error: 'user_id is required' });
        const pwErr = validatePassword(body.password);
        if (pwErr) return json(400, { error: pwErr });
        const { error } = await admin.auth.admin.updateUserById(userId, { password: body.password as string });
        if (error) return json(400, { error: error.message });
        await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
        return json(200, { ok: true });
      }

      default:
        return json(400, { error: 'Unknown action' });
    }
  } catch (err) {
    console.error('admin-users failed', err);
    return json(500, { error: 'Unexpected server error' });
  }
});
