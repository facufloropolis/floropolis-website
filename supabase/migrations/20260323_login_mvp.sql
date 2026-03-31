-- Login MVP Migration
-- v1 | 2026-03-23 | Job_PM
-- Creates client_profiles and koronet_clients tables with RLS

-- Client profiles (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name TEXT,
  phone TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  koronet_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  UNIQUE(user_id)
);

-- Koronet client list (populated when we receive the export from Alvar/Rose)
CREATE TABLE IF NOT EXISTS koronet_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  koronet_id TEXT,
  business_name TEXT,
  email TEXT,
  phone TEXT,
  matched_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies for client_profiles
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON client_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON client_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON client_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- RLS for koronet_clients (read-only for authenticated users, no direct write from client)
ALTER TABLE koronet_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read koronet_clients"
  ON koronet_clients FOR SELECT
  TO authenticated
  USING (true);
