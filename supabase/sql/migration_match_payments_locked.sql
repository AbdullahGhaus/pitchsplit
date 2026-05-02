-- When every player has_paid=true, payments_locked=true (public edits frozen).
-- Admins UPDATE matches SET payments_locked = false to allow corrections.
-- Applies to matches with at least one player; empty squads stay unlocked.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS payments_locked boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.matches.payments_locked IS
  'True: block has_paid changes on squad rows until organiser clears. Synced automatically when roster/payments change; admins may unlock.';

CREATE OR REPLACE FUNCTION public.refresh_match_payment_lock(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n_total integer;
  n_unpaid integer;
BEGIN
  SELECT
    COUNT(*)::integer,
    COUNT(*) FILTER (
      WHERE NOT COALESCE(has_paid, false)
    )::integer
  INTO n_total, n_unpaid
  FROM public.players
  WHERE match_id = p_match_id;

  IF n_total = 0 THEN
    UPDATE public.matches
    SET payments_locked = false
    WHERE id = p_match_id;
    RETURN;
  END IF;

  IF n_unpaid = 0 THEN
    UPDATE public.matches
    SET payments_locked = true
    WHERE id = p_match_id;
  ELSE
    UPDATE public.matches
    SET payments_locked = false
    WHERE id = p_match_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.refresh_match_payment_lock(uuid) IS
  'Keeps matches.payments_locked in sync with whether any player still owes.';

CREATE OR REPLACE FUNCTION public.trg_players_after_payment_touch()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mid uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    mid := OLD.match_id;
  ELSE
    mid := NEW.match_id;
  END IF;
  PERFORM public.refresh_match_payment_lock(mid);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS players_refresh_payment_lock_insert ON public.players;
CREATE TRIGGER players_refresh_payment_lock_insert
  AFTER INSERT ON public.players
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_players_after_payment_touch();

DROP TRIGGER IF EXISTS players_refresh_payment_lock_upd_del ON public.players;
CREATE TRIGGER players_refresh_payment_lock_upd_del
  AFTER UPDATE OF has_paid OR DELETE ON public.players
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_players_after_payment_touch();

CREATE OR REPLACE FUNCTION public.trg_players_block_payment_if_match_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  locked boolean;
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;
  IF NEW.has_paid IS NOT DISTINCT FROM OLD.has_paid THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(m.payments_locked, false)
  INTO locked
  FROM public.matches m
  WHERE m.id = NEW.match_id;
  IF locked THEN
    RAISE EXCEPTION
      USING MESSAGE = 'Payment updates are locked for this match. Ask the organiser to unlock.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS players_block_locked_payment_updates ON public.players;
CREATE TRIGGER players_block_locked_payment_updates
  BEFORE UPDATE OF has_paid ON public.players
  FOR EACH ROW
  EXECUTE PROCEDURE public.trg_players_block_payment_if_match_locked();

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.matches LOOP
    PERFORM public.refresh_match_payment_lock(r.id);
  END LOOP;
END $$;
