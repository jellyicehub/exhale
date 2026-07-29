-- ============================================================
--  EXHALE — Supabase Initial Schema
--  Run this in the Supabase SQL Editor (project → SQL Editor → New query)
-- ============================================================

-- ============================================================
--  TABLES
-- ============================================================

-- User profiles linked to Supabase Auth users
CREATE TABLE IF NOT EXISTS public.users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  age        INTEGER,
  gender     TEXT CHECK (gender IN ('Male', 'Female', 'Other')),
  birthday   DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Breath readings
CREATE TABLE IF NOT EXISTS public.readings (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  device_id     TEXT        NOT NULL DEFAULT 'exhale-device-01',
  co2           NUMERIC,
  temperature   NUMERIC,
  humidity      NUMERIC,
  acidity_index NUMERIC,
  estimated_ph  NUMERIC,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Device configuration (single-row table, seeded below)
CREATE TABLE IF NOT EXISTS public.device_config (
  id               INTEGER     PRIMARY KEY DEFAULT 1,
  active_user_id   UUID        REFERENCES public.users(id) ON DELETE SET NULL,
  active_user_name TEXT,
  device_id        TEXT        NOT NULL DEFAULT 'exhale-device-01',
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Seed the single config row (safe to run multiple times)
INSERT INTO public.device_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.readings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_config ENABLE ROW LEVEL SECURITY;

-- users: each authenticated user can only access their own row
DROP POLICY IF EXISTS "users_own_row" ON public.users;
CREATE POLICY "users_own_row"
  ON public.users
  FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- readings: authenticated users can select/delete only their own
DROP POLICY IF EXISTS "readings_select_own" ON public.readings;
CREATE POLICY "readings_select_own"
  ON public.readings
  FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "readings_delete_own" ON public.readings;
CREATE POLICY "readings_delete_own"
  ON public.readings
  FOR DELETE
  USING (auth.uid() = user_id);

-- readings: authenticated users can insert for themselves
DROP POLICY IF EXISTS "readings_insert_own" ON public.readings;
CREATE POLICY "readings_insert_own"
  ON public.readings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- readings: anon key (ESP32 device) can insert readings
-- The device uses the anon key without user auth.
-- Scope is limited to the known device_id.
DROP POLICY IF EXISTS "readings_device_insert" ON public.readings;
CREATE POLICY "readings_device_insert"
  ON public.readings
  FOR INSERT
  WITH CHECK (device_id = 'exhale-device-01');

-- device_config: anyone (including the ESP32 anon key) can read
DROP POLICY IF EXISTS "device_config_read" ON public.device_config;
CREATE POLICY "device_config_read"
  ON public.device_config
  FOR SELECT
  USING (true);

-- device_config: authenticated users can update (website sets active user)
DROP POLICY IF EXISTS "device_config_update" ON public.device_config;
CREATE POLICY "device_config_update"
  ON public.device_config
  FOR UPDATE
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
--  INDEXES
-- ============================================================

-- Speed up readings queries by user + time
CREATE INDEX IF NOT EXISTS readings_user_created
  ON public.readings (user_id, created_at DESC);
