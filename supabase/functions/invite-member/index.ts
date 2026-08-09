// Fresno Skillshare - invite-member Edge Function
//
// Sends Supabase's "You have been invited" email after an admin
// approves a join request (and on "Resend email"). Runs with the
// service role, so the caller's JWT is verified and must belong to
// an active admin before anything happens.
//
// Deploy: supabase functions deploy invite-member --project-ref <ref>
// (or paste into the dashboard's Edge Functions editor).

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  // Identify the caller and require an active admin.
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401)

  const { data: profile } = await admin
    .from('profiles')
    .select('role, status')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profile?.role !== 'admin' || profile?.status !== 'active') {
    return json({ error: 'Only admins can send invites' }, 403)
  }

  let body: { email?: string; redirectTo?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (email.length > 320 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return json({ error: 'Invalid email' }, 400)
  }
  // Passed through to the email link; Supabase enforces the Auth
  // redirect allow-list, so this cannot be abused for open redirects.
  const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined

  const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo })

  if (inviteError) {
    const message = inviteError.message.toLowerCase()
    if (message.includes('already') && (message.includes('registered') || message.includes('exists'))) {
      // They signed up on their own; the approval RPC already activated them.
      return json({ status: 'already_registered' })
    }
    return json({ error: inviteError.message }, 500)
  }

  return json({ status: 'sent' })
})
