import { useId } from 'react'

/**
 * PitchSplit brand mark: top-down cricket pitch with a centre “split” line —
 * costs shared fairly down the middle of the strip.
 */
export function PitchSplitMark({ className = 'h-10 w-10', 'aria-hidden': ariaHidden = true }) {
  const uid = useId().replace(/:/g, '')
  const fieldId = `ps-field-${uid}`
  const stripId = `ps-strip-${uid}`

  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={ariaHidden}
    >
      <defs>
        <linearGradient id={fieldId} x1="0" y1="0" x2="40" y2="40">
          <stop stopColor="#047857" />
          <stop offset="0.5" stopColor="#059669" />
          <stop offset="1" stopColor="#065f46" />
        </linearGradient>
        <linearGradient id={stripId} x1="20" y1="6" x2="20" y2="34">
          <stop stopColor="#6ee7b7" stopOpacity="0.35" />
          <stop offset="1" stopColor="#34d399" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${fieldId})`} />
      <rect
        x="13"
        y="6"
        width="14"
        height="28"
        rx="2.5"
        fill={`url(#${stripId})`}
      />
      <line
        x1="9"
        y1="13"
        x2="31"
        y2="13"
        stroke="white"
        strokeOpacity="0.28"
        strokeWidth="1"
      />
      <line
        x1="9"
        y1="27"
        x2="31"
        y2="27"
        stroke="white"
        strokeOpacity="0.28"
        strokeWidth="1"
      />
      {/* Centre split — shared cost seam */}
      <line
        x1="20"
        y1="7.5"
        x2="20"
        y2="32.5"
        stroke="#fef9c3"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.95"
      />
      <circle cx="20" cy="20" r="2.25" fill="#fef9c3" fillOpacity="0.9" />
    </svg>
  )
}

/**
 * “Pitch” (slate) + “Split” (emerald) wordmark, optional icon.
 */
export function PitchSplitWordmark({
  className = '',
  showIcon = true,
  iconClassName = 'h-9 w-9 shrink-0',
  size = 'md',
}) {
  const text =
    size === 'lg'
      ? 'text-xl sm:text-2xl'
      : size === 'sm'
        ? 'text-base'
        : 'text-lg'

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {showIcon && <PitchSplitMark className={iconClassName} />}
      <span
        className={`pitchsplit-wordmark-text font-bold tracking-tight ${text}`}
      >
        <span className="text-slate-900">Pitch</span>
        <span className="text-emerald-600">Split</span>
      </span>
    </div>
  )
}
