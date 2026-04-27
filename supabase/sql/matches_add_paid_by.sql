-- Optional: add if your `matches` table predates the app field.
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS paid_by text;

COMMENT ON COLUMN public.matches.paid_by IS 'Who paid upfront / organiser label (free text).';
