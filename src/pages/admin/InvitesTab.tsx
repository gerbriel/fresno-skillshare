import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { formatDate } from '../../lib/format'
import type { Invite } from '../../lib/types'
import { EmptyBlock, ErrorBlock, Feedback, LoadingBlock, Pill, SectionHeader } from './shared'
import {
  buttonClass,
  cardClass,
  describeError,
  inputClass,
  isUniqueViolation,
  labelClass,
} from './helpers'

export default function InvitesTab() {
  const { profile: me } = useAuth()
  const [invites, setInvites] = useState<Invite[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [formSuccess, setFormSuccess] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: queryError } = await supabase
      .from('invites')
      .select('*')
      .order('created_at', { ascending: false })

    if (queryError) {
      setError('We could not load the invites. Please try again.')
      setLoading(false)
      return
    }

    setInvites((data ?? []) as Invite[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedEmail = email.trim()
    const trimmedNote = note.trim()

    if (!trimmedEmail) {
      setFormError('Add an email address to send an invite.')
      setFormSuccess(null)
      return
    }

    setCreating(true)
    setFormError(null)
    setFormSuccess(null)

    const { data, error: insertError } = await supabase
      .from('invites')
      .insert({
        email: trimmedEmail,
        invited_by: me?.id ?? null,
        note: trimmedNote.length > 0 ? trimmedNote : null,
      })
      .select('*')
      .single()

    if (insertError) {
      setFormError(
        isUniqueViolation(insertError)
          ? 'That email already has an invite waiting. They can sign up with it any time.'
          : describeError(insertError, 'We could not create that invite.')
      )
      setCreating(false)
      return
    }

    setInvites((current) => [data as Invite, ...current])
    setEmail('')
    setNote('')
    setFormSuccess(
      `Invite created for ${trimmedEmail}. Tell them to sign up with this email and they will get access immediately.`
    )
    setCreating(false)
  }

  const handleDelete = async (invite: Invite) => {
    const ok = window.confirm(
      `Delete the invite for ${invite.email}? They will not be able to sign up until you invite them again.`
    )
    if (!ok) return

    setDeletingId(invite.id)
    setFormError(null)
    const { error: deleteError } = await supabase.from('invites').delete().eq('id', invite.id)

    if (deleteError) {
      setFormError(describeError(deleteError, 'We could not delete that invite.'))
      setDeletingId(null)
      return
    }

    setInvites((current) => current.filter((item) => item.id !== invite.id))
    setDeletingId(null)
  }

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Invites"
        description="Anyone with an unused invite becomes an active member the moment they sign up with that email."
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

      <form onSubmit={handleCreate} className={`${cardClass} space-y-4`}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="invite-email" className={labelClass}>
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="neighbor@example.com"
              autoComplete="off"
              className={`mt-1.5 ${inputClass}`}
            />
          </div>
          <div>
            <label htmlFor="invite-note" className={labelClass}>
              Note <span className="font-normal text-stone-400">(optional)</span>
            </label>
            <input
              id="invite-note"
              type="text"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Met at the farmers market"
              className={`mt-1.5 ${inputClass}`}
            />
          </div>
        </div>

        {formError && <Feedback tone="error" message={formError} />}
        {formSuccess && <Feedback tone="success" message={formSuccess} />}

        <button type="submit" disabled={creating} className={buttonClass('primary')}>
          {creating ? 'Creating...' : 'Create invite'}
        </button>
      </form>

      {error && <ErrorBlock message={error} onRetry={() => void load()} />}

      {loading ? (
        <LoadingBlock rows={3} />
      ) : invites.length === 0 ? (
        <EmptyBlock>No invites yet. Create one above to bring a neighbor in.</EmptyBlock>
      ) : (
        <ul className="space-y-3">
          {invites.map((invite) => {
            const used = invite.used_at !== null
            const busy = deletingId === invite.id
            return (
              <li
                key={invite.id}
                className="flex flex-col gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="break-all font-semibold text-stone-900">{invite.email}</p>
                  {invite.note && <p className="mt-0.5 text-sm text-stone-500">{invite.note}</p>}
                  <p className="mt-1 text-xs text-stone-400">
                    Created {formatDate(invite.created_at)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {used ? (
                    <Pill tone="stone">Used {formatDate(invite.used_at as string)}</Pill>
                  ) : (
                    <>
                      <Pill tone="amber">Waiting for signup</Pill>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDelete(invite)}
                        className={buttonClass('danger', 'sm')}
                      >
                        {busy ? 'Deleting...' : 'Delete'}
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
