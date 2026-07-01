CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  sku TEXT,
  catalog_ref TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'ready', 'approved', 'discarded')),
  detected_category TEXT,
  detected_material TEXT,
  detected_motifs TEXT,
  detected_style TEXT,
  short_story TEXT,
  long_story TEXT,
  final_short_story TEXT,
  final_long_story TEXT,
  staff_notes TEXT,
  error_message TEXT,
  generation_error TEXT,
  generation_error_at TIMESTAMPTZ,
  is_edited BOOLEAN DEFAULT false,
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pieces
  ADD COLUMN IF NOT EXISTS generation_error TEXT,
  ADD COLUMN IF NOT EXISTS generation_error_at TIMESTAMPTZ;

-- Migration note for existing Supabase projects:
-- Run these ALTER TABLE statements separately in the Supabase SQL Editor before deploying code that reads the new columns.
ALTER TABLE pieces
  ADD COLUMN IF NOT EXISTS staff_notes TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Migration note for the simplified status values:
-- This maps old values to the new lowercase status values and adds the discarded state.
ALTER TABLE pieces DROP CONSTRAINT IF EXISTS pieces_status_check;

UPDATE pieces
SET status = CASE status
  WHEN 'uploaded' THEN 'queued'
  WHEN 'draft' THEN 'ready'
  ELSE status
END
WHERE status IN ('uploaded', 'draft');

ALTER TABLE pieces
  ALTER COLUMN status SET DEFAULT 'queued',
  ADD CONSTRAINT pieces_status_check CHECK (status IN ('queued', 'processing', 'ready', 'approved', 'discarded'));

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pieces_set_updated_at ON pieces;

CREATE TRIGGER pieces_set_updated_at
BEFORE UPDATE ON pieces
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
