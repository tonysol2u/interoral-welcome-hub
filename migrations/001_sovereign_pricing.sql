-- ═══════════════════════════════════════════════════════════════
-- SOVEREIGN PRICING TABLE
-- Managed entirely from admin UI. Left EMPTY for manual population.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sovereign_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL,
  regional_flag TEXT NOT NULL DEFAULT 'US',
  base_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency_symbol TEXT NOT NULL DEFAULT '$',
  currency_code TEXT NOT NULL DEFAULT 'USD',
  is_active BOOLEAN NOT NULL DEFAULT true,
  display_name TEXT,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(service_type, regional_flag)
);

CREATE TABLE IF NOT EXISTS credit_topup_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tier_name TEXT NOT NULL,
  credits INTEGER NOT NULL,
  price_usd NUMERIC(10,2) NOT NULL,
  regional_flag TEXT NOT NULL DEFAULT 'US',
  currency_symbol TEXT NOT NULL DEFAULT '$',
  currency_code TEXT NOT NULL DEFAULT 'USD',
  local_price NUMERIC(10,2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS design_token_balances (
  user_id UUID PRIMARY KEY,
  balance NUMERIC(10,2) NOT NULL DEFAULT 0,
  lifetime_purchased NUMERIC(10,2) NOT NULL DEFAULT 0,
  lifetime_spent NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS design_token_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  case_id UUID,
  amount NUMERIC(10,2) NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('credit','debit')),
  reason TEXT NOT NULL,
  designer TEXT,
  units INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_token_ledger_user ON design_token_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_ledger_stripe ON design_token_ledger((metadata->>'stripe_pi'));

CREATE TABLE IF NOT EXISTS ghl_webhook_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  case_id UUID,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  response_code INTEGER,
  fired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sovereign_pricing_lookup ON sovereign_pricing(service_type, regional_flag);
