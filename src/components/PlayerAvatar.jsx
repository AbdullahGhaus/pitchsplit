import { getInitials, hueFromString } from '../utils/avatar'

export function PlayerAvatar({ name, size = 'md' }) {
  const initials = getInitials(name)
  const hue = hueFromString(name || 'player')
  const sizes =
    size === 'sm'
      ? 'h-9 w-9 text-xs'
      : size === 'lg'
        ? 'h-12 w-12 text-base'
        : 'h-10 w-10 text-sm'

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-2xl font-bold text-white shadow-sm ring-1 ring-black/5 ${sizes}`}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 65% 42%), hsl(${(hue + 40) % 360} 70% 35%))`,
      }}
      aria-hidden
    >
      {initials}
    </div>
  )
}
