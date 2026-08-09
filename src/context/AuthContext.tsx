import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { useLive } from '../lib/useLive'
import type { Profile } from '../lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  isAdmin: boolean
  isActive: boolean
  refreshProfile: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    setProfile((data as Profile | null) ?? null)
  }, [])

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      setSession(data.session)
      if (data.session) await fetchProfile(data.session.user.id)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (cancelled) return
      setSession(newSession)

      if (!newSession) {
        setProfile(null)
        setLoading(false)
        return
      }

      // A background token renewal is the same user with a fresh token;
      // refetching the profile on every renewal is pure churn.
      if (event === 'TOKEN_REFRESHED') return

      // This callback runs while the auth client holds its lock, and
      // Supabase calls made inside it can deadlock. Defer to a fresh tick.
      setTimeout(() => {
        if (cancelled) return
        void fetchProfile(newSession.user.id).finally(() => {
          if (!cancelled) setLoading(false)
        })
      }, 0)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [fetchProfile])

  const refreshProfile = useCallback(async () => {
    if (session) await fetchProfile(session.user.id)
  }, [session, fetchProfile])

  // An admin approving, suspending, or promoting this member takes effect
  // immediately, without them needing to reload.
  const userId = session?.user.id ?? null
  const onProfileChanged = useCallback(() => {
    if (userId) void fetchProfile(userId)
  }, [userId, fetchProfile])

  useLive(
    `own-profile:${userId ?? 'none'}`,
    userId ? [{ table: 'profiles', filter: `id=eq.${userId}` }] : [],
    onProfileChanged
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value: AuthState = {
    session,
    profile,
    loading,
    isAdmin: profile?.role === 'admin' && profile?.status === 'active',
    isActive: profile?.status === 'active',
    refreshProfile,
    signOut,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
