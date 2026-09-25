-- ============================================================
-- PARTE 1: Extensiones y Tablas Base
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Organizations
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID REFERENCES auth.users NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Profiles (extends auth.users)
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'collaborator')) DEFAULT 'collaborator',
  full_name TEXT NOT NULL,
  telegram_chat_id TEXT,
  blocked BOOLEAN DEFAULT false NOT NULL,
  daily_hours INT DEFAULT 8 NOT NULL,
  weekly_hours INT DEFAULT 40 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Shifts
CREATE TABLE shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);
