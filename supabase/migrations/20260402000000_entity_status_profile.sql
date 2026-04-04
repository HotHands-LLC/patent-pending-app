-- Migration: Add entity_status fields to patent_profiles
-- Date: 2026-04-02
-- Purpose: Track inventor entity status (small/micro/large) per profile
-- Entity status should be blank until user uploads declaration via Pattie,
-- then Pattie sets entity_status + stores the declaration file reference.

ALTER TABLE patent_profiles 
ADD COLUMN IF NOT EXISTS entity_status text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS entity_status_declared_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS entity_status_declaration_file text DEFAULT NULL;

COMMENT ON COLUMN patent_profiles.entity_status IS 'Entity status: small, micro, or large. NULL until user uploads entity declaration via Pattie.';
COMMENT ON COLUMN patent_profiles.entity_status_declared_at IS 'Timestamp when entity status was declared/confirmed by user';
COMMENT ON COLUMN patent_profiles.entity_status_declaration_file IS 'Storage path or Drive ID of uploaded entity status declaration document';

-- Set Chad Bostwick (support@hotdeck.com) to small entity
-- This is hardcoded per business rule: Chad filed RIP2 provisional + sent entity change to USPTO
UPDATE patent_profiles 
SET 
  entity_status = 'small',
  entity_status_declared_at = NOW(),
  entity_status_declaration_file = 'hardcoded:chad-bostwick-small-entity-rip2-change'
WHERE email = 'support@hotdeck.com';
