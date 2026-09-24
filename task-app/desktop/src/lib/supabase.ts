import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when the build was made without VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. */
export const supabaseConfigured = Boolean(url && anonKey);

// Only the public anon key ever reaches the client. Every read/write is
// authorised by Row Level Security + RPC checks in the database.
export const supabase = createClient(url || 'http://localhost:54321', anonKey || 'not-configured', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
    storageKey: 'forays-task-app-auth',
  },
  realtime: { params: { eventsPerSecond: 10 } },
});
