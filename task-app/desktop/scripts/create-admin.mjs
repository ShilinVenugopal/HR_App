// One-time bootstrap: create the first Admin account (after that, Admins add
// users from inside the app). Run on an administrator's machine only — it
// needs the service-role key, which must never be bundled into the app.
//
//   npm run create-admin -- shilin@foraysgroup.in "Shilin Venugopal" "TempPassw0rd!"
//
// Reads VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env or the environment.
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const envFile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const url = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const [email, fullName, password] = process.argv.slice(2);

if (!url || !serviceKey) {
  console.error('Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in desktop/.env or the environment).');
  process.exit(1);
}
if (!email || !fullName || !password) {
  console.error('Usage: npm run create-admin -- <email> "<Full Name>" <temporary-password>');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const { data, error } = await admin.auth.admin.createUser({
  email: email.trim().toLowerCase(),
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName, must_change_password: true },
});
if (error) {
  console.error('Could not create user:', error.message);
  process.exit(1);
}

const { error: roleErr } = await admin.from('profiles').update({ role: 'admin' }).eq('id', data.user.id);
if (roleErr) {
  console.error('User created but could not be made Admin:', roleErr.message);
  process.exit(1);
}
console.log(`Admin created: ${email} (must change password at first sign-in)`);
