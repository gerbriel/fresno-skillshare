/* Shared PostgREST select strings and page sizes, so the join shape
   and paging behavior stay consistent across pages. */

export const LISTING_SELECT =
  '*, owner:profiles!listings_owner_id_fkey(id, display_name, avatar_url), category:categories(*)'

export const FEED_PAGE_SIZE = 24
export const MESSAGES_PAGE_SIZE = 50
export const REVIEWS_PAGE_SIZE = 50
