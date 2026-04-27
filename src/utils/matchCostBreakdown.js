export const COST_BREAKDOWN_ROWS = [
  { key: 'venue_cost', label: 'Venue' },
  { key: 'gear_cost', label: 'Gear' },
  { key: 'refreshment_cost', label: 'Refreshment' },
  { key: 'additional_cost', label: 'Additional' },
]

/** @param {{ costs?: Record<string, unknown> } | null | undefined} match */
export function costBreakdownLines(match) {
  const c = match?.costs
  if (!c || typeof c !== 'object') return null
  const lines = COST_BREAKDOWN_ROWS.map(({ key, label }) => ({
    label,
    value: Number(c[key]) || 0,
  }))
  const sumParts = lines.reduce((s, l) => s + l.value, 0)
  if (sumParts <= 0) return null
  return lines
}
