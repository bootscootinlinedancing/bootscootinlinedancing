-- Add an audit timestamp separate from the class-date attendance context.
-- Production attendance is empty at the time this migration was prepared.
ALTER TABLE attendance ADD COLUMN recorded_at TEXT;

-- Immutable loyalty transactions for attendance credits, manual migrations,
-- corrections and future reward lifecycle events. The existing
-- loyalty_stamp_ledger remains intact as the legacy payment-era ledger.
CREATE TABLE IF NOT EXISTS loyalty_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  customer_email TEXT NOT NULL,
  member_id TEXT,
  booking_id TEXT,
  amount INTEGER NOT NULL CHECK(amount <> 0),
  transaction_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type, source_id)
);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer
ON loyalty_transactions(customer_email, created_at);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer_id
ON loyalty_transactions(customer_id, created_at);

CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_booking
ON loyalty_transactions(booking_id, created_at);

CREATE TRIGGER IF NOT EXISTS loyalty_transactions_no_update
BEFORE UPDATE ON loyalty_transactions
BEGIN
  SELECT RAISE(ABORT, 'loyalty transactions are immutable');
END;

CREATE TRIGGER IF NOT EXISTS loyalty_transactions_no_delete
BEFORE DELETE ON loyalty_transactions
BEGIN
  SELECT RAISE(ABORT, 'loyalty transactions are immutable');
END;
