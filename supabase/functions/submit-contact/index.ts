// Fresno Skillshare - submit-contact Edge Function
//
// Receives a public contact-form submission, optionally verifies a
// Cloudflare Turnstile captcha token, then inserts into
// contact_messages with the service role. The anon insert policy was
// removed, so this function is the only public write path - it stops
// spoofable anon spam while keeping the form open to signed-out
// visitors.
//
// Deploy: supabase functions deploy submit-contact --project-ref <ref>
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

// Trim, then drop C0/C1 control characters except tab and newline, then
// cap length. Mirrors the client's cleanText and the DB constraints.
function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  let out = ''
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    if (code < 0x20 && code !== 0x09 && code !== 0x0a) continue
    if (code >= 0x7f && code <= 0x9f) continue
    out += ch
  }
  return out.trim().slice(0, max)
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { name?: unknown; email?: unknown; message?: unknown; token?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // Server-side validation mirroring the contact_messages CHECK
  // constraints (00015_contact_messages.sql).
  const name = cleanText(body.name, 120)
  const email = cleanText(body.email, 320).toLowerCase()
  const message = cleanText(body.message, 2000)

  if (!name) return json({ error: 'Please include your name.' }, 400)
  if (!email || !EMAIL_RE.test(email)) {
    return json({ error: 'Please include a valid email address.' }, 400)
  }
  if (!message) return json({ error: 'Please include a message.' }, 400)

  // Captcha (optional): only enforced once a secret is configured, so
  // the form keeps working before Turnstile is set up.
  const secret = Deno.env.get('TURNSTILE_SECRET_KEY')
  if (secret) {
    const token = typeof body.token === 'string' ? body.token : ''
    if (!token) return json({ error: 'Captcha failed' }, 403)

    const form = new URLSearchParams()
    form.set('secret', secret)
    form.set('response', token)
    const remoteip = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-forwarded-for')
    if (remoteip) form.set('remoteip', remoteip.split(',')[0].trim())

    try {
      const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
      })
      const outcome = (await verify.json()) as { success?: boolean }
      if (!outcome.success) return json({ error: 'Captcha failed' }, 403)
    } catch {
      return json({ error: 'Captcha failed' }, 403)
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { error: insertError } = await admin
    .from('contact_messages')
    .insert({ name, email, message })

  if (insertError) {
    // Never leak the internal message; log it for the operator instead.
    console.error('submit-contact insert failed:', insertError.message)
    return json({ error: 'Could not send your message. Please try again in a moment.' }, 500)
  }

  return json({ status: 'sent' })
})
