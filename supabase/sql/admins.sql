-- PitchSplit — admins table + secure login RPC (run in Supabase SQL Editor)
-- Requires: matches/players schema already applied (order does not matter for admins).

-- Password hashing (bcrypt via crypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.admins IS 'Dashboard admins; manage rows manually in Supabase. Never expose password_hash to clients.';

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Block direct table access from the API (anon/authenticated). Login uses SECURITY DEFINER RPC only.
CREATE POLICY "Deny direct access to admins"
  ON public.admins
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);
-- Direct reads/writes from the API are blocked. The login_admin() function uses SECURITY DEFINER
-- to compare passwords server-side; manage rows in the SQL Editor as a database admin.

-- Verify username/password; returns admin id or NULL (no user enumeration in response shape)
CREATE OR REPLACE FUNCTION public.login_admin(p_username text, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_username IS NULL OR btrim(p_username) = '' THEN
    RETURN NULL;
  END IF;
  IF p_password IS NULL OR p_password = '' THEN
    RETURN NULL;
  END IF;

  SELECT a.id INTO v_id
  FROM public.admins a
  WHERE a.username = btrim(p_username)
    AND a.password_hash = extensions.crypt(p_password, a.password_hash)
  LIMIT 1;

  RETURN v_id;
END;
$$;

-- Invoker is `anon`; inner SELECT must not be blocked by RLS on `admins`.
ALTER FUNCTION public.login_admin(text, text) SET row_security = off;

REVOKE ALL ON FUNCTION public.login_admin(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_admin(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.login_admin(text, text) TO authenticated;

-- First admin (change password immediately in production):
-- INSERT INTO public.admins (username, password_hash)
-- VALUES ('admin', extensions.crypt('your_secure_password', extensions.gen_salt('bf')));
--
-- To rotate password:
-- UPDATE public.admins SET password_hash = extensions.crypt('new_password', extensions.gen_salt('bf')) WHERE username = 'admin';
