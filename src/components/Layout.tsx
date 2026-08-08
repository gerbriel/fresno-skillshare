import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Avatar from './Avatar'

const navLinks = [
  { to: '/feed', label: 'Feed' },
  { to: '/categories', label: 'Categories' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/trades', label: 'Trades' },
  { to: '/news', label: 'News' },
]

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('message_threads')
        .select('id', { count: 'exact', head: true })
        .or(
          `and(a_id.eq.${profile.id},a_unread.eq.true),and(b_id.eq.${profile.id},b_unread.eq.true)`
        )
      if (!cancelled) setUnread(count ?? 0)
    }
    fetchUnread()
    const interval = setInterval(fetchUnread, 30_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [profile, location.pathname])

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive ? 'bg-emerald-600 text-white' : 'text-stone-600 hover:bg-stone-100'
    }`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/feed" className="text-lg font-bold tracking-tight text-emerald-700">
            Barter<span className="text-amber-600">Fresno</span>
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            ))}
            <NavLink to="/messages" className={linkClass}>
              <span className="relative">
                Messages
                {unread > 0 && (
                  <span className="absolute -right-3 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </span>
            </NavLink>
          </nav>

          {profile && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-emerald-200"
                aria-label="Account menu"
              >
                <Avatar name={profile.display_name} url={profile.avatar_url} size="sm" />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <button
                    className="block w-full px-4 py-2 text-left text-sm hover:bg-stone-50"
                    onClick={() => {
                      setMenuOpen(false)
                      navigate(`/u/${profile.id}`)
                    }}
                  >
                    My profile
                  </button>
                  {isAdmin && (
                    <button
                      className="block w-full px-4 py-2 text-left text-sm hover:bg-stone-50"
                      onClick={() => {
                        setMenuOpen(false)
                        navigate('/admin')
                      }}
                    >
                      Admin dashboard
                    </button>
                  )}
                  <button
                    className="block w-full border-t border-stone-100 px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                    onClick={async () => {
                      setMenuOpen(false)
                      await signOut()
                      navigate('/')
                    }}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* mobile nav */}
        <nav className="flex gap-1 overflow-x-auto border-t border-stone-100 px-4 py-2 md:hidden">
          {[...navLinks, { to: '/messages', label: unread > 0 ? `Messages (${unread})` : 'Messages' }].map(
            (link) => (
              <NavLink key={link.to} to={link.to} className={linkClass}>
                {link.label}
              </NavLink>
            )
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  )
}
