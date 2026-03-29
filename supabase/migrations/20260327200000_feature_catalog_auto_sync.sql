-- P25: Feature Catalog Auto-Sync
-- Adds auto-sync columns to existing feature_catalog table
-- and seeds with known pp.app features

-- Add new columns if they don't already exist
ALTER TABLE feature_catalog
  ADD COLUMN IF NOT EXISTS tier_required TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS commit_ref TEXT,
  ADD COLUMN IF NOT EXISTS deployed_at TIMESTAMPTZ DEFAULT NOW();

-- Ensure status column exists (it may already be there as 'available'/'unavailable')
-- The existing table uses status='available', we keep that + add 'active'/'deprecated' semantics via same col

-- Seed current known pp.app features (upsert by feature_key to avoid duplication)
INSERT INTO feature_catalog (feature_key, feature_name, description, category, status, tier_required, deployed_at, applies_to) VALUES
  ('patent_intake', 'Patent Intake Wizard', 'Multi-step Pattie interview to capture invention details', 'core', 'available', 'paid', NOW(), ARRAY['pp.app']),
  ('pattie_chat', 'Pattie AI Chat', 'Contextual AI assistant with patent knowledge', 'core', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('claims_drafting', 'Claims Drafting', 'AI-generated patent claims with scoring', 'core', 'available', 'paid', NOW(), ARRAY['pp.app']),
  ('spec_drafting', 'Specification Drafting', 'Full patent specification drafting via Pattie', 'core', 'available', 'paid', NOW(), ARRAY['pp.app']),
  ('research_ids', 'IDS Candidates Research', 'Prior art and IDS candidate discovery', 'core', 'available', 'paid', NOW(), ARRAY['pp.app']),
  ('filing_pipeline', 'Filing Pipeline Tracker', '7-phase filing progress stepper', 'core', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('provisional_filing', 'Provisional Filing Tools', 'Provisional filing checklist and deadlines', 'core', 'available', 'paid', NOW(), ARRAY['pp.app']),
  ('marketplace', 'Patent Marketplace', 'List and discover patents for licensing/sale', 'marketing', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('marketplace_leads', 'Marketplace Lead Capture', 'Investor inquiry and lead management', 'marketing', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('activity_timeline', 'Activity Timeline', 'WHO/WHAT/WHEN patent activity journal', 'operations', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('smart_queue', 'Smart Queue Add', 'AI-powered claw prompt queue management', 'operations', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('llm_budget', 'LLM Budget Monitor', 'Cost tracking and provider fallback (Anthropic → Gemini)', 'operations', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('llm_router', 'LLM Task Router', 'Route tasks to optimal model by type', 'operations', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('health_cron', 'Health Check Cron', 'Automated app health monitoring with alerts', 'operations', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('claw_watchdog', 'Claw Watchdog', 'Auto-skip stuck tasks + stuck UI detection', 'operations', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('mission_control', 'Mission Control', 'Admin overview dashboard with pulse metrics', 'analytics', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('blog_autopilot', 'Blog Autopilot', 'AI-generated blog content with cron scheduling', 'marketing', 'available', 'free', NOW(), ARRAY['pp.app', 'all']),
  ('pattie_demo', 'Pattie Demo Widget', 'Public floating Pattie chat for homepage visitors', 'marketing', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('onboarding_flow', 'Inventor Onboarding', '3-step Pattie conversation onboarding', 'core', 'available', 'free', NOW(), ARRAY['pp.app']),
  ('signing_requests', 'Signing Requests Panel', 'eSign request management for patent documents', 'operations', 'available', 'paid', NOW(), ARRAY['pp.app']),
  ('collaborators', 'Collaborators Management', 'Multi-inventor collaboration tools', 'core', 'available', 'paid', NOW(), ARRAY['pp.app']),
  ('contacts_crm', 'Contacts CRM', 'Attorney and partner contact management', 'operations', 'available', 'free', NOW(), ARRAY['pp.app'])
ON CONFLICT (feature_key) DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  tier_required = EXCLUDED.tier_required,
  applies_to = EXCLUDED.applies_to;
