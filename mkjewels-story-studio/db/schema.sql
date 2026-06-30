CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  sku TEXT,
  catalog_ref TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'draft', 'approved')),
  detected_category TEXT,
  detected_material TEXT,
  detected_motifs TEXT,
  detected_style TEXT,
  short_story TEXT,
  long_story TEXT,
  final_short_story TEXT,
  final_long_story TEXT,
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
