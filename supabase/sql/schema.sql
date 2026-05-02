-- PitchSplit — matches / players (Supabase SQL editor)
-- Admin authentication: run `admins.sql` in the same project for the `admins` table + `login_admin` RPC.

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_date DATE NOT NULL,
  paid_by TEXT,
  total_amount NUMERIC NOT NULL,
  costs JSONB NOT NULL DEFAULT '{"venue_cost":0,"gear_cost":0,"refreshment_cost":0,"additional_cost":0,"total_amount":0}'::jsonb,
  per_head NUMERIC NOT NULL DEFAULT 0,
  players JSONB NOT NULL DEFAULT '[]'::jsonb,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  payments_locked BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  has_paid BOOLEAN DEFAULT FALSE
);

CREATE TABLE default_players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_players_match_id ON players(match_id);
CREATE INDEX idx_default_players_sort ON default_players (sort_order);
