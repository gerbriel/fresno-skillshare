import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Medal } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { describeError } from '../lib/errors'
import { formatDate } from '../lib/format'
import { LISTING_SELECT, REVIEWS_PAGE_SIZE } from '../lib/queries'
import { nextRankFor, rankFor, rankProgress, tradeCount } from '../lib/ranks'
import { cleanOptional, cleanText, LIMITS, safeHttpUrl } from '../lib/validate'
import Avatar from '../components/Avatar'
import RankBadge from '../components/RankBadge'
import { Stars } from '../components/Stars'
import ReviewCard from '../components/ReviewCard'
import ReviewForm from '../components/ReviewForm'
import ListingCard from '../components/ListingCard'
import type {
  BadgeRow,
  LeaderboardRow,
  ListingWithRelations,
  Profile as ProfileRow,
  Review,
  ReviewWithReviewer,
} from '../lib/types'

const REVIEWER_JOIN = '*, reviewer:profiles!reviews_reviewer_id_fkey(id, display_name, avatar_url)'

interface EditState {
  display_name: string
  location: string
  bio: string
  avatar_url: string
}

/** Member profile: reputation, service record, badges, listings, and reviews. */
export default function Profile() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile: me, isAdmin, refreshProfile } = useAuth()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [member, setMember] = useState<ProfileRow | null>(null)
  const [stats, setStats] = useState<LeaderboardRow | null>(null)
  const [badges, setBadges] = useState<BadgeRow[]>([])
  const [listings, setListings] = useState<ListingWithRelations[]>([])
  const [reviews, setReviews] = useState<ReviewWithReviewer[]>([])
  const [myReview, setMyReview] = useState<Review | null>(null)

  const [editing, setEditing] = useState(false)
  const [editState, setEditState] = useState<EditState>({
    display_name: '',
    location: '',
    bio: '',
    avatar_url: '',
  })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const meId = me?.id ?? null
  const isOwn = Boolean(meId && id && meId === id)

  const loadListings = useCallback(async () => {
    if (!id) return
    let query = supabase.from('listings').select(LISTING_SELECT).eq('owner_id', id)
    if (meId !== id) query = query.eq('status', 'active')
    const { data } = await query.order('created_at', { ascending: false })
    setListings((data as ListingWithRelations[] | null) ?? [])
  }, [id, meId])

  const loadReviews = useCallback(async () => {
    if (!id) return
    const [reviewsResult, statsResult, mineResult] = await Promise.all([
      supabase
        .from('reviews')
        .select(REVIEWER_JOIN)
        .eq('reviewee_id', id)
        .order('created_at', { ascending: false })
        .limit(REVIEWS_PAGE_SIZE),
      supabase.from('leaderboard').select('*').eq('id', id).maybeSingle(),
      meId
        ? supabase
            .from('reviews')
            .select('*')
            .eq('reviewee_id', id)
            .eq('reviewer_id', meId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ])
    setReviews((reviewsResult.data as ReviewWithReviewer[] | null) ?? [])
    setStats((statsResult.data as LeaderboardRow | null) ?? null)
    setMyReview((mineResult.data as Review | null) ?? null)
  }, [id, meId])

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)

    let listingsQuery = supabase.from('listings').select(LISTING_SELECT).eq('owner_id', id)
    if (meId !== id) listingsQuery = listingsQuery.eq('status', 'active')

    const [profileResult, statsResult, badgesResult, listingsResult, reviewsResult, mineResult] =
      await Promise.all([
        supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
        supabase.from('leaderboard').select('*').eq('id', id).maybeSingle(),
        supabase
          .from('badges')
          .select('*')
          .eq('user_id', id)
          .order('created_at', { ascending: false }),
        listingsQuery.order('created_at', { ascending: false }),
        supabase
          .from('reviews')
          .select(REVIEWER_JOIN)
          .eq('reviewee_id', id)
          .order('created_at', { ascending: false })
          .limit(REVIEWS_PAGE_SIZE),
        meId
          ? supabase
              .from('reviews')
              .select('*')
              .eq('reviewee_id', id)
              .eq('reviewer_id', meId)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])

    if (profileResult.error) {
      setError(describeError(profileResult.error, 'We could not load this profile.'))
      setLoading(false)
      return
    }

    const memberRow = (profileResult.data as ProfileRow | null) ?? null
    setMember(memberRow)
    setStats((statsResult.data as LeaderboardRow | null) ?? null)
    setBadges((badgesResult.data as BadgeRow[] | null) ?? [])
    setListings((listingsResult.data as ListingWithRelations[] | null) ?? [])
    setReviews((reviewsResult.data as ReviewWithReviewer[] | null) ?? [])
    setMyReview((mineResult.data as Review | null) ?? null)

    if (memberRow) {
      setEditState({
        display_name: memberRow.display_name,
        location: memberRow.location ?? '',
        bio: memberRow.bio ?? '',
        avatar_url: memberRow.avatar_url ?? '',
      })
    }
    setEditing(false)
    setLoading(false)
  }, [id, meId])

  useEffect(() => {
    load()
  }, [load])

  const handleSaveProfile = async (event: FormEvent) => {
    event.preventDefault()
    if (!member) return
    setSaveError(null)

    const avatarInput = editState.avatar_url.trim()
    const avatarUrl = avatarInput ? safeHttpUrl(avatarInput.slice(0, LIMITS.avatarUrl)) : null
    if (avatarInput && !avatarUrl) {
      setSaveError('The avatar URL must be a link starting with http:// or https://')
      return
    }

    setSaving(true)
    const { data, error: updateError } = await supabase
      .from('profiles')
      .update({
        display_name: cleanText(editState.display_name, LIMITS.displayName) || 'New member',
        location: cleanOptional(editState.location, LIMITS.location),
        bio: cleanOptional(editState.bio, LIMITS.bio),
        avatar_url: avatarUrl,
      })
      .eq('id', member.id)
      .select('*')
      .maybeSingle()
    setSaving(false)

    if (updateError) {
      setSaveError(describeError(updateError, 'We could not save your profile.'))
      return
    }
    if (data) setMember(data as ProfileRow)
    setEditing(false)
    await refreshProfile()
  }

  const handleDeleteAccount = async () => {
    setDeleting(true)
    setDeleteError(null)
    const { error: rpcError } = await supabase.rpc('delete_my_account')
    if (rpcError) {
      setDeleteError(describeError(rpcError, 'We could not delete your account.'))
      setDeleting(false)
      return
    }
    // The server already revoked every session; just clear this browser.
    await supabase.auth.signOut({ scope: 'local' })
    navigate('/')
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-40 animate-pulse rounded-2xl bg-stone-100" />
        <div className="h-28 animate-pulse rounded-2xl bg-stone-100" />
        <div className="h-56 animate-pulse rounded-2xl bg-stone-100" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-700">{error}</p>
        <button
          onClick={load}
          className="mt-3 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Try again
        </button>
      </div>
    )
  }

  if (!member) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-10 text-center">
        <h1 className="text-lg font-semibold text-stone-900">
          Member not found or not visible
        </h1>
        <p className="mt-2 text-sm text-stone-500">
          This member may still be pending approval, suspended, or the link may be wrong.
        </p>
        <button
          onClick={() => navigate('/feed')}
          className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Back to the feed
        </button>
      </div>
    )
  }

  const completedTrades = stats?.completed_trades ?? 0
  const rank = rankFor(completedTrades)
  const next = nextRankFor(completedTrades)
  const progress = rankProgress(completedTrades)

  return (
    <div className="space-y-6">
      {/* ---------- header ---------- */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar name={member.display_name} url={member.avatar_url} size="lg" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-stone-900">
                {member.display_name}
              </h1>
              <RankBadge completedTrades={completedTrades} />
              {member.role === 'admin' && (
                <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[11px] font-semibold text-white">
                  Admin
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-stone-500">
              {member.location ? `${member.location} · ` : ''}
              Member since {formatDate(member.created_at)}
            </p>
            {member.bio && (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-stone-700">
                {member.bio}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-wrap gap-2">
            {isOwn ? (
              <button
                onClick={() => setEditing((open) => !open)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
              >
                {editing ? 'Cancel' : 'Edit profile'}
              </button>
            ) : member.status === 'deleted' ? (
              <span className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs text-stone-500">
                This member left the co-op
              </span>
            ) : (
              <>
                <button
                  onClick={() => navigate(`/messages?to=${member.id}`)}
                  className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Message
                </button>
                <button
                  onClick={() => navigate(`/trades?with=${member.id}`)}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  Propose trade
                </button>
              </>
            )}
          </div>
        </div>

        {isOwn && editing && (
          <form
            onSubmit={handleSaveProfile}
            className="mt-5 space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="edit-display-name"
                  className="mb-1 block text-xs font-medium text-stone-600"
                >
                  Display name
                </label>
                <input
                  id="edit-display-name"
                  value={editState.display_name}
                  maxLength={LIMITS.displayName}
                  onChange={(event) =>
                    setEditState({ ...editState, display_name: event.target.value })
                  }
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div>
                <label
                  htmlFor="edit-location"
                  className="mb-1 block text-xs font-medium text-stone-600"
                >
                  Location
                </label>
                <input
                  id="edit-location"
                  value={editState.location}
                  maxLength={LIMITS.location}
                  onChange={(event) => setEditState({ ...editState, location: event.target.value })}
                  className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="edit-avatar"
                className="mb-1 block text-xs font-medium text-stone-600"
              >
                Avatar URL
              </label>
              <input
                id="edit-avatar"
                type="url"
                value={editState.avatar_url}
                maxLength={LIMITS.avatarUrl}
                onChange={(event) => setEditState({ ...editState, avatar_url: event.target.value })}
                placeholder="https://"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div>
              <label htmlFor="edit-bio" className="mb-1 block text-xs font-medium text-stone-600">
                Bio
              </label>
              <textarea
                id="edit-bio"
                rows={3}
                value={editState.bio}
                maxLength={LIMITS.bio}
                onChange={(event) => setEditState({ ...editState, bio: event.target.value })}
                placeholder="What do you trade? What are you looking for?"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            {saveError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{saveError}</p>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-xl border border-stone-300 px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-white"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <dl className="mt-6 grid grid-cols-2 gap-3 border-t border-stone-100 pt-5 sm:grid-cols-5">
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-400">Rating</dt>
            <dd className="mt-1">
              <Stars value={Number(stats?.avg_rating ?? 0)} size="sm" showNumber />
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-400">Reviews</dt>
            <dd className="mt-1 text-lg font-bold text-stone-900">{stats?.review_count ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-400">Vouches</dt>
            <dd className="mt-1 text-lg font-bold text-stone-900">{stats?.vouch_count ?? 0}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-400">Trades</dt>
            <dd className="mt-1 text-lg font-bold text-stone-900">{completedTrades}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-stone-400">Community credit</dt>
            <dd className="mt-1 text-lg font-bold text-amber-600">{stats?.score ?? 0}</dd>
          </div>
        </dl>
      </section>

      {/* ---------- service record ---------- */}
      <section className="rounded-2xl border border-stone-200 bg-white p-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Service record
        </h2>
        <div className="mt-2 flex flex-wrap items-baseline gap-2">
          <span className="text-lg font-bold text-stone-900">{rank.title}</span>
          <span className="text-sm text-stone-500">{rank.motto}</span>
        </div>
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-stone-100">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="mt-2 text-sm text-stone-500">
          {next
            ? `${next.min - completedTrades} more ${
                next.min - completedTrades === 1 ? 'trade' : 'trades'
              } to make ${next.title}.`
            : 'Top of the ladder.'}
          <span className="ml-1 text-stone-400">{tradeCount(completedTrades)} completed.</span>
        </p>
      </section>

      {/* ---------- badges ---------- */}
      <section>
        <h2 className="mb-3 text-lg font-bold tracking-tight text-stone-900">Badges</h2>
        {badges.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            No badges yet. Complete trades to earn them.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <span
                key={badge.id}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900"
              >
                <Medal className="h-4 w-4 shrink-0 text-amber-600" aria-hidden />
                <span className="font-medium">{badge.label}</span>
                <span className="text-xs text-amber-700/70">{formatDate(badge.created_at)}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* ---------- listings ---------- */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight text-stone-900">
            {isOwn ? 'Your listings' : 'Listings'}
          </h2>
          {isOwn && (
            <button
              onClick={() => navigate('/listings/new')}
              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              New listing
            </button>
          )}
        </div>
        {listings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            {isOwn
              ? 'You have no listings yet. Post what you offer or what you are seeking.'
              : 'This member has no active listings right now.'}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} onChanged={loadListings} />
            ))}
          </div>
        )}
      </section>

      {/* ---------- reviews ---------- */}
      <section>
        <h2 className="mb-3 text-lg font-bold tracking-tight text-stone-900">
          Reviews {reviews.length > 0 && <span className="text-stone-400">({reviews.length})</span>}
        </h2>

        <div className="space-y-4">
          {!isOwn && meId && member.status !== 'deleted' && (
            <ReviewForm revieweeId={member.id} existing={myReview} onSaved={loadReviews} />
          )}

          {reviews.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
              {isOwn
                ? 'No reviews yet. Complete a trade and your partner can vouch for you.'
                : 'No reviews yet. Be the first to share how a trade went.'}
            </div>
          ) : (
            reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                isOwn={review.reviewer_id === meId}
                canDelete={review.reviewer_id === meId || isAdmin}
                onDeleted={loadReviews}
              />
            ))
          )}
        </div>
      </section>

      {/* ---------- delete account (own profile only) ---------- */}
      {isOwn && (
        <section className="rounded-2xl border border-red-200 bg-white p-6">
          <h2 className="text-lg font-bold tracking-tight text-stone-900">Delete account</h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-stone-600">
            Deleting your account permanently removes your sign-in, email, profile details, and
            listings, and signs you out of every device. Messages, reviews, and trades you shared
            with other members are kept for their records, shown as &ldquo;Deleted member&rdquo; —
            see the{' '}
            <Link to="/privacy" className="font-medium text-emerald-700 underline underline-offset-2">
              Privacy Policy
            </Link>
            . This cannot be undone.
          </p>

          {!deleteOpen ? (
            <button
              type="button"
              onClick={() => setDeleteOpen(true)}
              className="mt-4 rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:border-red-300 hover:bg-red-50"
            >
              Delete my account
            </button>
          ) : (
            <div className="mt-4 space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
              <label htmlFor="delete-confirm" className="block text-sm font-medium text-red-800">
                Type <span className="font-bold">delete</span> to confirm
              </label>
              <input
                id="delete-confirm"
                value={deleteConfirm}
                onChange={(event) => setDeleteConfirm(event.target.value)}
                autoComplete="off"
                placeholder="delete"
                className="w-full max-w-xs rounded-xl border border-red-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
              {deleteError && (
                <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">{deleteError}</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={deleting || deleteConfirm.trim().toLowerCase() !== 'delete'}
                  onClick={() => void handleDeleteAccount()}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deleting ? 'Deleting...' : 'Permanently delete'}
                </button>
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => {
                    setDeleteOpen(false)
                    setDeleteConfirm('')
                    setDeleteError(null)
                  }}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
