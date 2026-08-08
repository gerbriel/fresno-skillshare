import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { StarInput } from './Stars'
import type { Review, Score } from '../lib/types'

interface ReviewFormProps {
  revieweeId: string
  existing: Review | null
  onSaved: () => void
}

const BODY_LIMIT = 4000

/**
 * Write or edit the single review this member is allowed to leave for another.
 * Saving is an upsert on (reviewer_id, reviewee_id), so editing reuses the row.
 */
export default function ReviewForm({ revieweeId, existing, onSaved }: ReviewFormProps) {
  const { profile } = useAuth()
  const [rating, setRating] = useState<Score | null>(null)
  const [reliability, setReliability] = useState<Score | null>(null)
  const [quality, setQuality] = useState<Score | null>(null)
  const [communication, setCommunication] = useState<Score | null>(null)
  const [vouch, setVouch] = useState(false)
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setRating(existing?.rating ?? null)
    setReliability(existing?.reliability ?? null)
    setQuality(existing?.quality ?? null)
    setCommunication(existing?.communication ?? null)
    setVouch(existing?.vouch ?? false)
    setBody(existing?.body ?? '')
    setError(null)
  }, [existing])

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!profile) {
      setError('You need to be signed in to leave a review.')
      return
    }
    if (rating === null) {
      setError('Pick an overall rating from 1 to 5 stars.')
      return
    }

    setSaving(true)
    setError(null)
    const { error: saveError } = await supabase.from('reviews').upsert(
      {
        reviewer_id: profile.id,
        reviewee_id: revieweeId,
        rating,
        reliability,
        quality,
        communication,
        vouch,
        body: body.trim() ? body.trim() : null,
      },
      { onConflict: 'reviewer_id,reviewee_id' }
    )
    setSaving(false)

    if (saveError) {
      setError(saveError.message)
      return
    }
    onSaved()
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-stone-200 bg-white p-5">
      <h3 className="text-base font-semibold text-stone-900">
        {existing ? 'Edit your review' : 'Leave a review'}
      </h3>
      <p className="mt-1 text-sm text-stone-500">
        One review per member. You can come back and update it any time.
      </p>

      <div className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700">
            Overall rating <span className="text-red-600">*</span>
          </label>
          <StarInput value={rating} onChange={setRating} />
        </div>

        <div className="space-y-1 rounded-xl bg-stone-50 p-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-stone-500">
            Optional details
          </p>
          <StarInput value={reliability} onChange={setReliability} label="Reliability" size="sm" />
          <StarInput value={quality} onChange={setQuality} label="Quality" size="sm" />
          <StarInput
            value={communication}
            onChange={setCommunication}
            label="Communication"
            size="sm"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input
            type="checkbox"
            checked={vouch}
            onChange={(event) => setVouch(event.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500"
          />
          I vouch for this member
        </label>

        <div>
          <label htmlFor="review-body" className="mb-1 block text-sm font-medium text-stone-700">
            Write-up
          </label>
          <textarea
            id="review-body"
            value={body}
            maxLength={BODY_LIMIT}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            placeholder="How did the trade go? What should other members know?"
            className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <p className="mt-1 text-right text-xs text-stone-400">
            {body.length} / {BODY_LIMIT}
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="mt-4">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : existing ? 'Update review' : 'Post review'}
        </button>
      </div>
    </form>
  )
}
