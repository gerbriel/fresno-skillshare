import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

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

  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = displayName.trim()
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
        <Link to="/" className="text-lg font-bold tracking-tight text-emerald-700">
          Barter<span className="text-amber-600">Fresno</span>
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

            {tab === 'signin' ? (
              <form onSubmit={handleSignIn} className="mt-7 space-y-4">
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
              <form onSubmit={handleSignUp} className="mt-7 space-y-4">
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
