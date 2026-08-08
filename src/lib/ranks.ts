// Rank ladder lives client-side on purpose: renaming a rank should not
// require a database migration. Ranks are driven by completed trades.
// Ranks unlock nothing and cost nothing; they are purely social.

export interface Rank {
  title: string
  min: number
  motto: string
  tier: 'standard' | 'gold'
}

export const RANKS: Rank[] = [
  { title: 'Newcomer', min: 0, motto: 'Welcome to the co-op', tier: 'standard' },
  { title: 'Neighbor', min: 1, motto: 'First trade in the books', tier: 'standard' },
  { title: 'Helping Hand', min: 3, motto: 'Showing up for people', tier: 'standard' },
  { title: 'Trader', min: 7, motto: 'A familiar face at the table', tier: 'standard' },
  { title: 'Steady Trader', min: 15, motto: 'Reliable, rain or shine', tier: 'standard' },
  { title: 'Craftsman', min: 25, motto: 'Work that speaks for itself', tier: 'standard' },
  { title: 'Cornerstone', min: 40, motto: 'The neighborhood counts on you', tier: 'standard' },
  { title: 'Pillar', min: 60, motto: 'Holding the co-op up', tier: 'gold' },
  { title: 'Keystone', min: 85, motto: 'Fresno runs through you', tier: 'gold' },
  { title: 'Co-op Legend', min: 120, motto: 'Your name opens doors', tier: 'gold' },
]

export function rankFor(completedTrades: number): Rank {
  let current = RANKS[0]
  for (const rank of RANKS) {
    if (completedTrades >= rank.min) current = rank
  }
  return current
}

export function nextRankFor(completedTrades: number): Rank | null {
  return RANKS.find((rank) => rank.min > completedTrades) ?? null
}

export function tradeCount(n: number): string {
  return n === 1 ? '1 trade' : `${n} trades`
}

export function rankProgress(completedTrades: number): number {
  const current = rankFor(completedTrades)
  const next = nextRankFor(completedTrades)
  if (!next) return 100
  return Math.round(((completedTrades - current.min) / (next.min - current.min)) * 100)
}
