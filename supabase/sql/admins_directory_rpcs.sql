-- Admins payment directory: read / update-only payment_method JSONB ({ bank, account_number }).
-- Run in Supabase SQL Editor after admins.sql.
-- Anonymous clients can call these (SECURITY DEFINER); protect your anon key — admin UI routes are gated in the app only.

DROP FUNCTION IF EXISTS public.admin_list_directory(text, text);
DROP FUNCTION IF EXISTS public.admin_update_admin_profile(text, text, uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.admin_create_admin(text, text, text, text, text, jsonb);

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS display_name text;

ALTER TABLE public.admins
  ADD COLUMN IF NOT EXISTS payment_method jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.admins.payment_method IS
  'JSON for admin UI; keys: bank (text), account_number (text).';

COMMENT ON COLUMN public.admins.display_name IS 'Optional label (read-only in payment settings UI).';

-- List admins with usernames + payment_method (password_hash excluded).
CREATE OR REPLACE FUNCTION public.admin_list_payment_directory()
RETURNS TABLE (
  id uuid,
  admin_username text,
  admin_display_name text,
  payment_method jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id,
    a.username::text,
    NULLIF(btrim(COALESCE(a.display_name::text, '')), '')::text,
    COALESCE(a.payment_method, '{}'::jsonb)
  FROM public.admins AS a
  ORDER BY a.username;
$$;

ALTER FUNCTION public.admin_list_payment_directory() SET row_security = off;

-- Update only payment_method for one admin row.
CREATE OR REPLACE FUNCTION public.admin_update_payment_method(
  p_target_id uuid,
  p_payment_method jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  UPDATE public.admins
  SET
    payment_method = COALESCE(p_payment_method, '{}'::jsonb),
    updated_at = now()
  WHERE id = p_target_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'Admin not found';
  END IF;
END;
$$;

ALTER FUNCTION public.admin_update_payment_method(uuid, jsonb) SET row_security = off;

-- Resolve one admin row’s payment_method for public match pages (matches paid_by string).
CREATE OR REPLACE FUNCTION public.admin_payment_method_for_paid_by(p_label text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COALESCE(a.payment_method, '{}'::jsonb)
    FROM public.admins AS a
    WHERE btrim(p_label) <> ''
      AND (
        lower(a.username) = lower(btrim(p_label))
        OR (
          a.display_name IS NOT NULL
          AND lower(btrim(a.display_name::text)) = lower(btrim(p_label))
        )
      )
    LIMIT 1
  );
$$;

ALTER FUNCTION public.admin_payment_method_for_paid_by(text) SET row_security = off;

REVOKE ALL ON FUNCTION public.admin_list_payment_directory() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_payment_directory() TO anon;
GRANT EXECUTE ON FUNCTION public.admin_list_payment_directory() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_update_payment_method(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_payment_method(uuid, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_update_payment_method(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_payment_method_for_paid_by(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_payment_method_for_paid_by(text) TO anon;
GRANT EXECUTE ON FUNCTION public.admin_payment_method_for_paid_by(text) TO authenticated;
