/**
 * Stable pseudo-random hue from a string (for avatar ring color).
 * @param {string} seed
 */
export function hueFromString(seed) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h % 360
}

/**
 * 1–2 letter initials from a display name.
 * @param {string} name
 */
export function getInitials(name) {
  const t = String(name).trim()
  if (!t) return '?'
  const parts = t.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  return t.slice(0, 2).toUpperCase()
}
