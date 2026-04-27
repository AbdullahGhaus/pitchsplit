/**
 * @param {number} n
 * @param {string} [currency]
 */
export function formatMoney(n, currency = 'PKR') {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(v)
  } catch {
    return v.toFixed(2)
  }
}
