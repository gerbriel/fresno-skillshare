import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center text-stone-400">
      Loading...
    </div>
  )
}

/** Gate for signed-in, active members. Client-side UX only; RLS is the real boundary. */
export function RequireMember() {
  const { session, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!profile || profile.status !== 'active') return <Navigate to="/pending" replace />
  return <Outlet />
}

/** Gate for active admins. */
export function RequireAdmin() {
  const { session, profile, loading, isAdmin } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/login" replace />
  if (!profile || profile.status !== 'active') return <Navigate to="/pending" replace />
  if (!isAdmin) return <Navigate to="/feed" replace />
  return <Outlet />
}
