export const ADMIN_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'members', label: 'Members' },
  { id: 'invites', label: 'Invites' },
  { id: 'categories', label: 'Categories' },
  { id: 'listings', label: 'Listings' },
  { id: 'events', label: 'Events' },
  { id: 'newsletter', label: 'Newsletter' },
  { id: 'site', label: 'Site' },
] as const

export type AdminTabId = (typeof ADMIN_TABS)[number]['id']

const IDS: readonly string[] = ADMIN_TABS.map((tab) => tab.id)

export function isAdminTabId(value: string | null): value is AdminTabId {
  return value !== null && IDS.includes(value)
}
