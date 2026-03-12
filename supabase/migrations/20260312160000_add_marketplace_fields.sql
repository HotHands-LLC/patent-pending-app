-- Migration: Add Marketplace Fields to Patents Table
-- Created: 2026-03-12 — Arc 3 launch (Prompt 7D)

ALTER TABLE patents ADD COLUMN IF NOT EXISTS marketplace_enabled boolean DEFAULT false;
ALTER TABLE patents ADD COLUMN IF NOT EXISTS marketplace_slug text;
ALTER TABLE patents ADD COLUMN IF NOT EXISTS license_types text[];
ALTER TABLE patents ADD COLUMN IF NOT EXISTS asking_price_range text;
ALTER TABLE patents ADD COLUMN IF NOT EXISTS marketplace_published_at timestamptz;

-- Unique index on marketplace_slug (partial — only when set)
CREATE UNIQUE INDEX IF NOT EXISTS patents_marketplace_slug_key
  ON patents(marketplace_slug)
  WHERE marketplace_slug IS NOT NULL;

-- Update correspondence type constraint to include marketplace_inquiry
-- (and all other types discovered in existing data)
ALTER TABLE patent_correspondence DROP CONSTRAINT IF EXISTS patent_correspondence_type_check;
ALTER TABLE patent_correspondence ADD CONSTRAINT patent_correspondence_type_check
  CHECK (type = ANY (ARRAY[
    'uspto_action', 'email', 'filing', 'attorney_note', 'boclaw_note',
    'deadline_notice', 'ai_research', 'marketplace_inquiry', 'other',
    'assignment', 'attorney_email', 'filed_document',
    'outbound_document', 'outbound_email', 'uspto_receipt'
  ]));
