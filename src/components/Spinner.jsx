export function Spinner({ className = '' }) {
  return (
    <span
      className={`inline-block size-5 animate-spin rounded-full border-2 border-slate-200 border-t-emerald-600 ${className}`}
      role="status"
      aria-label="Loading"
    />
  )
}
