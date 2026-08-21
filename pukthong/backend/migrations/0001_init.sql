-- สร้างตารางเริ่มต้น: receipts, transactions, transaction_items
--
-- เขียนแบบ IF NOT EXISTS ทั้งหมด เพื่อให้ฐานข้อมูลที่เคยรัน Alembic 0001 มาก่อน
-- ผ่าน migration นี้ได้โดยไม่แตะข้อมูลเดิม (โครงสร้างตรงกันทุกคอลัมน์)

CREATE TABLE IF NOT EXISTS receipts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key TEXT NOT NULL,
  file_hash   TEXT NOT NULL UNIQUE,
  status      TEXT NOT NULL,
  blur_score  NUMERIC(10, 3),
  raw_payload JSONB,
  raw_text    TEXT,
  ai_model    TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id       UUID REFERENCES receipts(id),
  direction        TEXT NOT NULL,
  merchant_name    TEXT,
  branch           TEXT,
  merchant_tax_id  TEXT,
  doc_number       TEXT,
  occurred_on      DATE NOT NULL,
  occurred_at_time TIME WITHOUT TIME ZONE,
  currency         CHAR(3) DEFAULT 'THB',
  subtotal         NUMERIC(14, 2),
  discount         NUMERIC(14, 2) DEFAULT 0,
  service_charge   NUMERIC(14, 2) DEFAULT 0,
  vat_rate         NUMERIC(5, 2),
  vat_amount       NUMERIC(14, 2) DEFAULT 0,
  total            NUMERIC(14, 2) NOT NULL,
  category         TEXT,
  payment_method   TEXT,
  payment_channel  TEXT,
  note             TEXT,
  verified_by_user BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transaction_items (
  id             BIGSERIAL PRIMARY KEY,
  transaction_id UUID REFERENCES transactions(id) ON DELETE CASCADE,
  line_no        INTEGER,
  name           TEXT,
  qty            NUMERIC(12, 3),
  unit_price     NUMERIC(14, 2),
  amount         NUMERIC(14, 2),
  flag           VARCHAR(8)
);

CREATE INDEX IF NOT EXISTS ix_transactions_occurred_on
  ON transactions (occurred_on DESC);

CREATE INDEX IF NOT EXISTS ix_receipts_raw_payload
  ON receipts USING gin (raw_payload jsonb_path_ops);
