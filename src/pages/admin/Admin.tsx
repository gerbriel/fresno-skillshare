import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ADMIN_TABS, isAdminTabId } from './tabs'
import type { AdminTabId } from './tabs'
import OverviewTab from './OverviewTab'
import MembersTab from './MembersTab'
import InvitesTab from './InvitesTab'
import CategoriesTab from './CategoriesTab'
import ListingsTab from './ListingsTab'
import EventsTab from './EventsTab'
import NewsletterTab from './NewsletterTab'
import SiteTab from './SiteTab'

export default function Admin() {
  const { profile } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()

  const raw = searchParams.get('tab')
  const activeTab: AdminTabId = isAdminTabId(raw) ? raw : 'overview'

  const goToTab = useCallback(
    (tab: AdminTabId) => {
      const next = new URLSearchParams(searchParams)
      next.set('tab', tab)
      setSearchParams(next, { replace: true })
    },
    [searchParams, setSearchParams]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-stone-900">Admin dashboard</h1>
        <p className="mt-1.5 text-sm text-stone-500">
          Signed in as {profile?.display_name ?? 'an admin'}. Everything here affects the whole co-op,
          so take a second look before you confirm.
        </p>
      </div>

      <div className="-mx-4 overflow-x-auto px-4">
        <nav
          className="flex min-w-max gap-1 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm"
          aria-label="Admin sections"
        >
          {ADMIN_TABS.map((tab) => {
            const active = tab.id === activeTab
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => goToTab(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`}
              >
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      <section>
        {activeTab === 'overview' && <OverviewTab onJump={goToTab} />}
        {activeTab === 'members' && <MembersTab />}
        {activeTab === 'invites' && <InvitesTab />}
        {activeTab === 'categories' && <CategoriesTab />}
        {activeTab === 'listings' && <ListingsTab />}
        {activeTab === 'events' && <EventsTab />}
        {activeTab === 'newsletter' && <NewsletterTab />}
        {activeTab === 'site' && <SiteTab />}
      </section>
    </div>
  )
}
