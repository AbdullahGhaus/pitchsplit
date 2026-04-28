import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom'
import { PitchSplitWordmark } from './components/PitchSplitLogo'
import { ProtectedRoute } from './components/ProtectedRoute'
import { ToastContainer } from './components/ToastContainer'
import AdminDashboard from './pages/AdminDashboard'
import AdminLogin from './pages/AdminLogin'
import CreateMatch from './pages/CreateMatch'
import EditMatch from './pages/EditMatch'
import MatchAdmin from './pages/MatchAdmin'
import MatchPublic from './pages/MatchPublic'

function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 via-slate-50 to-slate-100 px-4 py-14">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-8 flex justify-center">
          <PitchSplitWordmark size="lg" iconClassName="h-12 w-12 sm:h-14 sm:w-14" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Split the pitch. Track the pot.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
          PitchSplit divides your match-day total across the squad in PKR. Share
          one link — everyone sees their share and can mark paid, no login on the
          player side.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm ring-1 ring-emerald-700/10 hover:bg-emerald-700 sm:w-auto"
            to="/login"
          >
            Admin login
          </Link>
          <p className="w-full text-sm text-slate-600 sm:w-auto">
            Players: open the link your admin shares (looks like{' '}
            <span className="font-mono text-xs text-slate-800">/match/&lt;id&gt;</span>
            ).
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-xl gap-4 text-left sm:grid-cols-3">
          {[
            ['Create a day', 'Set match date, total in PKR, and your squad.'],
            ['Share the link', 'Anyone with the URL can view the match.'],
            ['Track payments', 'Green for paid, red for unpaid — totals update instantly.'],
          ].map(([t, d]) => (
            <div
              key={t}
              className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70"
            >
              <p className="text-sm font-semibold text-slate-900">{t}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4">
      <p className="text-lg font-bold text-slate-900">Page not found</p>
      <Link className="mt-4 text-sm font-semibold text-emerald-800" to="/">
        Go home
      </Link>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastContainer />
      <Routes>
        {/*
          Public routes — no auth. Anyone with a URL can open these
          (especially /match/:id share links).
        */}
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<AdminLogin />} />
        <Route path="/match/:id" element={<MatchPublic />} />
        <Route path="/admin/login" element={<Navigate to="/login" replace />} />

        {/*
          Admin / dashboard — session required (see ProtectedRoute).
        */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/create"
          element={
            <ProtectedRoute>
              <CreateMatch />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/match/:id"
          element={
            <ProtectedRoute>
              <MatchAdmin />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/match/:id/edit"
          element={
            <ProtectedRoute>
              <EditMatch />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}
