import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PitchSplitWordmark } from '../components/PitchSplitLogo'
import {
  deleteDefaultPlayer,
  insertDefaultPlayer,
  listDefaultPlayersWithOrder,
  reorderDefaultPlayers,
  renameDefaultPlayer,
} from '../services/supabase'
import { useToastStore } from '../store/toastStore'
import { Spinner } from '../components/Spinner'

export default function SquadDefaults() {
  const show = useToastStore((s) => s.show)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const data = await listDefaultPlayersWithOrder()
    setRows(data)
  }, [])

  useEffect(() => {
    let cancelled = false
      ; (async () => {
        try {
          setLoading(true)
          await load()
        } catch (e) {
          if (!cancelled) {
            show(
              e instanceof Error ? e.message : 'Could not load squad defaults.',
              'error',
            )
          }
        } finally {
          if (!cancelled) setLoading(false)
        }
      })()
    return () => {
      cancelled = true
    }
  }, [load, show])

  function allowDrop(e) {
    e.preventDefault()
  }

  async function applyReorder(fromIdx, dropIndex) {
    if (fromIdx === dropIndex) return
    const next = [...rows]
    const [removed] = next.splice(fromIdx, 1)
    next.splice(dropIndex, 0, removed)
    try {
      setBusy(true)
      await reorderDefaultPlayers(next.map((r) => r.id))
      setRows(next)
      show('Order saved.', 'success')
    } catch (e) {
      show(e instanceof Error ? e.message : 'Could not reorder.', 'error')
      await load()
    } finally {
      setBusy(false)
    }
  }

  function onDragStartIndex(e, index) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }

  async function onRowDrop(e, dropIndex) {
    e.preventDefault()
    const fromIdx = Number(e.dataTransfer.getData('text/plain'))
    if (!Number.isFinite(fromIdx)) return
    await applyReorder(fromIdx, dropIndex)
  }

  async function onAdd(e) {
    e.preventDefault()
    const trimmed = newName.trim()
    if (!trimmed) return
    try {
      setBusy(true)
      await insertDefaultPlayer(trimmed)
      setNewName('')
      await load()
      show('Player added.', 'success')
    } catch (err) {
      show(
        err instanceof Error ? err.message : 'Could not add player.',
        'error',
      )
    } finally {
      setBusy(false)
    }
  }

  async function onRename(id, name) {
    try {
      setBusy(true)
      await renameDefaultPlayer(id, name)
      await load()
      show('Updated.', 'success')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not rename.', 'error')
      await load()
    } finally {
      setBusy(false)
    }
  }

  async function onRemove(id) {
    if (!window.confirm('Remove this player from default squad for new matches?')) {
      return
    }
    try {
      setBusy(true)
      await deleteDefaultPlayer(id)
      await load()
      show('Removed.', 'success')
    } catch (err) {
      show(err instanceof Error ? err.message : 'Could not remove.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[100dvh] bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-3 py-3 sm:gap-4 sm:px-4 sm:py-4">
          <Link to="/admin" className="shrink-0">
            <PitchSplitWordmark size="sm" iconClassName="h-9 w-9" />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/admin/admins"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Admins & payments
            </Link>
            <Link
              to="/admin"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 py-6 sm:px-4 sm:py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Squad defaults
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Order is used when creating a match — drag rows to reorder. Names are
            unique.
          </p>
        </div>

        <form
          onSubmit={onAdd}
          className="mb-8 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-end"
        >
          <label className="block min-w-0 flex-1 text-sm font-medium text-slate-800">
            New player
            <input
              type="text"
              className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
              placeholder="Full name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Add to defaults
          </button>
        </form>

        {loading ? (
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <Spinner />
            Loading…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm text-amber-950">
            No default players yet. Add names above — they appear on new match
            forms in this order.
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <EditableRow
                key={row.id}
                row={row}
                index={index}
                busy={busy}
                onHandleDragStart={(e) => onDragStartIndex(e, index)}
                onDragOver={allowDrop}
                onDrop={(e) => onRowDrop(e, index)}
                onRename={(name) => onRename(row.id, name)}
                onRemove={() => onRemove(row.id)}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}

function EditableRow({
  row,
  index,
  busy,
  onHandleDragStart,
  onDragOver,
  onDrop,
  onRename,
  onRemove,
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.name)

  useEffect(() => {
    setDraft(row.name)
  }, [row.name])

  function save() {
    const t = draft.trim()
    if (!t || t === row.name) {
      setEditing(false)
      setDraft(row.name)
      return
    }
    setEditing(false)
    onRename(t)
  }

  return (
    <li
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm"
    >
      <span
        draggable={!busy}
        onDragStart={onHandleDragStart}
        role="presentation"
        className="cursor-grab select-none text-slate-400 active:cursor-grabbing"
        title="Drag to reorder"
      >
        ⋮⋮
      </span>
      <span className="w-8 shrink-0 text-center text-xs font-semibold text-slate-400">
        {index + 1}
      </span>
      <div className="min-w-0 flex-1">
        {editing ? (
          <input
            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm font-medium outline-none focus:border-emerald-500"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') {
                setDraft(row.name)
                setEditing(false)
              }
            }}
            disabled={busy}
            autoFocus
          />
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditing(true)}
            className="w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium text-slate-900 hover:bg-slate-50"
          >
            {row.name}
          </button>
        )}
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => setEditing(true)}
        className="shrink-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
      >
        Rename
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        className="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-800 hover:bg-rose-100"
      >
        Remove
      </button>
    </li>
  )
}
