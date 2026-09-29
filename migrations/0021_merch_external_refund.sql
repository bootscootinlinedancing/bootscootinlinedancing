ALTER TABLE merch_orders ADD COLUMN cancelled_at TEXT;
CREATE TABLE merch_external_refunds (
  operation_id TEXT PRIMARY KEY REFERENCES admin_lifecycle_audit(operation_id),
  order_id TEXT NOT NULL UNIQUE REFERENCES merch_orders(id),
  amount_pence INTEGER NOT NULL CHECK(amount_pence>0),
  currency TEXT NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
  source TEXT NOT NULL CHECK(source='EXTERNAL_MANUAL'),
  method TEXT NOT NULL CHECK(length(trim(method))>0),
  refunded_at TEXT NOT NULL,
  external_reference TEXT,
  reason TEXT NOT NULL CHECK(length(trim(reason))>0),
  actor TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER merch_external_refund_no_update BEFORE UPDATE ON merch_external_refunds
BEGIN SELECT RAISE(ABORT,'external refund record is immutable'); END;
CREATE TRIGGER merch_external_refund_no_delete BEFORE DELETE ON merch_external_refunds
BEGIN SELECT RAISE(ABORT,'external refund record is immutable'); END;
CREATE TRIGGER merch_paid_history_no_delete BEFORE DELETE ON merch_orders
WHEN OLD.paid_at IS NOT NULL OR OLD.status IN ('PAID','CANCELLED')
BEGIN SELECT RAISE(ABORT,'historically paid or cancelled orders must be retained'); END;
CREATE VIEW merch_accounting AS
SELECT o.id order_id,o.reference,o.status,o.amount_pence,
  CASE WHEN o.paid_at IS NOT NULL THEN o.amount_pence ELSE 0 END gross_received_pence,
  COALESCE(r.amount_pence,0) externally_refunded_pence,
  CASE WHEN o.paid_at IS NOT NULL THEN o.amount_pence ELSE 0 END-COALESCE(r.amount_pence,0) net_received_pence,
  r.refunded_at,r.method refund_method,r.source refund_source,r.external_reference
FROM merch_orders o LEFT JOIN merch_external_refunds r ON r.order_id=o.id;
