-- ============================================================
-- Pricing & CRM System — Initial Schema
-- ============================================================

-- Cabinet Lines (for multiplier-based pricing system)
CREATE TABLE cabinet_lines (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  multiplier  NUMERIC(5,3) NOT NULL DEFAULT 1.000,
  is_base     BOOLEAN NOT NULL DEFAULT false,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- Pricing Items (catalog)
CREATE TABLE pricing_items (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,
  description               TEXT,
  category                  TEXT NOT NULL,
  unit                      TEXT NOT NULL DEFAULT 'each',
  unit_price                NUMERIC(10,2) NOT NULL,
  applies_to_cabinet_lines  BOOLEAN NOT NULL DEFAULT false,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  created_at                TIMESTAMPTZ DEFAULT now(),
  updated_at                TIMESTAMPTZ DEFAULT now()
);

-- Customers
CREATE TABLE customers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  address_line1  TEXT,
  address_line2  TEXT,
  city           TEXT,
  state          TEXT,
  zip            TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

-- Jobs / Projects
CREATE TYPE job_stage AS ENUM (
  'lead',
  'proposal_sent',
  'contract_signed',
  'in_progress',
  'punch_list',
  'complete',
  'on_hold',
  'cancelled'
);

CREATE TABLE jobs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id         UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  title               TEXT NOT NULL,
  description         TEXT,
  stage               job_stage NOT NULL DEFAULT 'lead',
  job_address         TEXT,
  start_date          DATE,
  estimated_end_date  DATE,
  actual_end_date     DATE,
  estimated_value     NUMERIC(10,2),
  notes               TEXT,
  assigned_to         TEXT DEFAULT 'owner',
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Documents
CREATE TYPE document_type AS ENUM (
  'contract',
  'invoice',
  'change_order',
  'quote'
);

CREATE TYPE document_status AS ENUM (
  'draft',
  'sent',
  'signed',
  'paid',
  'void'
);

CREATE TABLE documents (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id           UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  document_type    document_type NOT NULL,
  status           document_status NOT NULL DEFAULT 'draft',
  document_number  TEXT NOT NULL UNIQUE,
  title            TEXT NOT NULL,
  notes            TEXT,
  client_notes     TEXT,
  tax_rate         NUMERIC(5,4) DEFAULT 0,
  discount_amount  NUMERIC(10,2) DEFAULT 0,
  deposit_amount   NUMERIC(10,2) DEFAULT 0,
  due_date         DATE,
  sent_at          TIMESTAMPTZ,
  signed_at        TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  pdf_storage_path TEXT,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

-- Document Line Items
CREATE TABLE document_line_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  pricing_item_id  UUID REFERENCES pricing_items(id) ON DELETE SET NULL,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  name             TEXT NOT NULL,
  description      TEXT,
  quantity         NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit             TEXT NOT NULL DEFAULT 'each',
  unit_price       NUMERIC(10,2) NOT NULL,
  line_total       NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Auto-incrementing document number counters
CREATE TABLE document_counters (
  document_type  document_type PRIMARY KEY,
  last_number    INTEGER NOT NULL DEFAULT 0
);

INSERT INTO document_counters (document_type, last_number) VALUES
  ('contract', 0),
  ('invoice', 0),
  ('change_order', 0),
  ('quote', 0);

-- Job Notes / Activity Log
CREATE TABLE job_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  author      TEXT NOT NULL DEFAULT 'owner',
  content     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Job Photos
CREATE TABLE job_photos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL,
  caption       TEXT,
  phase         TEXT DEFAULT 'during',  -- 'before' | 'during' | 'after'
  uploaded_by   TEXT DEFAULT 'owner',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Communication Log
CREATE TABLE communications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id  UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  job_id       UUID REFERENCES jobs(id) ON DELETE SET NULL,
  channel      TEXT NOT NULL,       -- 'email' | 'phone' | 'text' | 'meeting' | 'other'
  direction    TEXT NOT NULL DEFAULT 'outbound',  -- 'inbound' | 'outbound'
  summary      TEXT NOT NULL,
  occurred_at  TIMESTAMPTZ DEFAULT now(),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Payment Records (manual entry only — no payment processing)
CREATE TABLE payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id   UUID NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE RESTRICT,
  amount        NUMERIC(10,2) NOT NULL,
  payment_date  DATE NOT NULL,
  method        TEXT,   -- 'check' | 'cash' | 'zelle' | 'credit_card' | 'bank_transfer'
  reference     TEXT,   -- check number, transaction ref, etc.
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Designer Commission Invoices
CREATE TYPE commission_status AS ENUM (
  'pending',
  'paid'
);

CREATE TABLE designer_commissions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                UUID REFERENCES jobs(id) ON DELETE SET NULL,
  invoice_storage_path  TEXT NOT NULL,
  amount                NUMERIC(10,2),
  status                commission_status NOT NULL DEFAULT 'pending',
  submitted_at          TIMESTAMPTZ DEFAULT now(),
  paid_at               TIMESTAMPTZ,
  paid_amount           NUMERIC(10,2),
  payment_method        TEXT,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);

-- App Settings (company info for document headers)
CREATE TABLE app_settings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name      TEXT NOT NULL DEFAULT 'Your Company',
  company_address   TEXT,
  company_phone     TEXT,
  company_email     TEXT,
  company_logo_path TEXT,
  payment_terms     TEXT DEFAULT 'Payment due within 30 days.',
  default_tax_rate  NUMERIC(5,4) DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Insert default settings row
INSERT INTO app_settings (company_name) VALUES ('My Studio');

-- ============================================================
-- Functions
-- ============================================================

-- Auto-increment document numbers: INV-2026-0001, CON-2026-0001, etc.
CREATE OR REPLACE FUNCTION next_document_number(doc_type document_type)
RETURNS TEXT AS $$
DECLARE
  prefix     TEXT;
  next_num   INTEGER;
  year_part  TEXT;
BEGIN
  SELECT CASE doc_type
    WHEN 'contract'     THEN 'CON'
    WHEN 'invoice'      THEN 'INV'
    WHEN 'change_order' THEN 'CO'
    WHEN 'quote'        THEN 'QTE'
  END INTO prefix;

  year_part := to_char(now(), 'YYYY');

  UPDATE document_counters
    SET last_number = last_number + 1
    WHERE document_counters.document_type = doc_type
    RETURNING last_number INTO next_num;

  RETURN prefix || '-' || year_part || '-' || lpad(next_num::text, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_cabinet_lines_updated_at     BEFORE UPDATE ON cabinet_lines     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_pricing_items_updated_at     BEFORE UPDATE ON pricing_items     FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated_at         BEFORE UPDATE ON customers         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_jobs_updated_at              BEFORE UPDATE ON jobs              FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_documents_updated_at         BEFORE UPDATE ON documents         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_designer_commissions_updated BEFORE UPDATE ON designer_commissions FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_app_settings_updated_at      BEFORE UPDATE ON app_settings      FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Row Level Security (authenticated users = full access)
-- ============================================================

ALTER TABLE cabinet_lines          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_items          ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers              ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents              ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_line_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_counters      ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_photos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE designer_commissions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings           ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_full_access" ON cabinet_lines        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON pricing_items        FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON customers            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON jobs                 FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON documents            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON document_line_items  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON document_counters    FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON job_notes            FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON job_photos           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON communications       FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON payments             FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON designer_commissions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_full_access" ON app_settings         FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- Seed: Cabinet Lines (base + common tiers)
-- ============================================================

INSERT INTO cabinet_lines (name, description, multiplier, is_base, sort_order) VALUES
  ('Builder Series', 'Entry-level cabinet line — base pricing',   1.000, true,  1),
  ('Semi-Custom',    'Mid-range cabinet line',                     1.35,  false, 2),
  ('Full Custom',    'Premium custom cabinet line',                1.75,  false, 3);

-- ============================================================
-- Seed: Pricing Item Categories
-- ============================================================

INSERT INTO pricing_items (name, category, unit, unit_price, applies_to_cabinet_lines) VALUES
  -- Countertop Materials
  ('Laminate Countertop',     'Countertop Materials', 'sq ft', 25.00,  false),
  ('Granite Countertop',      'Countertop Materials', 'sq ft', 65.00,  false),
  ('Quartz Countertop',       'Countertop Materials', 'sq ft', 85.00,  false),
  ('Quartzite Countertop',    'Countertop Materials', 'sq ft', 95.00,  false),
  ('Marble Countertop',       'Countertop Materials', 'sq ft', 110.00, false),
  -- Countertop Fabrication & Installation
  ('Countertop Fabrication',  'Countertop Installation', 'sq ft', 30.00, false),
  ('Countertop Installation', 'Countertop Installation', 'sq ft', 15.00, false),
  ('Undermount Sink Cutout',  'Countertop Installation', 'each',  75.00, false),
  ('Edge Profile - Standard', 'Countertop Installation', 'linear ft', 8.00, false),
  ('Edge Profile - Premium',  'Countertop Installation', 'linear ft', 18.00, false),
  -- Design Services
  ('Design Consultation',     'Design Services', 'hour',  150.00, false),
  ('Design Package - Full',   'Design Services', 'lot',   800.00, false),
  ('Design Package - Basic',  'Design Services', 'lot',   350.00, false),
  -- Installation Labor
  ('Cabinet Installation',    'Labor', 'hour', 85.00, false),
  ('Delivery & Setup',        'Labor', 'lot',  250.00, false),
  ('Demolition & Haul-Away',  'Labor', 'lot',  400.00, false),
  -- Permits & Fees
  ('Building Permit',         'Permits & Fees', 'lot', 350.00, false),
  -- Subcontractors
  ('Plumbing Rough-In',       'Subcontractors', 'lot', 600.00, false),
  ('Electrical Work',         'Subcontractors', 'lot', 450.00, false);
