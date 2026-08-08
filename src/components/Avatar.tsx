interface AvatarProps {
  name: string
  url?: string | null
  size?: 'sm' | 'md' | 'lg'
}

const sizes = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-20 w-20 text-2xl',
}

export default function Avatar({ name, url, size = 'md' }: AvatarProps) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`${sizes[size]} rounded-full object-cover ring-1 ring-stone-200`}
      />
    )
  }

  return (
    <div
      className={`${sizes[size]} flex items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-700 ring-1 ring-emerald-200`}
      aria-hidden
    >
      {initials || '?'}
    </div>
  )
}
