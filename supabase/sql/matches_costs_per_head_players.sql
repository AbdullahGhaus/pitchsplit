-- PitchSplit — extend `public.matches` with cost breakdown (JSON), per-head, and squad name snapshot.
-- Run in Supabase SQL Editor after your base schema exists.
-- Keeps `total_amount` (grand total) for existing queries; `costs` holds the full breakdown including the same total.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS costs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS per_head numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS players jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.matches.costs IS
  'Breakdown: venue_cost, gear_cost, refreshment_cost, additional_cost, total_amount (all PKR numbers).';
COMMENT ON COLUMN public.matches.per_head IS
  'Share per player at creation time (total_amount / headcount).';
COMMENT ON COLUMN public.matches.players IS
  'Ordered JSON array of player names as created for this match (snapshot for history).';

-- Backfill existing rows (before app sent structured costs)
UPDATE public.matches AS m
SET
  costs = jsonb_build_object(
    'venue_cost', 0,
    'gear_cost', 0,
    'refreshment_cost', 0,
    'additional_cost', 0,
    'total_amount', m.total_amount
  ),
  players = COALESCE(
    (
      SELECT jsonb_agg(p.name ORDER BY p.name)
      FROM public.players AS p
      WHERE p.match_id = m.id
    ),
    '[]'::jsonb
  ),
  per_head = COALESCE(
    (
      SELECT
        CASE
          WHEN COUNT(*) > 0 THEN m.total_amount / COUNT(*)::numeric
          ELSE 0::numeric
        END
      FROM public.players AS p
      WHERE p.match_id = m.id
    ),
    0::numeric
  )
WHERE m.costs = '{}'::jsonb
  AND m.players = '[]'::jsonb;

-- Optional: enforce shape for new rows (recommended)
ALTER TABLE public.matches
  ALTER COLUMN costs SET DEFAULT '{"venue_cost":0,"gear_cost":0,"refreshment_cost":0,"additional_cost":0,"total_amount":0}'::jsonb;
