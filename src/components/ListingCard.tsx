import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { timeAgo } from '../lib/format'
import Avatar from './Avatar'
import type { ListingWithRelations } from '../lib/types'

interface ListingCardProps {
  listing: ListingWithRelations
  onChanged?: () => void
}

const actionButton =
  'rounded-lg border border-stone-200 px-2.5 py-1 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50'

export default function ListingCard({ listing, onChanged }: ListingCardProps) {
  const { profile } = useAuth()
  const navigate = useNavigate()

  const [status, setStatus] = useState<'active' | 'paused'>(listing.status)
  const [busy, setBusy] = useState(false)
  const [duplicated, setDuplicated] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isMine = !!profile && listing.owner_id === profile.id

  const toggleStatus = async () => {
    const next = status === 'active' ? 'paused' : 'active'
    setBusy(true)
    setError(null)
    const { error: updateError } = await supabase
      .from('listings')
      .update({ status: next })
      .eq('id', listing.id)
    setBusy(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setStatus(next)
    onChanged?.()
  }

  const remove = async () => {
    if (!window.confirm('Delete this listing? This cannot be undone.')) return
    setBusy(true)
    setError(null)
    const { error: deleteError } = await supabase.from('listings').delete().eq('id', listing.id)
    setBusy(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    onChanged?.()
  }

  const duplicate = async () => {
    if (!profile) return
    setBusy(true)
    setError(null)
    const { error: insertError } = await supabase.from('listings').insert({
      owner_id: profile.id,
      category_id: listing.category_id,
      type: listing.type,
      kind: listing.kind,
      title: listing.title,
      description: listing.description,
      duplicated_from: listing.id,
    })
    setBusy(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setDuplicated(true)
    onChanged?.()
  }

  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-center gap-2">
        {listing.category && (
          <span className="text-xs text-stone-500">
            <span aria-hidden>{listing.category.emoji ?? '🔁'}</span> {listing.category.name}
          </span>
        )}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              listing.type === 'offering'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-amber-100 text-amber-800'
            }`}
          >
            {listing.type === 'offering' ? 'Offering' : 'Seeking'}
          </span>
          <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
            {listing.kind === 'service' ? 'Service' : 'Good'}
          </span>
          {status === 'paused' && (
            <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[11px] font-semibold text-white">
              Paused
            </span>
          )}
        </span>
      </div>

      <div>
        <h3 className="text-base font-semibold text-stone-900">{listing.title}</h3>
        {listing.description && (
          <p className="mt-1 line-clamp-3 text-sm text-stone-600">{listing.description}</p>
        )}
        {listing.duplicated_from && (
          <p className="mt-1.5 text-[11px] text-stone-400">Duplicated</p>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-stone-100 pt-3">
        <Link
          to={`/u/${listing.owner.id}`}
          className="flex items-center gap-2 text-sm font-medium text-stone-700 hover:text-emerald-700"
        >
          <Avatar name={listing.owner.display_name} url={listing.owner.avatar_url} size="sm" />
          {listing.owner.display_name}
        </Link>
        <span className="ml-auto text-xs text-stone-400">{timeAgo(listing.created_at)}</span>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <div className="flex flex-wrap gap-2">
        {isMine ? (
          <>
            <button
              type="button"
              className={actionButton}
              disabled={busy}
              onClick={() => navigate(`/listings/${listing.id}/edit`)}
            >
              Edit
            </button>
            <button type="button" className={actionButton} disabled={busy} onClick={toggleStatus}>
              {status === 'active' ? 'Pause' : 'Activate'}
            </button>
            <button
              type="button"
              className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={busy}
              onClick={remove}
            >
              Delete
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className={
                duplicated
                  ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700'
                  : actionButton
              }
              disabled={busy || duplicated || !profile}
              onClick={duplicate}
            >
              {duplicated ? 'Added to your profile' : 'Duplicate to my profile'}
            </button>
            <button
              type="button"
              className={actionButton}
              disabled={busy}
              onClick={() => navigate(`/messages?to=${listing.owner.id}`)}
            >
              Message
            </button>
          </>
        )}
      </div>
    </article>
  )
}
