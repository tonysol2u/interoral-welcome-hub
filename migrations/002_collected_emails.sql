-- Email collection table for Relu download flow
CREATE TABLE IF NOT EXISTS collected_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  source TEXT DEFAULT 'relu_download',
  name TEXT,
  doctor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collected_emails_source ON collected_emails(source);
