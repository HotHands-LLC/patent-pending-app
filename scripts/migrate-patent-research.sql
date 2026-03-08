-- ─────────────────────────────────────────────────────────────────────────────
-- Patent Research Intelligence Tables
-- Migration: patent_research_findings + patent_research_runs
-- Created: 2026-03-08 (cont.24 Task 3)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── patent_research_runs ─────────────────────────────────────────────────────
-- One row per research job execution (scheduled, manual, or initial scan).
-- Tracks job status so we can show "last researched X days ago" in the UI
-- and prevent duplicate runs.

CREATE TABLE IF NOT EXISTS patent_research_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patent_id     UUID REFERENCES patents(id) ON DELETE CASCADE,
  owner_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
  run_type      TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'manual' | 'initial'
  status        TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'running' | 'complete' | 'failed'
  findings_count INTEGER NOT NULL DEFAULT 0,
  new_findings_count INTEGER NOT NULL DEFAULT 0,
  queries_used  TEXT[] DEFAULT '{}',               -- search queries that were run
  error_message TEXT,
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS patent_research_runs_patent_id_idx ON patent_research_runs(patent_id);
CREATE INDEX IF NOT EXISTS patent_research_runs_owner_id_idx ON patent_research_runs(owner_id);
CREATE INDEX IF NOT EXISTS patent_research_runs_status_idx ON patent_research_runs(status);
CREATE INDEX IF NOT EXISTS patent_research_runs_created_at_idx ON patent_research_runs(created_at DESC);

-- ── patent_research_findings ─────────────────────────────────────────────────
-- One row per unique finding per patent.
-- Findings are de-duplicated by source_url per patent — same article won't
-- be re-inserted on subsequent runs if already present.

CREATE TABLE IF NOT EXISTS patent_research_findings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patent_id     UUID NOT NULL REFERENCES patents(id) ON DELETE CASCADE,
  owner_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  run_id        UUID REFERENCES patent_research_runs(id) ON DELETE SET NULL,

  -- Classification
  finding_type  TEXT NOT NULL DEFAULT 'prior_art',
  -- 'prior_art'   – existing patents or publications that overlap with claims
  -- 'competitor'  – companies/products working in the same space
  -- 'market_intel' – market size, investment, recent funding in the space
  -- 'news'        – recent news relevant to the invention area
  -- 'legal'       – USPTO rule changes, IDS requirements, etc.

  -- Content
  title         TEXT NOT NULL,
  summary       TEXT,           -- 2-4 sentence AI-generated summary of relevance
  source_url    TEXT,           -- deduplicate on (patent_id, source_url)
  source_name   TEXT,           -- "USPTO", "Google Patents", "TechCrunch", etc.
  snippet       TEXT,           -- raw search result snippet

  -- Relevance
  relevance_score INTEGER DEFAULT 5 CHECK (relevance_score BETWEEN 1 AND 10),
  -- 1-3: loosely related, 4-6: moderately relevant, 7-9: highly relevant, 10: critical/blocking

  -- Flags
  is_dismissed  BOOLEAN NOT NULL DEFAULT false,  -- user archived this finding
  is_notified   BOOLEAN NOT NULL DEFAULT false,  -- email notification sent
  notified_at   TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(patent_id, source_url)  -- prevent duplicates across runs
);

CREATE INDEX IF NOT EXISTS patent_research_findings_patent_id_idx ON patent_research_findings(patent_id);
CREATE INDEX IF NOT EXISTS patent_research_findings_owner_id_idx ON patent_research_findings(owner_id);
CREATE INDEX IF NOT EXISTS patent_research_findings_finding_type_idx ON patent_research_findings(finding_type);
CREATE INDEX IF NOT EXISTS patent_research_findings_relevance_idx ON patent_research_findings(relevance_score DESC);
CREATE INDEX IF NOT EXISTS patent_research_findings_created_at_idx ON patent_research_findings(created_at DESC);

-- ── RLS policies ──────────────────────────────────────────────────────────────

ALTER TABLE patent_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE patent_research_findings ENABLE ROW LEVEL SECURITY;

-- Runs: owners see their own runs; admins see all
CREATE POLICY "Users can view own research runs"
  ON patent_research_runs FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert own research runs"
  ON patent_research_runs FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update own research runs"
  ON patent_research_runs FOR UPDATE
  USING (owner_id = auth.uid());

-- Findings: owners see their own; can dismiss (update is_dismissed)
CREATE POLICY "Users can view own research findings"
  ON patent_research_findings FOR SELECT
  USING (owner_id = auth.uid());

CREATE POLICY "Users can update own research findings"
  ON patent_research_findings FOR UPDATE
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Service role (cron/API) bypasses RLS — no policy needed for service_role

-- ── Notification preference on profiles ─────────────────────────────────────
-- Add research_notifications column if it doesn't exist.
-- Defaults to true so existing users get notified.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'research_notifications'
  ) THEN
    ALTER TABLE profiles ADD COLUMN research_notifications BOOLEAN NOT NULL DEFAULT true;
  END IF;
END $$;

-- ── updated_at trigger for findings ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_patent_research_findings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER patent_research_findings_updated_at
  BEFORE UPDATE ON patent_research_findings
  FOR EACH ROW EXECUTE FUNCTION update_patent_research_findings_updated_at();
