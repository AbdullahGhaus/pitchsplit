import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { PitchSplitWordmark } from '../components/PitchSplitLogo'
import {
  archiveMatch,
  deleteMatch,
  duplicateMatch,
  listMatches,
  restoreMatch,
  getMatch,
} from '../services/supabase'
import { formatMoney } from '../utils/money'
import { formatMatchDateShort } from '../utils/date'
import { copyToClipboard } from '../utils/clipboard'
import {
  downloadMatchDetailPdf,
  downloadMonthMatchesPdf,
} from '../utils/pitchsplitPdf'
import { useToastStore } from '../store/toastStore'
import { useAuthStore } from '../store/authStore'
import { Spinner } from '../components/Spinner'

const PAGE_SIZE = 12

function publicMatchUrl(id) {
  return `${window.location.origin}/match/${id}`
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10)
}

function currentMonthYYYYMM() {
  return new Date().toISOString().slice(0, 7)
}

/** Monetary collection % (paid_count × per_head vs total_amount). */
function pctMoneyCollected(m) {
  const total = Number(m.total_amount)
  const perHead = Number(m.per_head)
  const nPaid = Number(m.paid_count) || 0
  const nPlayers = Number(m.player_count) || 0
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    nPlayers === 0 ||
    !Number.isFinite(perHead)
  ) {
    return 0
  }
  const collected = nPaid * perHead
  return Math.min(100, (collected / total) * 100)
}

function progressBarAccent(pct) {
  if (pct >= 100) return 'from-emerald-600 to-teal-500'
  if (pct >= 70) return 'from-emerald-500 to-emerald-600'
  if (pct >= 35) return 'from-amber-500 to-amber-600'
  return 'from-rose-500 to-rose-600'
}

function CollectionBar({ pct }) {
  const w = Math.min(100, Math.max(0, pct))
  const accent = progressBarAccent(w)
  return (
    <div className="flex min-w-[120px] flex-col gap-1">
      <div className="h-2 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${accent}`}
          style={{ width: `${w}%`, transition: 'width 200ms ease' }}
        />
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-slate-700">
        {w.toFixed(1)}%
      </span>
    </div>
  )
}

function FilterFunnelIcon({ filtered }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={`size-3.5 shrink-0 ${filtered ? 'text-emerald-600' : 'text-slate-400'}`}
    >
      <path d="M1 2h14L9 8.5V14H7V8.5z" />
    </svg>
  )
}

/** Funnel-only header control; filter fields render in dock above the table. */
function ColumnHeaderFilterTrigger({
  panelKey,
  openPanelKey,
  setOpenPanelKey,
  columnTitle,
  filtered,
}) {
  const open = openPanelKey === panelKey
  return (
    <div className="flex items-center gap-1">
      <span className="font-semibold text-slate-700">{columnTitle}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpenPanelKey(open ? null : panelKey)
        }}
        className={`rounded p-0.5 outline-none transition hover:bg-slate-200/90 focus-visible:ring-2 focus-visible:ring-emerald-600/40 ${open ? 'bg-slate-200' : ''}`}
        aria-expanded={open}
        aria-controls="match-table-filter-dock"
        aria-label={`Filter · ${columnTitle}`}
      >
        <FilterFunnelIcon filtered={filtered} />
      </button>
    </div>
  )
}

/**
 * Full-width bar above thead — avoids overlays / inner scroll quirks on tbody.
 */
function TableFiltersDock({
  panel,
  onClose,
  tableMatchDate,
  setTableMatchDate,
  tablePaidBy,
  setTablePaidBy,
  unpaidOnly,
  setUnpaidOnly,
  showArchived,
  setShowArchived,
}) {
  if (!panel) return null

  function resetActive() {
    if (panel === 'date') setTableMatchDate('')
    else if (panel === 'paidBy') setTablePaidBy('')
    else {
      setUnpaidOnly(false)
      setShowArchived(false)
    }
  }

  return (
    <div
      id="match-table-filter-dock"
      className="border-b border-emerald-200 bg-emerald-50/60 px-4 py-3"
      role="region"
      aria-label="Active column filter"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          {panel === 'date' ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                Match date · exact
              </p>
              <input
                type="date"
                className="w-full max-w-xs rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm tabular-nums outline-none shadow-sm focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                value={tableMatchDate}
                onChange={(e) => setTableMatchDate(e.target.value)}
                aria-label="Filter by exact match date"
              />
            </>
          ) : null}
          {panel === 'paidBy' ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                Paid by · contains
              </p>
              <input
                type="text"
                placeholder="Substring in payer column…"
                className="w-full max-w-md rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                value={tablePaidBy}
                onChange={(e) => setTablePaidBy(e.target.value)}
                aria-label="Filter paid-by column"
              />
            </>
          ) : null}
          {panel === 'actions' ? (
            <>
              <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-900">
                List & visibility
              </p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    checked={unpaidOnly}
                    onChange={(e) => setUnpaidOnly(e.target.checked)}
                  />
                  Only matches with unpaid players
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                  />
                  Load archived rows from server
                </label>
              </div>
            </>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            onClick={resetActive}
          >
            Reset
          </button>
          <button
            type="button"
            className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  )
}

/** @param {any} match */
function passesMatchFilters(
  match,
  { paidBySnippet, unpaidOnly, matchDate },
) {
  if (unpaidOnly) {
    const pc = Number(match.player_count) || 0
    const paid = Number(match.paid_count) || 0
    if (pc === 0 || paid >= pc) return false
  }

  const dStr = match.match_date
    ? String(match.match_date).slice(0, 10)
    : ''

  if (matchDate) {
    if (!dStr || dStr !== matchDate) return false
  }

  const pb =
    match.paid_by != null ? String(match.paid_by).trim().toLowerCase() : ''
  const pi = paidBySnippet.trim().toLowerCase()
  if (pi && !pb.includes(pi)) return false

  return true
}

/**
 * Filters loaded matches for month PDF only (independent of table filters).
 * @param {any} match
 * @param {{ monthYYYYMM: string, paidBySnippet: string }} opts
 */
function passesPdfMonthFilters(match, { monthYYYYMM, paidBySnippet }) {
  const dStr = match.match_date ? String(match.match_date).slice(0, 10) : ''
  if (!dStr || !monthYYYYMM) return false
  if (!dStr.startsWith(monthYYYYMM)) return false

  const pb =
    match.paid_by != null ? String(match.paid_by).trim().toLowerCase() : ''
  const pi = paidBySnippet.trim().toLowerCase()
  if (pi && !pb.includes(pi)) return false

  return true
}

async function exportOneMatchPdf(toast, matchId, shortHeading) {
  try {
    const data = await getMatch(matchId)
    if (!data?.match) {
      toast('Could not load match.', 'error')
      return
    }
    downloadMatchDetailPdf(data)
    toast(`PDF downloaded — ${shortHeading}`, 'success')
  } catch (e) {
    toast(e instanceof Error ? e.message : 'Could not build PDF.', 'error')
  }
}

export default function AdminDashboard() {
  const logout = useAuthStore((s) => s.logout)
  const admin = useAuthStore((s) => s.admin)
  const show = useToastStore((s) => s.show)

  const [matches, setMatches] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [showArchived, setShowArchived] = useState(false)

  const [tablePaidBy, setTablePaidBy] = useState('')
  const [tableMatchDate, setTableMatchDate] = useState('')
  const [unpaidOnly, setUnpaidOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [tableFilterPanel, setTableFilterPanel] = useState(
    /** @type {null | 'date' | 'paidBy' | 'actions'} */ (null),
  )

  const [pdfMonth, setPdfMonth] = useState(currentMonthYYYYMM())
  const [pdfPaidBy, setPdfPaidBy] = useState('')
  const [pdfModalOpen, setPdfModalOpen] = useState(false)
  const pdfModalMonthRef = useRef(null)

  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [duplicateSourceId, setDuplicateSourceId] = useState('')
  const [duplicateDate, setDuplicateDate] = useState(todayISODate())
  const dupFirstField = useRef(null)

  const loadMatches = useCallback(async () => {
    setError(null)
    const rows = await listMatches({ includeArchived: showArchived })
    setMatches(rows)
  }, [showArchived])

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        try {
          await loadMatches()
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : 'Could not load matches.')
          }
        }
      })()
    return () => {
      cancelled = true
    }
  }, [loadMatches])

  const tableFilterState = useMemo(
    () => ({
      paidBySnippet: tablePaidBy,
      unpaidOnly,
      matchDate: tableMatchDate.trim(),
    }),
    [tablePaidBy, unpaidOnly, tableMatchDate],
  )

  const filtered = useMemo(() => {
    if (!matches) return []
    return matches.filter((m) => passesMatchFilters(m, tableFilterState))
  }, [matches, tableFilterState])

  useEffect(() => {
    setPage(1)
  }, [matches, tablePaidBy, tableMatchDate, unpaidOnly, showArchived])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)

  useEffect(() => {
    if (page !== safePage) setPage(safePage)
  }, [page, safePage])

  const pageSlice = useMemo(() => {
    const p = Math.max(1, safePage)
    const start = (p - 1) * PAGE_SIZE
    return filtered.slice(start, start + PAGE_SIZE)
  }, [filtered, safePage])

  useEffect(() => {
    if (duplicateOpen) {
      setTimeout(() => dupFirstField.current?.focus(), 50)
    }
  }, [duplicateOpen])

  useEffect(() => {
    if (pdfModalOpen) {
      setTimeout(() => pdfModalMonthRef.current?.focus(), 50)
    }
  }, [pdfModalOpen])

  async function openDuplicateModal(matchId) {
    setDuplicateSourceId(matchId)
    setDuplicateDate(todayISODate())
    setDuplicateOpen(true)
  }

  async function confirmDuplicate() {
    if (!duplicateSourceId) return
    setBusyId(duplicateSourceId)
    try {
      await duplicateMatch(duplicateSourceId, duplicateDate)
      show('Duplicate match created.', 'success')
      setDuplicateOpen(false)
      await loadMatches()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not duplicate.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function duplicateLatestActive() {
    const src = matches?.find((m) => !m.archived) || matches?.[0]
    if (!src?.id) {
      show('No match to duplicate.', 'error')
      return
    }
    await openDuplicateModal(src.id)
  }

  async function onArchive(id) {
    if (!window.confirm('Archive this match? It will move out of the main list unless you choose “Show archived”. Public links still work.')) {
      return
    }
    setBusyId(id)
    try {
      await archiveMatch(id)
      show('Match archived.', 'success')
      await loadMatches()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not archive.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function onRestore(id) {
    setBusyId(id)
    try {
      await restoreMatch(id)
      show('Match restored.', 'success')
      await loadMatches()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not restore.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function onDeletePermanent(id) {
    if (
      !window.confirm(
        'Permanently delete this match and all player rows? This cannot be undone.',
      )
    ) {
      return
    }
    setBusyId(id)
    try {
      await deleteMatch(id)
      show('Match deleted permanently.', 'success')
      await loadMatches()
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not delete.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function copyLink(id) {
    const ok = await copyToClipboard(publicMatchUrl(id))
    show(
      ok ? 'Public link copied.' : 'Could not copy link.',
      ok ? 'success' : 'error',
    )
  }

  function exportPdfFromModal() {
    if (!matches?.length) {
      show('No matches loaded.', 'error')
      return
    }
    const pdfState = {
      monthYYYYMM: pdfMonth,
      paidBySnippet: pdfPaidBy,
    }
    const inMonth = matches.filter((m) => passesPdfMonthFilters(m, pdfState))
    if (inMonth.length === 0) {
      show(
        'No matches for this PDF — try another month or clear Paid by.',
        'error',
      )
      return
    }
    try {
      downloadMonthMatchesPdf(inMonth, pdfMonth)
      show(`PDF downloaded (${inMonth.length} match(es)).`, 'success')
      setPdfModalOpen(false)
    } catch (e) {
      show(
        e instanceof Error ? e.message : 'Could not build month PDF.',
        'error',
      )
    }
  }

  async function exportRowPdf(match) {
    setBusyId(match.id)
    try {
      await exportOneMatchPdf(
        show,
        match.id,
        formatMatchDateShort(match.match_date),
      )
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <Link
              to="/admin"
              className="shrink-0 rounded-lg outline-none ring-emerald-600/0 focus-visible:ring-2 focus-visible:ring-emerald-600/40"
            >
              <PitchSplitWordmark size="sm" iconClassName="h-9 w-9" />
            </Link>
            {admin?.username && (
              <div className="hidden min-w-0 text-left sm:block">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  Signed in
                </p>
                <p className="truncate text-sm font-semibold text-slate-800">
                  {admin.username}
                </p>
              </div>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Link
              to="/admin/admins"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Admins & payments
            </Link>
            <Link
              to="/admin/squad-defaults"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Squad defaults
            </Link>
            <Link
              to="/"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Home
            </Link>
            <button
              type="button"
              onClick={() => {
                logout()
                show('Signed out.', 'info')
              }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Matches
            </h1>
            {/* <p className="mt-1 text-sm text-slate-600">
              Amounts in PKR. Collection % uses paid players × share vs total.
            </p> */}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busyId !== null || !matches?.length}
              onClick={duplicateLatestActive}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Duplicate latest match
            </button>
            <button
              type="button"
              disabled={!matches?.length}
              onClick={() => setPdfModalOpen(true)}
              className="inline-flex items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-semibold text-indigo-900 shadow-sm hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Download PDF
            </button>
            <Link
              to="/admin/create"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
            >
              Create new match
            </Link>
          </div>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {duplicateOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dup-title"
            onClick={(ev) =>
              ev.target === ev.currentTarget && setDuplicateOpen(false)
            }
          >
            <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
              <h2 id="dup-title" className="text-lg font-bold text-slate-900">
                Duplicate match
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                New match gets the same costs and squad; all payments start unpaid.
              </p>
              <label className="mt-4 block text-sm font-medium text-slate-700">
                New match date
                <input
                  ref={dupFirstField}
                  type="date"
                  value={duplicateDate}
                  onChange={(e) => setDuplicateDate(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </label>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDuplicateOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    busyId === duplicateSourceId || !duplicateDate.trim()
                  }
                  onClick={confirmDuplicate}
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {busyId === duplicateSourceId ? 'Creating…' : 'Create duplicate'}
                </button>
              </div>
            </div>
          </div>
        )}

        {pdfModalOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pdf-modal-title"
            onClick={(ev) =>
              ev.target === ev.currentTarget && setPdfModalOpen(false)
            }
          >
            <div
              className="w-full max-w-md rounded-2xl border border-indigo-200 bg-white p-6 shadow-xl"
              onClick={(ev) => ev.stopPropagation()}
            >
              <h2
                id="pdf-modal-title"
                className="text-lg font-bold text-slate-900"
              >
                Download PDF
              </h2>
              {/* <p className="mt-2 text-sm text-slate-600">
                Builds a landscape summary from matches already loaded in this page
                (same data as your table list). Filters here do not affect the table.
              </p> */}
              <label className="mt-5 block text-sm font-medium text-slate-700">
                Month <span className="font-normal text-slate-500">(calendar)</span>
                <input
                  ref={pdfModalMonthRef}
                  type="month"
                  value={pdfMonth}
                  onChange={(e) => setPdfMonth(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </label>
              <label className="mt-4 block text-sm font-medium text-slate-700">
                Paid by contains
                <input
                  type="text"
                  placeholder="Optional — filter payer column"
                  className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  value={pdfPaidBy}
                  onChange={(e) => setPdfPaidBy(e.target.value)}
                />
              </label>
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPdfModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!pdfMonth.trim() || !matches?.length}
                  onClick={() => exportPdfFromModal()}
                  className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        )}

        {matches === null && (
          <div className="mt-10 flex items-center justify-center gap-3 text-sm text-slate-600">
            <Spinner />
            Loading matches…
          </div>
        )}

        {matches && matches.length === 0 && !error && (
          <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <p className="text-sm font-semibold text-slate-900">No matches yet</p>
            <p className="mt-2 text-sm text-slate-600">
              Create a match day to generate a shareable payment link.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                to="/admin/create"
                className="inline-flex rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
              >
                Create new match
              </Link>
              <Link
                to="/admin/admins"
                className="inline-flex rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Admins & payments
              </Link>
              <Link
                to="/admin/squad-defaults"
                className="inline-flex rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
              >
                Squad defaults
              </Link>
            </div>
          </div>
        )}

        {matches && matches.length > 0 && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* <div className="border-b border-slate-200 bg-slate-50/90 px-4 py-2.5">
              <p className="text-[11px] leading-snug text-slate-600">
                <span className="font-semibold text-slate-700">Filters</span>
                {' — '}
                click a funnel icon; options appear in the{' '}
                <span className="font-medium text-emerald-800">
                  highlighted bar directly above the data rows
                </span>{' '}
                (not over the grid, so scrolling stays predictable).
              </p>
            </div> */}

            <TableFiltersDock
              panel={tableFilterPanel}
              onClose={() => setTableFilterPanel(null)}
              tableMatchDate={tableMatchDate}
              setTableMatchDate={setTableMatchDate}
              tablePaidBy={tablePaidBy}
              setTablePaidBy={setTablePaidBy}
              unpaidOnly={unpaidOnly}
              setUnpaidOnly={setUnpaidOnly}
              showArchived={showArchived}
              setShowArchived={setShowArchived}
            />

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/95">
                    <th className="min-w-[8.5rem] px-3 py-2 align-bottom whitespace-nowrap text-left text-xs">
                      <ColumnHeaderFilterTrigger
                        panelKey="date"
                        openPanelKey={tableFilterPanel}
                        setOpenPanelKey={setTableFilterPanel}
                        columnTitle="Match date"
                        filtered={Boolean(tableMatchDate.trim())}
                      />
                    </th>
                    <th className="max-w-[8rem] min-w-[7rem] px-3 py-2 align-bottom text-left text-xs">
                      <ColumnHeaderFilterTrigger
                        panelKey="paidBy"
                        openPanelKey={tableFilterPanel}
                        setOpenPanelKey={setTableFilterPanel}
                        columnTitle="Paid by"
                        filtered={Boolean(tablePaidBy.trim())}
                      />
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 pb-3 align-bottom text-xs font-semibold text-slate-700">
                      Total
                    </th>
                    <th className="whitespace-nowrap px-3 py-3 pb-3 align-bottom text-xs font-semibold text-slate-700">
                      Per head
                    </th>
                    <th className="min-w-[9rem] whitespace-nowrap px-3 py-3 pb-3 align-bottom text-xs font-semibold text-slate-700">
                      Paid
                    </th>
                    <th className="min-w-[140px] whitespace-nowrap px-3 py-3 pb-3 align-bottom text-xs font-semibold text-slate-700">
                      Collected
                    </th>
                    <th className="min-w-[11rem] px-3 py-2 align-bottom text-left text-xs">
                      <ColumnHeaderFilterTrigger
                        panelKey="actions"
                        openPanelKey={tableFilterPanel}
                        setOpenPanelKey={setTableFilterPanel}
                        columnTitle="Actions"
                        filtered={
                          Boolean(unpaidOnly) || Boolean(showArchived)
                        }
                      />
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="bg-amber-50/40 px-5 py-10 text-center text-sm text-slate-700"
                      >
                        <p className="font-medium text-amber-950">
                          No rows match these filters.
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          Open the green filter bar via a funnel, then Reset /
                          widen criteria, or turn off “Only unpaid”.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((m) => {
                        const pct = pctMoneyCollected(m)
                        const archived = Boolean(m.archived)
                        const paidN = Number(m.paid_count) || 0
                        const playerN = Number(m.player_count) || 0
                        return (
                          <tr
                            key={m.id}
                            className={`hover:bg-slate-50/80 ${archived ? 'opacity-70' : ''}`}
                          >
                            <td className="whitespace-nowrap px-3 py-3 font-medium text-slate-900">
                              <span className="flex flex-wrap items-center gap-2">
                                {formatMatchDateShort(m.match_date)}
                                {archived && (
                                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-700">
                                    Archived
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="max-w-[10rem] truncate px-3 py-3 text-slate-800">
                              {m.paid_by != null && String(m.paid_by).trim() !== ''
                                ? String(m.paid_by).trim()
                                : '—'}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 tabular-nums text-slate-800">
                              {formatMoney(m.total_amount)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 tabular-nums text-emerald-900">
                              {formatMoney(m.per_head)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 align-top">
                              <span className="inline-flex flex-wrap items-center gap-1.5">
                                <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-900 ring-1 ring-slate-200/90">
                                  {paidN}
                                  <span className="font-semibold text-slate-400">
                                    {' / '}
                                    {playerN}
                                  </span>
                                </span>
                                {Boolean(m.payments_locked) && paidN > 0 && paidN === playerN && (
                                  <span
                                    className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900 ring-1 ring-emerald-200/80"
                                    title="Public payment edits are locked — all players paid"
                                  >
                                    Locked
                                  </span>
                                )}
                              </span>
                            </td>
                            <td className="max-w-[10rem] px-3 py-3 align-middle">
                              <CollectionBar pct={pct} />
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex flex-wrap gap-2">
                                <Link
                                  className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                                  to={`/admin/match/${m.id}`}
                                >
                                  Details
                                </Link>
                                <Link
                                  className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                                  to={`/admin/match/${m.id}/edit`}
                                >
                                  Edit
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => openDuplicateModal(m.id)}
                                  disabled={busyId === m.id}
                                  className="inline-flex rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1.5 text-xs font-semibold text-indigo-900 hover:bg-indigo-100 disabled:opacity-60"
                                >
                                  Duplicate
                                </button>
                                {!archived && (
                                  <button
                                    type="button"
                                    onClick={() => onArchive(m.id)}
                                    disabled={busyId === m.id}
                                    className="inline-flex rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                                  >
                                    Archive
                                  </button>
                                )}
                                {archived && (
                                  <button
                                    type="button"
                                    onClick={() => onRestore(m.id)}
                                    disabled={busyId === m.id}
                                    className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-60"
                                  >
                                    Restore
                                  </button>
                                )}
                                {archived && (
                                  <button
                                    type="button"
                                    onClick={() => onDeletePermanent(m.id)}
                                    disabled={busyId === m.id}
                                    className="inline-flex rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                                  >
                                    Delete
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => copyLink(m.id)}
                                  className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100"
                                >
                                  Copy link
                                </button>
                                <button
                                  type="button"
                                  onClick={() => exportRowPdf(m)}
                                  disabled={busyId === m.id}
                                  className="inline-flex rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                                >
                                  PDF
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                  )}
                </tbody>
              </table>
            </div>
            {filtered.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-500">
                <p>
                  Page {safePage} / {totalPages} · Showing{' '}
                  {pageSlice.length} of {filtered.length} filtered (
                  {matches?.length ?? 0} loaded)
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() =>
                      setPage((p) => Math.min(totalPages, p + 1))
                    }
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>

              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  )
}
