import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PartyPopper } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { describeError } from '../lib/errors'

/**
 * Landing spot for the invitation email link. The link signs the
 * person in; here they can set a password for future visits (optional,
 * they can also sign in with Google or skip straight to the feed).
 */
export default function Welcome() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      if (!data.session) {
        navigate('/login', { replace: true })
        return
      }
      setChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [navigate])

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError(describeError(updateError, 'We could not save that password.'))
      return
    }
    navigate('/feed')
  }

  if (checking) {
    return <p className="py-16 text-center text-sm text-stone-500">Loading...</p>
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
            <PartyPopper className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900">
            Welcome to the co-op
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            Your account is ready. Set a password so you can sign in next time, or skip this if
            you plan to use Google.
          </p>

          <form onSubmit={savePassword} className="mt-6 space-y-4">
            <div>
              <label htmlFor="welcome-password" className="block text-sm font-medium text-stone-700">
                Password
              </label>
              <input
                id="welcome-password"
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
              {saving ? 'Saving...' : 'Save password and continue'}
            </button>
          </form>

          <button
            type="button"
            onClick={() => navigate('/feed')}
            className="mt-3 w-full rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50"
          >
            Skip for now
          </button>
        </div>
      </main>
    </div>
  )
}
