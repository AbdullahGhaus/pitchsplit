/**
 * Interpret cost fields like `400*3`, `(1000+500)/2`, commas optional.
 * No eval of arbitrary JS — expression must pass a strict charset check.
 */

/**
 * @param {string | number | undefined | null} input
 * @returns {{ ok: boolean, value: number }}
 */
export function evaluateCostExpression(input) {
  const trimmed = String(input ?? '').trim()
  if (!trimmed) {
    return { ok: true, value: 0 }
  }

  const compact = trimmed.replace(/\s+/g, '').replace(/,/g, '')

  if (!compact) {
    return { ok: true, value: 0 }
  }

  if (!/^[\d.+\-*/()]+$/.test(compact)) {
    return { ok: false, value: 0 }
  }

  try {
    const fn = Function(`'use strict'; return (${compact})`)
    const v = fn()
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      return { ok: false, value: 0 }
    }
    if (v < 0) {
      return { ok: false, value: 0 }
    }
    return { ok: true, value: v }
  } catch {
    return { ok: false, value: 0 }
  }
}

/** For totals — invalid non-empty expressions count as 0; use validators in UI separately. */
export function interpretedCostPkR(input) {
  const r = evaluateCostExpression(input)
  return r.ok ? r.value : 0
}
