-- Stage 1: additive class-pass data model only.
-- No existing booking, payment, loyalty or attendance rows are rewritten.

CREATE TABLE IF NOT EXISTS class_pass_products (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_pence INTEGER NOT NULL CHECK(price_pence >= 0),
  original_credits INTEGER NOT NULL CHECK(original_credits > 0),
  validity_days INTEGER NOT NULL CHECK(validity_days > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO class_pass_products(
  id,code,name,price_pence,original_credits,validity_days,active,display_order
) VALUES
  ('class-pass-4','CLASS_PASS_4','4-Class Pass',2200,4,42,1,10),
  ('class-pass-6','CLASS_PASS_6','6-Class Pass',3200,6,56,1,20);

CREATE TABLE IF NOT EXISTS member_passes (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES member_accounts(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  product_id TEXT NOT NULL REFERENCES class_pass_products(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','CANCELLED')),
  purchased_at TEXT,
  original_valid_through TEXT,
  valid_through TEXT,
  original_credits INTEGER NOT NULL CHECK(original_credits > 0),
  purchase_amount_pence INTEGER NOT NULL CHECK(purchase_amount_pence >= 0),
  currency TEXT NOT NULL DEFAULT 'GBP',
  payment_provider TEXT NOT NULL DEFAULT 'SUMUP',
  provider_checkout_id TEXT UNIQUE,
  provider_transaction_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_member_passes_member
ON member_passes(member_id,status,valid_through);

CREATE INDEX IF NOT EXISTS idx_member_passes_customer
ON member_passes(customer_id,created_at);

CREATE TABLE IF NOT EXISTS class_pass_credit_ledger (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES member_passes(id),
  member_id TEXT NOT NULL REFERENCES member_accounts(id),
  booking_id TEXT REFERENCES bookings(id),
  amount INTEGER NOT NULL CHECK(amount <> 0),
  event_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_class_pass_ledger_pass
ON class_pass_credit_ledger(pass_id,created_at);

CREATE INDEX IF NOT EXISTS idx_class_pass_ledger_member
ON class_pass_credit_ledger(member_id,created_at);

CREATE INDEX IF NOT EXISTS idx_class_pass_ledger_booking
ON class_pass_credit_ledger(booking_id,created_at);

CREATE TRIGGER IF NOT EXISTS class_pass_credit_ledger_no_update
BEFORE UPDATE ON class_pass_credit_ledger
BEGIN
  SELECT RAISE(ABORT, 'class pass credit ledger is immutable');
END;

CREATE TRIGGER IF NOT EXISTS class_pass_credit_ledger_no_delete
BEFORE DELETE ON class_pass_credit_ledger
BEGIN
  SELECT RAISE(ABORT, 'class pass credit ledger is immutable');
END;

CREATE TABLE IF NOT EXISTS class_pass_class_eligibility (
  class_id TEXT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  eligible INTEGER NOT NULL DEFAULT 0 CHECK(eligible IN (0,1)),
  reason TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS class_pass_audit_log (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES member_passes(id),
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  reason TEXT NOT NULL,
  previous_json TEXT,
  next_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_class_pass_audit_pass
ON class_pass_audit_log(pass_id,created_at);

CREATE TRIGGER IF NOT EXISTS class_pass_audit_no_update
BEFORE UPDATE ON class_pass_audit_log
BEGIN
  SELECT RAISE(ABORT, 'class pass audit log is immutable');
END;

CREATE TRIGGER IF NOT EXISTS class_pass_audit_no_delete
BEFORE DELETE ON class_pass_audit_log
BEGIN
  SELECT RAISE(ABORT, 'class pass audit log is immutable');
END;

ALTER TABLE bookings ADD COLUMN class_pass_id TEXT REFERENCES member_passes(id);
ALTER TABLE bookings ADD COLUMN class_pass_ledger_id TEXT REFERENCES class_pass_credit_ledger(id);

CREATE INDEX IF NOT EXISTS idx_bookings_class_pass
ON bookings(class_pass_id);
