import { useCallback, useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useLive } from '../lib/useLive'
import Avatar from './Avatar'

const navLinks = [
  { to: '/feed', label: 'Feed' },
  { to: '/categories', label: 'Categories' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/trades', label: 'Trades' },
  { to: '/events', label: 'Events' },
  { to: '/news', label: 'News' },
]

export default function Layout() {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  const profileId = profile?.id ?? null

  const fetchUnread = useCallback(async () => {
    if (!profileId) return
    const { count } = await supabase
      .from('message_threads')
      .select('id', { count: 'exact', head: true })
      .or(`and(a_id.eq.${profileId},a_unread.eq.true),and(b_id.eq.${profileId},b_unread.eq.true)`)
    setUnread(count ?? 0)
  }, [profileId])

  useEffect(() => {
    void fetchUnread()
  }, [fetchUnread, location.pathname])

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  // The badge updates the moment a message lands, so no polling loop.
  useLive('layout-unread', profileId ? [{ table: 'message_threads' }] : [], fetchUnread)

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap rounded-full px-3.5 py-2 text-sm transition-colors ${
      isActive
        ? 'bg-emerald-50 font-semibold text-emerald-700'
        : 'font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900'
    }`

  const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
    `block rounded-xl px-3.5 py-2.5 text-sm transition-colors ${
      isActive
        ? 'bg-emerald-50 font-semibold text-emerald-700'
        : 'font-medium text-stone-700 hover:bg-stone-100'
    }`

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <NavLink
            to="/feed"
            className="shrink-0 text-lg font-bold tracking-tight text-emerald-700 transition-opacity hover:opacity-80"
          >
            Fresno<span className="text-amber-600">Skillshare</span>
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

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setNavOpen((open) => !open)}
              className="relative rounded-full p-2 text-stone-600 transition-colors hover:bg-stone-100 md:hidden"
              aria-label={navOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={navOpen}
            >
              {navOpen ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
              {!navOpen && unread > 0 && (
                <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" aria-hidden />
              )}
            </button>

            {profile && (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className="flex shrink-0 items-center rounded-full p-0.5 ring-emerald-200 transition-shadow hover:ring-2"
                aria-label="Account menu"
              >
                <Avatar name={profile.display_name} url={profile.avatar_url} size="sm" />
              </button>
              {menuOpen && (
                <div
                  className="absolute right-0 mt-2 w-48 overflow-hidden rounded-2xl border border-stone-200 bg-white py-1 shadow-lg shadow-stone-900/5"
                  onMouseLeave={() => setMenuOpen(false)}
                >
                  <button
                    className="block w-full px-4 py-2.5 text-left text-sm text-stone-700 transition-colors hover:bg-stone-50"
                    onClick={() => {
                      setMenuOpen(false)
                      navigate(`/u/${profile.id}`)
                    }}
                  >
                    My profile
                  </button>
                  {isAdmin && (
                    <button
                      className="block w-full px-4 py-2.5 text-left text-sm text-stone-700 transition-colors hover:bg-stone-50"
                      onClick={() => {
                        setMenuOpen(false)
                        navigate('/admin')
                      }}
                    >
                      Admin dashboard
                    </button>
                  )}
                  <button
                    className="mt-1 block w-full border-t border-stone-100 px-4 py-2.5 text-left text-sm text-red-600 transition-colors hover:bg-red-50"
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
        </div>

        {/* mobile nav: hamburger dropdown */}
        {navOpen && (
          <nav className="space-y-1 border-t border-stone-100 px-3 py-3 md:hidden">
            {navLinks.map((link) => (
              <NavLink key={link.to} to={link.to} className={mobileLinkClass}>
                {link.label}
              </NavLink>
            ))}
            <NavLink to="/messages" className={mobileLinkClass}>
              Messages{unread > 0 ? ` (${unread})` : ''}
            </NavLink>
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Outlet />
      </main>

      <footer className="border-t border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-5 text-xs text-stone-400 sm:px-6">
          <span>Fresno Skillshare · Neighbors helping neighbors</span>
          <span className="flex gap-4">
            <Link to="/privacy" className="transition-colors hover:text-stone-600">
              Privacy Policy
            </Link>
            <Link to="/terms" className="transition-colors hover:text-stone-600">
              Terms
            </Link>
          </span>
        </div>
      </footer>
    </div>
  )
}
