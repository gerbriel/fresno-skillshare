import { useState } from 'react'
import type { ReactNode } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function PendingApproval() {
  const { session, profile, loading, refreshProfile, signOut } = useAuth()
  const navigate = useNavigate()

  const [checking, setChecking] = useState(false)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [checkError, setCheckError] = useState<string | null>(null)
  const [signingOut, setSigningOut] = useState(false)

  const handleCheckAgain = async () => {
    setChecking(true)
    setCheckError(null)
    try {
      await refreshProfile()
      setCheckedAt(new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }))
    } catch {
      setCheckError('We could not reach the server. Please try again in a moment.')
    } finally {
      setChecking(false)
    }
  }

  const handleSignOut = async () => {
    setSigningOut(true)
    await signOut()
    navigate('/')
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-50 px-5 text-stone-400">
        Loading your membership status...
      </div>
    )
  }

  if (!session) {
    return (
      <Shell>
        <div className="text-4xl">👋</div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900">You are signed out</h1>
        <p className="mt-3 leading-relaxed text-stone-600">
          Sign in to check on your membership, or head back to the home page to request an invite.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/login"
            className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700"
          >
            Go to sign in
          </Link>
          <Link
            to="/"
            className="rounded-full border border-stone-300 bg-white px-6 py-3 text-sm font-semibold text-stone-700 transition-colors hover:bg-stone-100"
          >
            Back to home
          </Link>
        </div>
      </Shell>
    )
  }

  if (profile?.status === 'active') {
    return <Navigate to="/feed" replace />
  }

  const suspended = profile?.status === 'suspended'

  return (
    <Shell>
      <div className="text-4xl">{suspended ? '🚫' : '🌱'}</div>

      {suspended ? (
        <>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900">
            Your account is suspended
          </h1>
          <p className="mt-3 leading-relaxed text-stone-600">
            An admin has paused access to this account, so the member area is closed for now. If you
            think this is a mistake, please contact an admin to sort it out.
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-stone-900">
            Your account is awaiting approval
          </h1>
          <p className="mt-3 leading-relaxed text-stone-600">
            Thanks for signing up{profile?.display_name ? `, ${profile.display_name}` : ''}. Barter
            Fresno is invite-only, so an admin reviews every new account. You will get access to the
            feed as soon as you are approved.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-stone-500">
            In a hurry? Ask the member who invited you to give an admin a nudge, or submit a join
            request on the{' '}
            <Link to="/" className="font-medium text-emerald-700 underline underline-offset-2">
              home page
            </Link>{' '}
            so we have your details on file.
          </p>
        </>
      )}

      {!suspended && (
        <div className="mt-8">
          <button
            type="button"
            onClick={handleCheckAgain}
            disabled={checking}
            className="rounded-full bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-300"
          >
            {checking ? 'Checking...' : 'Check again'}
          </button>

          {checkError && (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {checkError}
            </p>
          )}

          {!checkError && checkedAt && (
            <p className="mt-4 text-sm text-stone-500">
              Checked at {checkedAt}. You are still pending, so hang tight.
            </p>
          )}
        </div>
      )}

      <div className="mt-10 border-t border-stone-200 pt-6">
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="rounded-full border border-stone-300 bg-white px-6 py-2.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? 'Signing out...' : 'Sign out'}
        </button>
      </div>
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-stone-50 text-stone-800">
      <header className="mx-auto w-full max-w-5xl px-5 py-6">
        <Link to="/" className="text-lg font-bold tracking-tight text-emerald-700">
          Barter<span className="text-amber-600">Fresno</span>
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-4 sm:items-center sm:pt-0">
        <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm sm:p-12">
          {children}
        </div>
      </main>
    </div>
  )
}
