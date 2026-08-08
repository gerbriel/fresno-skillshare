import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Avatar from '../../components/Avatar'
import { formatDate } from '../../lib/format'
import type { MemberStatus, Profile, Role } from '../../lib/types'
import {
  EmptyBlock,
  ErrorBlock,
  Feedback,
  FilterPills,
  LoadingBlock,
  Pill,
  SectionHeader,
} from './shared'
import type { FilterOption } from './shared'
import { buttonClass, describeError } from './helpers'
import type { Tone } from './helpers'

type StatusFilter = 'all' | MemberStatus

const STATUS_TONE: Record<MemberStatus, Tone> = {
  pending: 'amber',
  active: 'emerald',
  suspended: 'red',
}

const STATUS_LABEL: Record<MemberStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  suspended: 'Suspended',
}

const SELF_HINT = 'You cannot change your own access.'

export default function MembersTab() {
  const { profile: me } = useAuth()
  const [members, setMembers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (queryError) {
      setError('We could not load the member list. Please try again.')
      setLoading(false)
      return
    }

    setMembers((data ?? []) as Profile[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    return members.reduce(
      (acc, member) => {
        acc[member.status] += 1
        return acc
      },
      { pending: 0, active: 0, suspended: 0 } as Record<MemberStatus, number>
    )
  }, [members])

  const filterOptions: FilterOption<StatusFilter>[] = [
    { id: 'all', label: 'All', count: members.length },
    { id: 'pending', label: 'Pending', count: counts.pending },
    { id: 'active', label: 'Active', count: counts.active },
    { id: 'suspended', label: 'Suspended', count: counts.suspended },
  ]

  const visible = useMemo(
    () => (filter === 'all' ? members : members.filter((member) => member.status === filter)),
    [members, filter]
  )

  const patchMember = async (id: string, patch: Partial<Pick<Profile, 'status' | 'role'>>) => {
    setBusyId(id)
    setActionError(null)
    const { error: updateError } = await supabase.from('profiles').update(patch).eq('id', id)
    if (updateError) {
      setActionError(describeError(updateError, 'That change did not save.'))
      setBusyId(null)
      return
    }
    setMembers((current) =>
      current.map((member) => (member.id === id ? { ...member, ...patch } : member))
    )
    setBusyId(null)
  }

  const changeStatus = (member: Profile, status: MemberStatus) => {
    if (status === 'suspended') {
      const ok = window.confirm(
        `Suspend ${member.display_name}? They will lose access to the co-op until you reactivate them.`
      )
      if (!ok) return
    }
    void patchMember(member.id, { status })
  }

  const changeRole = (member: Profile) => {
    const nextRole: Role = member.role === 'admin' ? 'member' : 'admin'
    const ok = window.confirm(
      nextRole === 'admin'
        ? `Make ${member.display_name} an admin? They will be able to manage members, invites, and site content.`
        : `Remove admin access from ${member.display_name}?`
    )
    if (!ok) return
    void patchMember(member.id, { role: nextRole })
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Members"
        description="Approve new signups, suspend accounts, and hand out admin access."
        action={
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className={buttonClass('secondary', 'sm')}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        }
      />

      <FilterPills options={filterOptions} value={filter} onChange={setFilter} />

      {actionError && <Feedback tone="error" message={actionError} />}
      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      {loading ? (
        <LoadingBlock rows={4} />
      ) : visible.length === 0 ? (
        <EmptyBlock>
          {filter === 'all'
            ? 'No members yet. Send an invite to get the co-op started.'
            : `No ${filter} members right now.`}
        </EmptyBlock>
      ) : (
        <ul className="space-y-3">
          {visible.map((member) => {
            const isSelf = me?.id === member.id
            const busy = busyId === member.id
            return (
              <li
                key={member.id}
                className="flex flex-col gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={member.display_name} url={member.avatar_url} size="md" />
                  <div className="min-w-0">
                    <Link
                      to={`/u/${member.id}`}
                      className="block truncate font-semibold text-stone-900 hover:text-emerald-700 hover:underline underline-offset-2"
                    >
                      {member.display_name}
                    </Link>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <Pill tone={STATUS_TONE[member.status]}>{STATUS_LABEL[member.status]}</Pill>
                      <Pill tone={member.role === 'admin' ? 'emerald' : 'stone'}>
                        {member.role === 'admin' ? 'Admin' : 'Member'}
                      </Pill>
                      <span className="text-xs text-stone-400">
                        Joined {formatDate(member.created_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {isSelf ? (
                    <span
                      title={SELF_HINT}
                      className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-500"
                    >
                      {SELF_HINT}
                    </span>
                  ) : (
                    <>
                      {member.status === 'pending' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => changeStatus(member, 'active')}
                          className={buttonClass('primary', 'sm')}
                        >
                          {busy ? 'Working...' : 'Approve'}
                        </button>
                      )}
                      {member.status === 'active' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => changeStatus(member, 'suspended')}
                          className={buttonClass('danger', 'sm')}
                        >
                          {busy ? 'Working...' : 'Suspend'}
                        </button>
                      )}
                      {member.status === 'suspended' && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => changeStatus(member, 'active')}
                          className={buttonClass('primary', 'sm')}
                        >
                          {busy ? 'Working...' : 'Reactivate'}
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => changeRole(member)}
                        className={buttonClass('secondary', 'sm')}
                      >
                        {member.role === 'admin' ? 'Remove admin' : 'Make admin'}
                      </button>
                    </>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
