-- Existing projects: run in Supabase SQL Editor after baseline schema.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_matches_archived ON public.matches (archived);

ALTER TABLE public.default_players
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name ASC) - 1 AS rn
  FROM public.default_players
)
UPDATE public.default_players d
SET sort_order = ranked.rn
FROM ranked
WHERE d.id = ranked.id;
