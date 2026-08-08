import { rankFor, tradeCount } from '../lib/ranks'

interface RankBadgeProps {
  completedTrades: number
}

/** Small pill shown next to a member's name. Hidden for brand-new members. */
export default function RankBadge({ completedTrades }: RankBadgeProps) {
  const rank = rankFor(completedTrades)
  if (rank.min === 0) return null

  const gold = rank.tier === 'gold'
  return (
    <span
      title={`${tradeCount(completedTrades)} completed. ${rank.motto}`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        gold
          ? 'bg-amber-100 text-amber-800 ring-1 ring-amber-300'
          : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
      }`}
    >
      {gold && <span aria-hidden>⚜</span>}
      {rank.title}
    </span>
  )
}
