/**
 * @param {string} isoDate YYYY-MM-DD
 */
export function formatMatchDateLong(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  try {
    return new Intl.DateTimeFormat('en-PK', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(d)
  } catch {
    return d.toLocaleDateString()
  }
}

/**
 * Primary heading for a match (date-first; legacy `title` fallback).
 * @param {{ match_date?: string, title?: string }} match
 */
export function getMatchHeading(match) {
  if (match?.match_date) return formatMatchDateLong(match.match_date)
  if (match?.title) return match.title
  return 'Match'
}

/**
 * Short date for tables (e.g. 17 Apr 2026).
 * @param {string} isoDate
 */
export function formatMatchDateShort(isoDate) {
  if (!isoDate) return '—'
  const d = new Date(`${isoDate}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDate
  try {
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d)
  } catch {
    return d.toLocaleDateString()
  }
}
