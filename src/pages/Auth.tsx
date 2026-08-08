import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { cleanText, LIMITS } from '../lib/validate'

type Tab = 'signin' | 'signup'

const inputClass =
  'mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-stone-800 outline-none transition-colors focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200'

export default function Auth() {
  const navigate = useNavigate()

  const [tab, setTab] = useState<Tab>('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const switchTab = (next: Tab) => {
    setTab(next)
    setError(null)
    setNotice(null)
    setPassword('')
  }

  const handleSignIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setBusy(false)
      return
    }

    setBusy(false)
    navigate('/feed')
  }

  // Google sign-in goes through the same invite gate as email signup:
  // the profile trigger activates invited emails instantly and parks
  // everyone else in the pending review queue.
  const handleGoogle = async () => {
    setBusy(true)
    setError(null)
    setNotice(null)

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/feed` },
    })

    // On success the browser navigates away to Google; we only land
    // here if starting the flow failed.
    if (oauthError) {
      setError(oauthError.message)
      setBusy(false)
    }
  }

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = cleanText(displayName, LIMITS.displayName)
    if (!name) {
      setError('Please add a display name so other members know who you are.')
      return
    }

    setBusy(true)
    setError(null)
    setNotice(null)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name } },
    })

    if (signUpError) {
      setError(signUpError.message)
      setBusy(false)
      return
    }

    setBusy(false)

    if (!data.session) {
      setNotice('Check your email to confirm your account, then come back here to sign in.')
      setPassword('')
      return
    }

    navigate('/feed')
  }

  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-800">
      <header className="mx-auto w-full max-w-5xl px-5 py-6">
        <Link
          to="/"
          className="text-lg font-bold tracking-tight text-emerald-700 transition-opacity hover:opacity-80"
        >
          Fresno<span className="text-amber-600">Skillshare</span>
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-stone-200 bg-white p-7 shadow-sm sm:p-9">
            <div className="grid grid-cols-2 gap-1 rounded-full bg-stone-100 p-1">
              <button
                type="button"
                onClick={() => switchTab('signin')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === 'signin' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => switchTab('signup')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  tab === 'signup' ? 'bg-white text-emerald-700 shadow-sm' : 'text-stone-500 hover:text-stone-700'
                }`}
              >
                Create account
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleGoogle()}
              disabled={busy}
              className="mt-7 flex w-full items-center justify-center gap-2.5 rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M12 5.04c1.62 0 3.06.56 4.2 1.66l3.12-3.12C17.46 1.8 14.94.75 12 .75 7.62.75 3.84 3.26 1.98 6.94l3.66 2.84C6.54 7.06 9.03 5.04 12 5.04Z"
                />
                <path
                  fill="#4285F4"
                  d="M23.25 12.27c0-.92-.08-1.6-.26-2.31H12v4.51h6.44c-.13 1.08-.83 2.7-2.39 3.79l3.57 2.77c2.14-1.97 3.63-4.87 3.63-8.76Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.66 14.22a7.03 7.03 0 0 1-.38-2.22c0-.77.14-1.52.36-2.22L1.98 6.94A11.24 11.24 0 0 0 .75 12c0 1.81.44 3.53 1.23 5.06l3.68-2.84Z"
                />
                <path
                  fill="#34A853"
                  d="M12 23.25c3.04 0 5.59-1 7.45-2.72l-3.57-2.77c-.95.66-2.23 1.13-3.88 1.13-2.97 0-5.46-2.02-6.36-4.72l-3.66 2.83c1.85 3.69 5.64 6.25 10.02 6.25Z"
                />
              </svg>
              Continue with Google
            </button>
            <p className="mt-2.5 text-center text-xs text-stone-400">
              First time here? Invited emails get in right away; everyone else waits for admin
              approval.
            </p>

            <div className="mt-5 flex items-center gap-3 text-xs text-stone-400">
              <span className="h-px flex-1 bg-stone-200" aria-hidden />
              or use email
              <span className="h-px flex-1 bg-stone-200" aria-hidden />
            </div>

            {tab === 'signin' ? (
              <form onSubmit={handleSignIn} className="mt-5 space-y-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-stone-900">Welcome back</h1>
                  <p className="mt-1.5 text-sm text-stone-500">
                    Sign in to see the feed and your trades.
                  </p>
                </div>

                <div>
                  <label htmlFor="signin-email" className="block text-sm font-medium text-stone-700">
                    Email
                  </label>
                  <input
                    id="signin-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="signin-password" className="block text-sm font-medium text-stone-700">
                    Password
                  </label>
                  <input
                    id="signin-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Your password"
                    className={inputClass}
                  />
                </div>

                {error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  {busy ? 'Signing in...' : 'Sign in'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="mt-5 space-y-4">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-stone-900">Create your account</h1>
                  <p className="mt-1.5 text-sm text-stone-500">
                    Join your neighbors and start trading.
                  </p>
                </div>

                <div>
                  <label htmlFor="signup-name" className="block text-sm font-medium text-stone-700">
                    Display name
                  </label>
                  <input
                    id="signup-name"
                    type="text"
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    required
                    maxLength={LIMITS.displayName}
                    autoComplete="name"
                    placeholder="How members will see you"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="signup-email" className="block text-sm font-medium text-stone-700">
                    Email
                  </label>
                  <input
                    id="signup-email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={inputClass}
                  />
                </div>

                <div>
                  <label htmlFor="signup-password" className="block text-sm font-medium text-stone-700">
                    Password
                  </label>
                  <input
                    id="signup-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    className={inputClass}
                  />
                </div>

                {error && (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </p>
                )}

                {notice && (
                  <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {notice}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
                >
                  {busy ? 'Creating account...' : 'Create account'}
                </button>

                <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-3 text-xs leading-relaxed text-stone-500">
                  <p>
                    If an admin already invited your email, you get access right away. Otherwise your
                    account waits in a pending state until an admin approves it.
                  </p>
                  <p className="mt-2">
                    You can also{' '}
                    <Link to="/" className="font-medium text-emerald-700 underline underline-offset-2">
                      request to join from the home page
                    </Link>
                    .
                  </p>
                </div>
              </form>
            )}

            <p className="mt-6 border-t border-stone-100 pt-4 text-center text-xs leading-relaxed text-stone-400">
              By signing in or creating an account, you agree to our{' '}
              <Link to="/terms" className="font-medium text-stone-500 underline underline-offset-2 hover:text-emerald-700">
                Terms
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="font-medium text-stone-500 underline underline-offset-2 hover:text-emerald-700">
                Privacy Policy
              </Link>
              .
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-stone-500">
            <Link to="/" className="transition-colors hover:text-stone-800">
              Back to the home page
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}
