-- Per-job drawing/sketch pages — replaces the third-party app used in the
-- field for measurement sketches. Strokes are stored as vector JSON so
-- pages stay editable; thumbnail is a small PNG data URL for previews.
CREATE TABLE job_drawings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT 'Page 1',
  strokes       JSONB NOT NULL DEFAULT '[]'::jsonb,
  thumbnail     TEXT,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_by    TEXT DEFAULT 'owner',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER trg_job_drawings_updated_at BEFORE UPDATE ON job_drawings FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE job_drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_full_access" ON job_drawings FOR ALL TO authenticated USING (true) WITH CHECK (true);
