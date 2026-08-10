import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { describeError } from '../lib/errors'

/**
 * Landing spot for the password-recovery email link. The link signs the
 * member in with a temporary recovery session; here they set a new
 * password. Works for both self-service resets and admin-sent links.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [ready, setReady] = useState(false)
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // The recovery link is exchanged for a session on load; catch it
    // whether it arrives before or after this mounts.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setReady(true)
        setChecking(false)
      }
    })
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true)
      setChecking(false)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError(describeError(updateError, 'We could not update your password.'))
      return
    }
    navigate('/feed')
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-800">
      <header className="mx-auto w-full max-w-5xl px-5 py-6">
        <Link to="/" className="text-lg font-bold tracking-tight text-emerald-700">
          Fresno<span className="text-amber-600">Skillshare</span>
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <KeyRound className="h-7 w-7" aria-hidden />
          </div>

          {checking ? (
            <p className="mt-6 text-sm text-stone-500">Checking your reset link...</p>
          ) : !ready ? (
            <>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900">
                This link is not valid
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">
                Password reset links expire after a short while and can only be used once. Request a
                fresh one from the sign-in page.
              </p>
              <Link
                to="/login"
                className="mt-6 inline-flex rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
              >
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900">
                Choose a new password
              </h1>
              <p className="mt-1.5 text-sm text-stone-500">
                Pick something you will remember. You will be signed in right after.
              </p>

              <form onSubmit={savePassword} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="reset-password" className="block text-sm font-medium text-stone-700">
                    New password
                  </label>
                  <input
                    id="reset-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-stone-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                  />
                </div>

                {error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  {saving ? 'Saving...' : 'Save new password'}
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
