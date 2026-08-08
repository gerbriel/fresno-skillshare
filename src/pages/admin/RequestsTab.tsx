import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { timeAgo } from '../../lib/format'
import type { JoinRequest } from '../../lib/types'
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

type RequestStatus = JoinRequest['status']
type RequestFilter = 'all' | RequestStatus

const STATUS_TONE: Record<RequestStatus, Tone> = {
  pending: 'amber',
  approved: 'emerald',
  rejected: 'stone',
}

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
}

const APPROVED_NOTE =
  'Invite created. Tell them to sign up with this email and they will get access immediately.'

export default function RequestsTab() {
  const { profile: me } = useAuth()
  const [requests, setRequests] = useState<JoinRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<RequestFilter>('pending')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [approvedIds, setApprovedIds] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('join_requests')
      .select('*')
      .order('created_at', { ascending: false })

    if (queryError) {
      setError('We could not load the join requests. Please try again.')
      setLoading(false)
      return
    }

    setRequests((data ?? []) as JoinRequest[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(
    () =>
      requests.reduce(
        (acc, request) => {
          acc[request.status] += 1
          return acc
        },
        { pending: 0, approved: 0, rejected: 0 } as Record<RequestStatus, number>
      ),
    [requests]
  )

  const filterOptions: FilterOption<RequestFilter>[] = [
    { id: 'all', label: 'All', count: requests.length },
    { id: 'pending', label: 'Pending', count: counts.pending },
    { id: 'approved', label: 'Approved', count: counts.approved },
    { id: 'rejected', label: 'Rejected', count: counts.rejected },
  ]

  const visible = useMemo(
    () => (filter === 'all' ? requests : requests.filter((request) => request.status === filter)),
    [requests, filter]
  )

  const review = async (request: JoinRequest, status: 'approved' | 'rejected') => {
    if (!me) return
    setBusyId(request.id)
    setActionError(null)

    const reviewedAt = new Date().toISOString()
    if (status === 'approved') {
      // Invite + status flip happen in one transaction server-side.
      const { error: rpcError } = await supabase.rpc('approve_join_request', {
        p_request_id: request.id,
      })
      if (rpcError) {
        setActionError(describeError(rpcError, 'We could not approve that request.'))
        setBusyId(null)
        return
      }
    } else {
      const { error: updateError } = await supabase
        .from('join_requests')
        .update({ status, reviewed_by: me.id, reviewed_at: reviewedAt })
        .eq('id', request.id)

      if (updateError) {
        setActionError(describeError(updateError, 'We could not update that request.'))
        setBusyId(null)
        return
      }
    }

    setRequests((current) =>
      current.map((item) =>
        item.id === request.id
          ? { ...item, status, reviewed_by: me.id, reviewed_at: reviewedAt }
          : item
      )
    )
    if (status === 'approved') {
      setApprovedIds((current) => (current.includes(request.id) ? current : [...current, request.id]))
    }
    setBusyId(null)
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Join requests"
        description="People who asked to join from the landing page. Approving one creates an invite for their email."
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
        <LoadingBlock rows={3} />
      ) : visible.length === 0 ? (
        <EmptyBlock>
          {filter === 'all'
            ? 'No one has requested to join yet.'
            : `No ${filter} requests right now.`}
        </EmptyBlock>
      ) : (
        <ul className="space-y-3">
          {visible.map((request) => {
            const busy = busyId === request.id
            return (
              <li
                key={request.id}
                className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-stone-900">{request.name}</p>
                      <Pill tone={STATUS_TONE[request.status]}>{STATUS_LABEL[request.status]}</Pill>
                    </div>
                    <a
                      href={`mailto:${request.email}`}
                      className="mt-1 block break-all text-sm text-emerald-700 hover:underline underline-offset-2"
                    >
                      {request.email}
                    </a>
                  </div>
                  <span className="whitespace-nowrap text-xs text-stone-400">
                    {timeAgo(request.created_at)}
                  </span>
                </div>

                {request.message && (
                  <p className="mt-3 whitespace-pre-wrap rounded-xl bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-600">
                    {request.message}
                  </p>
                )}

                {request.status === 'pending' && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void review(request, 'approved')}
                      className={buttonClass('primary', 'sm')}
                    >
                      {busy ? 'Working...' : 'Approve'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void review(request, 'rejected')}
                      className={buttonClass('danger', 'sm')}
                    >
                      {busy ? 'Working...' : 'Reject'}
                    </button>
                  </div>
                )}

                {approvedIds.includes(request.id) && (
                  <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-800">
                    {APPROVED_NOTE}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
