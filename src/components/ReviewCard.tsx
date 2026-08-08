import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { timeAgo } from '../lib/format'
import Avatar from './Avatar'
import { Stars } from './Stars'
import type { ReviewWithReviewer } from '../lib/types'

interface ReviewCardProps {
  review: ReviewWithReviewer
  isOwn: boolean
  canDelete: boolean
  onDeleted?: () => void
}

/**
 * One member review. Mirrors the Watrloo review card: overall stars up top,
 * optional sub-scores underneath, and a vouch pill for social credit.
 */
export default function ReviewCard({ review, isOwn, canDelete, onDeleted }: ReviewCardProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const edited = review.updated_at !== review.created_at
  const subScores = [
    { label: 'Reliability', value: review.reliability },
    { label: 'Quality', value: review.quality },
    { label: 'Communication', value: review.communication },
  ].filter((s) => s.value !== null)

  const handleDelete = async () => {
    if (!window.confirm('Delete this review? This cannot be undone.')) return
    setDeleting(true)
    setError(null)
    const { error: deleteError } = await supabase.from('reviews').delete().eq('id', review.id)
    setDeleting(false)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    onDeleted?.()
  }

  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Avatar name={review.reviewer.display_name} url={review.reviewer.avatar_url} size="sm" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/u/${review.reviewer.id}`}
                className="text-sm font-semibold text-stone-900 hover:text-emerald-700"
              >
                {review.reviewer.display_name}
              </Link>
              {isOwn && (
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                  Your review
                </span>
              )}
            </div>
            <div className="mt-1">
              <Stars value={review.rating} size="sm" showNumber />
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-xs text-stone-400">
            {timeAgo(review.created_at)}
            {edited && <span className="ml-1 text-stone-400">(edited)</span>}
          </div>
          {canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="mt-1 text-xs font-medium text-red-600 hover:text-red-700 disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          )}
        </div>
      </div>

      {subScores.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t border-stone-100 pt-3">
          {subScores.map((score) => (
            <span key={score.label} className="inline-flex items-center gap-1.5">
              <span className="text-xs text-stone-500">{score.label}</span>
              <Stars value={score.value as number} size="sm" />
            </span>
          ))}
        </div>
      )}

      {review.vouch && (
        <div className="mt-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            Vouched ✓
          </span>
        </div>
      )}

      {review.body && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-stone-700">
          {review.body}
        </p>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}
    </article>
  )
}
