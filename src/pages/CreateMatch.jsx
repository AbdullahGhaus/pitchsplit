import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PitchSplitWordmark } from '../components/PitchSplitLogo'
import { createMatch, listDefaultPlayersWithOrder } from '../services/supabase'
import { listAdminPaymentDirectory } from '../services/adminDirectory'
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

function FormSectionCard({ title, subtitle, actions, children, className = '' }) {
  const hasHeader = Boolean(title || subtitle || actions)

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-950/4 sm:p-6 ${className}`.trim()}
    >
      {hasHeader ? (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="min-w-0 flex-1">
            {title ? (
              <h2 className="text-base font-semibold tracking-tight text-slate-900">
                {title}
              </h2>
            ) : null}
            {subtitle ? (
              <div
                className={`text-xs leading-relaxed text-slate-500 ${title ? 'mt-1.5' : ''}`}
              >
                {subtitle}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {actions}
            </div>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  )
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
  const [paidByAdmins, setPaidByAdmins] = useState([])
  const [paidByAdminsLoading, setPaidByAdminsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const paidByPrefillApplied = useRef(false)

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
      ; (async () => {
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

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        try {
          setPaidByAdminsLoading(true)
          const rows = await listAdminPaymentDirectory()
          if (!cancelled) setPaidByAdmins(rows)
        } catch (err) {
          if (!cancelled) {
            setPaidByAdmins([])
            show(
              err instanceof Error ? err.message : 'Could not load admin list.',
              'error',
            )
          }
        } finally {
          if (!cancelled) setPaidByAdminsLoading(false)
        }
      })()
    return () => {
      cancelled = true
    }
  }, [show])

  useEffect(() => {
    if (paidByPrefillApplied.current || paidByAdminsLoading) return
    if (String(paidBy).trim() !== '') return
    const u = String(admin?.username ?? '').trim()
    if (!u) return
    const hasRow = paidByAdmins.some(
      (a) => a.username.toLowerCase() === u.toLowerCase(),
    )
    if (!hasRow) return
    setPaidBy(u)
    paidByPrefillApplied.current = true
  }, [paidBy, paidByAdmins, paidByAdminsLoading, admin?.username])

  function addAdditionalPlayer() {
    setAdditionalPlayers((p) => [...p, ''])
  }

  function removeAdditionalPlayer(idx) {
    setAdditionalPlayers((p) => p.filter((_, i) => i !== idx))
  }

  function updateAdditionalPlayer(idx, value) {
    setAdditionalPlayers((p) => p.map((x, i) => (i === idx ? value : x)))
  }

  const allDefaultsIncluded =
    defaultPlayerRows.length > 0 &&
    defaultPlayerRows.every((row) => row.included)

  function toggleSelectAllDefaults() {
    setDefaultPlayerRows((rows) => {
      if (rows.length === 0) return rows
      const everyoneIn = rows.every((r) => r.included)
      const target = !everyoneIn
      return rows.map((r) => ({ ...r, included: target }))
    })
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
    <div className="min-h-[100dvh] bg-slate-50 px-3 py-6 sm:px-4 sm:py-8">
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
            {/* <p className="mt-1 text-sm text-slate-600">
              Enter costs in PKR (they sum to the match total), then confirm the
              squad — per-player share updates live as you adjust costs or
              players.
            </p> */}
          </div>
          <Link
            to="/admin"
            className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>

        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <FormSectionCard
            title="Match date"
            subtitle="The playing day for this fixture."
          >
            <label className="sr-only" htmlFor="create-match-date">
              Match date
            </label>
            <input
              id="create-match-date"
              type="date"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              value={matchDate}
              onChange={(e) => setMatchDate(e.target.value)}
              required
            />
          </FormSectionCard>

          <FormSectionCard
            title="Paid by"
            subtitle="Choose an admin for the payer name, or type a custom label. This appears on the public match link."
            actions={
              <button
                type="button"
                onClick={() => {
                  const username = String(admin?.username || '').trim()
                  if (username) setPaidBy(username)
                }}
                disabled={!String(admin?.username || '').trim()}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Paid by me
              </button>
            }
          >
            {paidByAdminsLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Spinner />
                Loading admins…
              </div>
            ) : paidByAdmins.length > 0 ? (
              <div
                className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-2.5"
                role="group"
                aria-label="Choose payer from admins"
              >
                {paidByAdmins.map((row) => {
                  const checked =
                    paidBy.trim().toLowerCase() ===
                    row.username.trim().toLowerCase()
                  const label =
                    row.display_name?.trim() || row.username

                  return (
                    <label
                      key={row.id}
                      title={label}
                      className={`inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 pl-2 text-xs font-medium transition sm:text-[13px] ${checked
                        ? 'border-emerald-400 bg-emerald-50 text-emerald-950 ring-1 ring-emerald-200/70'
                        : 'border-slate-200 bg-slate-50/80 text-slate-800 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                    >
                      <input
                        type="checkbox"
                        className="h-3 w-3 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 sm:h-3.5 sm:w-3.5"
                        checked={checked}
                        onChange={() => {
                          if (checked) setPaidBy('')
                          else setPaidBy(row.username)
                        }}
                      />
                      <span className="min-w-0 max-w-44 truncate sm:max-w-56">
                        {label}
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : null}

            <label className="mt-4 block text-sm font-medium text-slate-800">
              Payer name (stored on match)
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                placeholder="Matches an admin username or any custom label"
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                autoComplete="off"
                required
              />
            </label>
          </FormSectionCard>

          <FormSectionCard
            title="Costs (PKR)"
            subtitle={
              <>
                Enter plain amounts or expressions (e.g.{' '}
                <span className="font-mono text-[11px] text-slate-600">400*3</span>,{' '}
                <span className="font-mono text-[11px] text-slate-600">(1000+500)/10</span>). Each field shows its
                interpreted value; totals add all four lines.
              </>
            }
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          </FormSectionCard>

          <FormSectionCard
            title="Default squad"
            subtitle="From your squad defaults — toggle off players not in this match. Share shows only for names that count toward the split."
            actions={
              !defaultsLoading && defaultPlayerRows.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleSelectAllDefaults()}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                >
                  {allDefaultsIncluded ? 'Deselect all' : 'Select all'}
                </button>
              ) : null
            }
          >
            <div className="">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{
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
                        className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-2.5 transition ${row.included
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
                        {/* <div className="flex shrink-0 flex-col items-end gap-0.5 sm:flex-row sm:items-center sm:gap-2">
                          {shareCellLabel(counts)}
                          <span
                            className={`text-[10px] font-semibold uppercase tracking-wide ${
                              row.included ? 'text-emerald-800' : 'text-slate-400'
                            }`}
                          >
                            {row.included ? 'Included' : 'Skipped'}
                          </span>
                        </div> */}
                      </label>
                    )
                  })
                }
                </div>
              )}
            </div>
          </FormSectionCard>

          <FormSectionCard
            title="Additional players"
            subtitle="Extra names for this match only — not saved to squad defaults."
            actions={
              <button
                type="button"
                onClick={addAdditionalPlayer}
                className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                Add player
              </button>
            }
          >
            <div className="space-y-2">
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
            {/* <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500">
              Empty additional rows are ignored. Duplicate names only count once.
              At least one player in the split and a total greater than 0 are
              required.
            </p> */}
          </FormSectionCard>

          <FormSectionCard
            title="Totals"
            subtitle="Match total from your costs, split across everyone in the squad above."
            className="border-emerald-200/90 bg-linear-to-br from-emerald-50/80 via-white to-white ring-emerald-900/10"
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
              Total amount
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-950">
              {formatMoney(totalAmount)}
            </p>
            <p className="mt-1 text-xs text-emerald-900/80">
              Sum of venue, gear, refreshment, and additional costs.
            </p>
            {playerCount > 0 ? (
              <p className="mt-4 border-t border-emerald-200/70 pt-4 text-sm text-emerald-900">
                <span className="font-semibold">{playerCount}</span> in split
                {' → '}
                <span className="font-bold tabular-nums">
                  {perHead !== null ? formatMoney(perHead) : '—'}
                </span>{' '}
                per player
              </p>
            ) : null}
          </FormSectionCard>

          <button
            type="submit"
            disabled={!canSubmit || busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3.5 text-sm font-semibold text-white shadow-md shadow-emerald-900/15 ring-1 ring-emerald-700/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
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
