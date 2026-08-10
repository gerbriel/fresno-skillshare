// Fresno Skillshare - send-reset Edge Function
//
// Lets an admin send a password-reset link to a member. The member's
// email lives in auth.users (not readable by the client), so this runs
// with the service role, verifies the caller is an active admin, looks
// up the email by user id, and triggers the recovery email.
//
// Deploy: supabase functions deploy send-reset --project-ref <ref>

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

  // Require an active admin caller.
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401)

  const { data: profile } = await admin
    .from('profiles')
    .select('role, status')
    .eq('id', userData.user.id)
    .maybeSingle()
  if (profile?.role !== 'admin' || profile?.status !== 'active') {
    return json({ error: 'Only admins can send reset links' }, 403)
  }

  let body: { userId?: string; redirectTo?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const userId = (body.userId ?? '').trim()
  if (!userId) return json({ error: 'Missing userId' }, 400)
  const redirectTo = typeof body.redirectTo === 'string' ? body.redirectTo : undefined

  const { data: target, error: lookupError } = await admin.auth.admin.getUserById(userId)
  if (lookupError || !target.user?.email) {
    return json({ error: 'That member has no email on file' }, 404)
  }

  const { error: resetError } = await admin.auth.resetPasswordForEmail(target.user.email, {
    redirectTo,
  })
  if (resetError) return json({ error: resetError.message }, 500)

  return json({ status: 'sent' })
})
