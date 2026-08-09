import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

if (!url || !anonKey) {
  throw new Error(
    'Missing Supabase config. Copy .env.example to .env.local and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.'
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // PKCE keeps the OAuth code exchange verifiable by this browser only.
    flowType: 'pkce',
    // Stay signed in across reloads and restarts: the session is kept in
    // localStorage and the access token is renewed in the background
    // before it expires, so members are not logged out mid-session.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
