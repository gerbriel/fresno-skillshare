export type Role = 'admin' | 'member'
export type MemberStatus = 'pending' | 'active' | 'suspended' | 'deleted'
export type Score = 1 | 2 | 3 | 4 | 5

export interface Profile {
  id: string
  display_name: string
  avatar_url: string | null
  bio: string | null
  location: string | null
  role: Role
  status: MemberStatus
  created_at: string
}

export type ProfileLite = Pick<Profile, 'id' | 'display_name' | 'avatar_url'>

export interface JoinRequest {
  id: string
  name: string
  email: string
  message: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
  reviewed_by: string | null
  reviewed_at: string | null
}

export interface Invite {
  id: string
  email: string
  invited_by: string | null
  note: string | null
  created_at: string
  used_at: string | null
}

export interface Category {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  created_at: string
}

export type ListingType = 'offering' | 'seeking'
export type ListingKind = 'service' | 'good'

export interface Listing {
  id: string
  owner_id: string
  category_id: string | null
  type: ListingType
  kind: ListingKind
  title: string
  description: string | null
  status: 'active' | 'paused'
  duplicated_from: string | null
  created_at: string
  updated_at: string
}

export interface ListingWithRelations extends Listing {
  owner: ProfileLite
  category: Category | null
}

export interface Review {
  id: string
  reviewer_id: string
  reviewee_id: string
  rating: Score
  reliability: Score | null
  quality: Score | null
  communication: Score | null
  vouch: boolean
  body: string | null
  created_at: string
  updated_at: string
}

export type NewReview = Pick<
  Review,
  'reviewee_id' | 'rating' | 'reliability' | 'quality' | 'communication' | 'vouch' | 'body'
>

export interface ReviewWithReviewer extends Review {
  reviewer: ProfileLite
}

export interface MessageThread {
  id: string
  subject: string | null
  a_id: string
  b_id: string
  is_broadcast: boolean
  last_message_at: string
  last_message_preview: string | null
  last_message_from: string | null
  a_unread: boolean
  b_unread: boolean
  created_at: string
}

export interface ThreadWithProfiles extends MessageThread {
  a: ProfileLite
  b: ProfileLite
}

export interface Message {
  id: string
  thread_id: string
  sender_id: string
  body: string
  created_at: string
}

export interface Newsletter {
  id: string
  author_id: string | null
  subject: string
  body: string
  status: 'draft' | 'sent'
  recipient_count: number
  created_at: string
  sent_at: string | null
}

export type TradeStatus = 'proposed' | 'accepted' | 'completed' | 'declined'

export interface Trade {
  id: string
  proposer_id: string
  partner_id: string
  listing_id: string | null
  title: string
  notes: string | null
  status: TradeStatus
  created_at: string
  completed_at: string | null
}

export interface TradeWithProfiles extends Trade {
  proposer: ProfileLite
  partner: ProfileLite
}

export interface TradeTask {
  id: string
  trade_id: string
  title: string
  done: boolean
  completed_at: string | null
  created_at: string
}

export interface BadgeRow {
  id: string
  user_id: string
  trade_id: string | null
  label: string
  awarded_by: string | null
  created_at: string
}

export interface LeaderboardRow {
  id: string
  display_name: string
  avatar_url: string | null
  location: string | null
  avg_rating: number
  review_count: number
  vouch_count: number
  completed_trades: number
  badge_count: number
  score: number
}

export interface CoopEvent {
  id: string
  title: string
  location: string | null
  notes: string | null
  starts_at: string
  ends_at: string | null
  created_at: string
  updated_at: string
}

export interface SiteSettings {
  hero_heading: string
  hero_subheading: string
  about: string
  how_it_works: string[]
}
