# PitchSplit

PitchSplit is a React + Vite app for organizing cricket match expenses in PKR.
Admins can create matches, split total costs across players, and share a public
match link where players can view payment status.

## Features

- Admin login with Supabase-backed credential check (`login_admin` RPC)
- Create matches with detailed cost breakdown:
  - venue
  - gear
  - refreshments
  - additional costs
- Automatic per-head split based on included players
- Track paid/unpaid status per player
- Public share link for each match (`/match/:id`)
- Admin dashboard to manage matches

## Tech Stack

- React 19
- Vite 8
- React Router
- Zustand
- Supabase (Postgres + RPC)
- Tailwind CSS 4

## Project Structure

```text
src/
  components/        # UI components (toasts, guards, logo, etc.)
  pages/             # Route screens (login, dashboard, match views)
  services/          # Supabase data/auth services
  lib/               # Shared Supabase client
  store/             # Zustand auth + toast stores
supabase/sql/        # SQL schema and migrations for Supabase
.github/workflows/   # GitHub Actions workflows
```

## Prerequisites

- Node.js 20+ (recommended)
- npm
- A Supabase project

## Local Setup

1. Clone the repo.
2. Install dependencies:

```bash
npm install
```

3. Create your env file from example:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

4. Set environment variables in `.env`:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

`VITE_SUPABASE_ANON_KEY` is also supported for compatibility.

5. Run the app:

```bash
npm run dev
```

## Supabase Setup

Run these SQL files in your Supabase SQL Editor:

1. `supabase/sql/schema.sql`
2. `supabase/sql/admins.sql`
3. `supabase/sql/matches_add_paid_by.sql` (if your table was created before this field existed)
4. `supabase/sql/matches_costs_per_head_players.sql` (if your table was created before these fields existed)

Then seed required data:

- Add default squad entries in `default_players`
- Add at least one admin in `admins` using bcrypt hash (examples are in `admins.sql`)

## Auth Notes

- Admin login calls the Supabase RPC `login_admin(username, password)`.
- If Supabase env vars are missing in local development, the app allows a local fallback:
  - username: `admin`
  - password: `admin`
- Do not rely on fallback credentials in production.

## Available Scripts

- `npm run dev` - start dev server
- `npm run build` - production build
- `npm run preview` - preview production build locally

## Deployment

This is a Vite SPA, so deploy the `dist` output to any static host (Vercel, Netlify, Cloudflare Pages, etc.) after:

```bash
npm run build
```

The repo includes `public/_redirects` for SPA route handling on compatible hosts.

## GitHub Workflow

`.github/workflows/keep-supabase-alive.yml` pings Supabase on a schedule to help keep free-tier projects awake.  
Set repository secret:

- `SUPABASE_ANON_KEY`

## Security

- Never commit real secrets in `.env`.
- Keep `.env` local; commit only `.env.example`.
- Restrict and rotate Supabase keys when needed.

## License

Add your preferred license (for example MIT) in a `LICENSE` file.
