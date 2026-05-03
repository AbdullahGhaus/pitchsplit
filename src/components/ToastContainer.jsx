import { useToastStore } from '../store/toastStore'

const styles = {
  success: 'bg-emerald-600 text-white ring-emerald-700/20',
  error: 'bg-rose-600 text-white ring-rose-700/20',
  info: 'bg-slate-900 text-white ring-slate-900/10',
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (!toasts.length) return null

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-stretch gap-2 px-3 pt-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:items-end sm:px-6 sm:pb-6"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto w-full max-w-md rounded-2xl px-4 py-3 text-left text-sm font-medium shadow-lg ring-1 ${styles[t.variant]}`}
        >
          {t.message}
        </button>
      ))}
    </div>
  )
}
