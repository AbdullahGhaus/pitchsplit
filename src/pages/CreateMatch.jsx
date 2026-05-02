import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PitchSplitWordmark } from '../components/PitchSplitLogo'
import { createMatch, listDefaultPlayersWithOrder } from '../services/supabase'
import { useToastStore } from '../store/toastStore'
import { useAuthStore } from '../store/authStore'
import { Spinner } from '../components/Spinner'
import { formatMoney } from '../utils/money'
import {
  evaluateCostExpression,
  interpretedCostPkR,
} from '../utils/costExpression'

function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}

function costFieldInvalid(raw) {
  const t = String(raw).trim()
  if (!t) return false
  return !evaluateCostExpression(raw).ok
}

function CostEvalHint({ value }) {
  const t = String(value).trim()
  if (!t) return null
  const r = evaluateCostExpression(value)
  if (!r.ok) {
    return (
      <p className="mt-1 pl-0.5 text-[10px] font-medium leading-tight text-rose-600">
        Invalid — use numbers and + − × / ( ) only
      </p>
    )
  }
  return (
    <p className="mt-1 pl-0.5 text-[10px] font-medium leading-tight tabular-nums text-slate-500">
      = {formatMoney(r.value)}
    </p>
  )
}

/**
 * Ordered billable names: included defaults (in list order), then additionals (in order), case-insensitive dedupe.
 * @param {{ name: string, included: boolean }[]} defaultRows
 * @param {string[]} additionalRaw
 */
function orderedBillableNames(defaultRows, additionalRaw) {
  const seen = new Set()
  const out = []
  for (const row of defaultRows) {
    if (!row.included) continue
    const n = String(row.name).trim()
    if (!n) continue
    const k = n.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(n)
  }
  for (const raw of additionalRaw) {
    const n = String(raw).trim()
    if (!n) continue
    const k = n.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(n)
  }
  return out
}

/** Whether this default row's name is the one that counts toward the split (first claim). */
function defaultRowCountsTowardSplit(defaultRows, additionalPlayers, rowIdx) {
  const seen = new Set()
  for (let i = 0; i < defaultRows.length; i++) {
    const row = defaultRows[i]
    if (!row.included) {
      if (i === rowIdx) return false
      continue
    }
    const n = String(row.name).trim()
    const k = n.toLowerCase()
    if (!n) {
      if (i === rowIdx) return false
      continue
    }
    if (seen.has(k)) {
      if (i === rowIdx) return false
      continue
    }
    seen.add(k)
    if (i === rowIdx) return true
  }
  return false
}

/** Whether this additional row's name first-claims a slot in the split. */
function additionalRowCountsTowardSplit(defaultRows, additionalPlayers, rowIdx) {
  const seen = new Set()
  for (const row of defaultRows) {
    if (!row.included) continue
    const n = String(row.name).trim()
    const k = n.toLowerCase()
    if (!n) continue
    if (seen.has(k)) continue
    seen.add(k)
  }
  for (let j = 0; j < additionalPlayers.length; j++) {
    const n = String(additionalPlayers[j]).trim()
    const k = n.toLowerCase()
    if (!n) {
      if (j === rowIdx) return false
      continue
    }
    if (seen.has(k)) {
      if (j === rowIdx) return false
      continue
    }
    seen.add(k)
    if (j === rowIdx) return true
  }
  return false
}

export default function CreateMatch() {
  const navigate = useNavigate()
  const show = useToastStore((s) => s.show)
  const admin = useAuthStore((s) => s.admin)

  const [matchDate, setMatchDate] = useState(todayISODate)
  const [paidBy, setPaidBy] = useState('')
  const [venueCost, setVenueCost] = useState('')
  const [gearCost, setGearCost] = useState('')
  const [refreshmentCost, setRefreshmentCost] = useState('')
  const [otherCost, setOtherCost] = useState('')

  /** Default squad from DB: each row can be toggled off for this match only. */
  const [defaultPlayerRows, setDefaultPlayerRows] = useState([])
  const [additionalPlayers, setAdditionalPlayers] = useState([''])
  const [defaultsLoading, setDefaultsLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const totalAmount = useMemo(
    () =>
      interpretedCostPkR(venueCost) +
      interpretedCostPkR(gearCost) +
      interpretedCostPkR(refreshmentCost) +
      interpretedCostPkR(otherCost),
    [venueCost, gearCost, refreshmentCost, otherCost],
  )

  const hasInvalidCostField = useMemo(
    () =>
      costFieldInvalid(venueCost) ||
      costFieldInvalid(gearCost) ||
      costFieldInvalid(refreshmentCost) ||
      costFieldInvalid(otherCost),
    [venueCost, gearCost, refreshmentCost, otherCost],
  )

  const billableNames = useMemo(
    () => orderedBillableNames(defaultPlayerRows, additionalPlayers),
    [defaultPlayerRows, additionalPlayers],
  )

  const playerCount = billableNames.length

  const perHead =
    playerCount > 0 && Number.isFinite(totalAmount)
      ? totalAmount / playerCount
      : null

  const canSubmit = useMemo(() => {
    const names = billableNames
    return (
      Boolean(matchDate) &&
      Boolean(paidBy.trim()) &&
      !hasInvalidCostField &&
      totalAmount > 0 &&
      names.length > 0 &&
      Number.isFinite(perHead)
    )
  }, [matchDate, paidBy, hasInvalidCostField, totalAmount, billableNames, perHead])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setDefaultsLoading(true)
        const players = await listDefaultPlayersWithOrder()
        if (!cancelled) {
          setDefaultPlayerRows(
            players.map((row) => ({
              id: row.id,
              name: row.name,
              included: true,
            })),
          )
        }
      } catch (err) {
        if (!cancelled) {
          show(
            err instanceof Error
              ? err.message
              : 'Could not load default players.',
            'error',
          )
        }
      } finally {
        if (!cancelled) setDefaultsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [show])

  function addAdditionalPlayer() {
    setAdditionalPlayers((p) => [...p, ''])
  }

  function removeAdditionalPlayer(idx) {
    setAdditionalPlayers((p) => p.filter((_, i) => i !== idx))
  }

  function updateAdditionalPlayer(idx, value) {
    setAdditionalPlayers((p) => p.map((x, i) => (i === idx ? value : x)))
  }

  function shareCellLabel(countsTowardSplit) {
    if (playerCount === 0 || perHead === null) {
      return <span className="text-xs text-slate-400">—</span>
    }
    if (!countsTowardSplit) {
      return (
        <span className="text-xs font-medium text-slate-400">Not in split</span>
      )
    }
    return (
      <span className="shrink-0 text-xs font-semibold tabular-nums text-emerald-800">
        {formatMoney(perHead)}
        <span className="ml-1 font-normal text-slate-500">each</span>
      </span>
    )
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      const allPlayers = [...billableNames]
      const { match } = await createMatch({
        match_date: matchDate,
        paid_by: paidBy.trim() || null,
        total_amount: totalAmount,
        playerNames: allPlayers,
        costs: {
          venue_cost: interpretedCostPkR(venueCost),
          gear_cost: interpretedCostPkR(gearCost),
          refreshment_cost: interpretedCostPkR(refreshmentCost),
          additional_cost: interpretedCostPkR(otherCost),
          total_amount: totalAmount,
        },
        per_head: perHead,
      })
      show('Match created.', 'success')
      navigate(`/admin/match/${match.id}`)
    } catch (err) {
      show(
        err instanceof Error ? err.message : 'Could not create match.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  const costInputClass =
    'mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="mb-4">
              <Link to="/admin">
                <PitchSplitWordmark size="sm" iconClassName="h-8 w-8" />
              </Link>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Create match
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Enter costs in PKR (they sum to the match total), then confirm the
              squad — per-player share updates live as you adjust costs or
              players.
            </p>
          </div>
          <Link
            to="/admin"
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <label className="block text-sm font-medium text-slate-800">
            Match date
            <input
              type="date"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              required
            />
          </label>

          <label className="mt-5 block text-sm font-medium text-slate-800">
            <div className="flex items-center justify-between gap-3">
              <span>Paid by</span>
              <button
                type="button"
                onClick={() => {
                  const username = String(admin?.username || '').trim()
                  if (username) setPaidBy(username)
                }}
                disabled={!String(admin?.username || '').trim()}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Paid by me
              </button>
            </div>
            <input
              type="text"
              className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="e.g. organiser or payer name"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              autoComplete="off"
              required
            />
          </label>

          <div className="mt-6">
            <p className="text-sm font-medium text-slate-800">Costs (PKR)</p>
            <p className="mt-0.5 text-xs text-slate-500">
              Type a plain amount or an expression (e.g.{' '}
              <span className="font-mono text-[11px]">400*3</span>,{' '}
              <span className="font-mono text-[11px]">(1000+500)/10</span>).
              Lines show the interpreted PKR sum; totals add each line’s result.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium text-slate-700">
                Venue cost
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  className={costInputClass}
                  placeholder="0 or 400*3"
                  value={venueCost}
                  onChange={(e) => setVenueCost(e.target.value)}
                />
                <CostEvalHint value={venueCost} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Gear cost
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  className={costInputClass}
                  placeholder="0 or 500+120"
                  value={gearCost}
                  onChange={(e) => setGearCost(e.target.value)}
                />
                <CostEvalHint value={gearCost} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Refreshment cost
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  className={costInputClass}
                  placeholder="0"
                  value={refreshmentCost}
                  onChange={(e) => setRefreshmentCost(e.target.value)}
                />
                <CostEvalHint value={refreshmentCost} />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Additional cost
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  spellCheck={false}
                  className={costInputClass}
                  placeholder="0"
                  value={otherCost}
                  onChange={(e) => setOtherCost(e.target.value)}
                />
                <CostEvalHint value={otherCost} />
              </label>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Total amount
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-950">
              {formatMoney(totalAmount)}
            </p>
            <p className="mt-1 text-xs text-emerald-900/80">
              Sum of venue, gear, refreshment, and additional costs.
            </p>
            {playerCount > 0 && (
              <p className="mt-3 border-t border-emerald-200/80 pt-3 text-sm text-emerald-900">
                <span className="font-semibold">{playerCount}</span> in split
                →{' '}
                <span className="font-bold tabular-nums">
                  {perHead !== null ? formatMoney(perHead) : '—'}
                </span>{' '}
                per player
              </p>
            )}
          </div>

          <div className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  Default squad
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  From your database — included by default; turn off anyone not
                  playing. Share shown when a player counts toward the split.
                </p>
              </div>
            </div>

            <div className="mt-3 space-y-2">
              {defaultsLoading ? (
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <Spinner className="size-4 border-slate-300 border-t-slate-600" />
                  Loading default players…
                </div>
              ) : defaultPlayerRows.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                  No default players found. Manage your squad defaults in{' '}
                  <Link
                    to="/admin/squad-defaults"
                    className="font-semibold text-amber-950 underline underline-offset-2 hover:text-black"
                  >
                    Squad defaults
                  </Link>
                  .
                </div>
              ) : (
                defaultPlayerRows.map((row, idx) => {
                  const counts = defaultRowCountsTowardSplit(
                    defaultPlayerRows,
                    additionalPlayers,
                    idx,
                  )
                  const rowKey = row.id || `${row.name}-${idx}`
                  return (
                    <label
                      key={rowKey}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 transition ${
                        row.included
                          ? 'border-emerald-300 bg-emerald-50/80 ring-1 ring-emerald-200/60'
                          : 'border-slate-200 bg-white opacity-75 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        checked={row.included}
                        onChange={() => {
                          setDefaultPlayerRows((rows) =>
                            rows.map((r, i) =>
                              i === idx ? { ...r, included: !r.included } : r,
                            ),
                          )
                        }}
                      />
                      <span className="min-w-0 flex-1 text-sm font-medium text-slate-900">
                        {row.name}
                      </span>
                      <div className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                        {shareCellLabel(counts)}
                        <span
                          className={`text-[10px] font-semibold uppercase tracking-wide ${
                            row.included ? 'text-emerald-800' : 'text-slate-400'
                          }`}
                        >
                          {row.included ? 'Included' : 'Skipped'}
                        </span>
                      </div>
                    </label>
                  )
                })
              )}
            </div>

            <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  Additional players (this match only)
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Not stored as defaults — only added to this match.
                </p>
              </div>
              <button
                type="button"
                onClick={addAdditionalPlayer}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                Add additional player
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {additionalPlayers.map((p, idx) => {
                const counts = additionalRowCountsTowardSplit(
                  defaultPlayerRows,
                  additionalPlayers,
                  idx,
                )
                const trimmed = String(p).trim()
                return (
                  <div key={idx} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 gap-2">
                      <input
                        className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                        placeholder={`Additional player ${idx + 1}`}
                        value={p}
                        onChange={(e) =>
                          updateAdditionalPlayer(idx, e.target.value)
                        }
                      />
                      <button
                        type="button"
                        onClick={() => removeAdditionalPlayer(idx)}
                        className="shrink-0 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={additionalPlayers.length <= 1}
                        aria-label="Remove additional player"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="flex shrink-0 items-center justify-end pl-1 sm:w-44 sm:justify-end">
                      {!trimmed ? (
                        <span className="text-xs text-slate-400">—</span>
                      ) : (
                        shareCellLabel(counts)
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Empty additional rows are ignored. Duplicate names only count once.
              At least one player in the split and a total greater than 0 are
              required.
            </p>
          </div>

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy && (
              <Spinner className="size-4 border-white/40 border-t-white" />
            )}
            {busy ? 'Creating…' : 'Create match'}
          </button>
        </form>
      </div>
    </div>
  )
}
