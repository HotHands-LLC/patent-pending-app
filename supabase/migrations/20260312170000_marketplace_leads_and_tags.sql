-- Migration: Marketplace Leads Table + Tags
-- Created: 2026-03-12 — Arc 3 / Prompt 7E

-- ── marketplace_leads ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS marketplace_leads (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patent_id          uuid REFERENCES patents(id) ON DELETE CASCADE,
  full_name          text NOT NULL,
  email              text NOT NULL,
  company            text,
  interest_type      text NOT NULL
    CHECK (interest_type IN ('license','acquire','partner','invest','other')),
  why_statement      text NOT NULL,
  phone              text,
  status             text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','introduced')),
  owner_notified_at  timestamptz,
  introduced_at      timestamptz,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

ALTER TABLE marketplace_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_reads_own_leads" ON marketplace_leads
  FOR SELECT USING (
    patent_id IN (SELECT id FROM patents WHERE owner_id = auth.uid())
  );

-- ── Patents: tags + youtube + readiness ──────────────────────────────────────
ALTER TABLE patents ADD COLUMN IF NOT EXISTS marketplace_tags   text[] DEFAULT '{}';
ALTER TABLE patents ADD COLUMN IF NOT EXISTS youtube_embed_url  text;
ALTER TABLE patents ADD COLUMN IF NOT EXISTS ip_readiness_score integer;
