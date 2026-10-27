-- Additive HQ recording for tickets paid outside the website.
-- Existing bookings, payments, customers, attendance and guest-list rows are untouched.

CREATE TABLE external_ticket_orders (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  source TEXT NOT NULL CHECK(source IN ('EVENTBRITE','SKIDDLE','MANUAL','COMPLIMENTARY')),
  ticket_type TEXT NOT NULL,
  purchaser_name TEXT NOT NULL,
  purchaser_email TEXT,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 100),
  amount_paid_pence INTEGER NOT NULL CHECK(amount_paid_pence >= 0),
  external_reference TEXT NOT NULL,
  purchased_at TEXT,
  notes TEXT,
  payment_collected_externally INTEGER NOT NULL DEFAULT 1 CHECK(payment_collected_externally=1),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  last_operation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX idx_external_ticket_reference
  ON external_ticket_orders(class_id,source,lower(external_reference));
CREATE INDEX idx_external_ticket_event_status
  ON external_ticket_orders(class_id,status,created_at);

CREATE TABLE external_ticket_admissions (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES external_ticket_orders(id) ON DELETE RESTRICT,
  class_id TEXT NOT NULL REFERENCES classes(id),
  admission_number INTEGER NOT NULL CHECK(admission_number > 0),
  guest_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'EXPECTED' CHECK(status IN ('EXPECTED','ATTENDED','CANCELLED')),
  checked_in_at TEXT,
  checked_in_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(order_id,admission_number)
);

CREATE INDEX idx_external_admission_event_status
  ON external_ticket_admissions(class_id,status,order_id,admission_number);

CREATE TABLE external_ticket_audit (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  order_id TEXT NOT NULL REFERENCES external_ticket_orders(id),
  admission_id TEXT REFERENCES external_ticket_admissions(id),
  action TEXT NOT NULL CHECK(action IN ('ORDER_RECORDED','ORDER_CORRECTED','ORDER_CANCELLED','ADMISSION_CHECKED_IN')),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_json TEXT,
  next_json TEXT,
  operation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_external_ticket_audit_event
  ON external_ticket_audit(class_id,created_at);

CREATE TRIGGER external_ticket_order_no_delete BEFORE DELETE ON external_ticket_orders
BEGIN SELECT RAISE(ABORT,'external ticket orders must be cancelled, not deleted'); END;

CREATE TRIGGER external_ticket_order_no_reactivate BEFORE UPDATE OF status ON external_ticket_orders
WHEN OLD.status='CANCELLED' AND NEW.status<>'CANCELLED'
BEGIN SELECT RAISE(ABORT,'cancelled external ticket orders cannot be reactivated'); END;

CREATE TRIGGER external_ticket_admission_no_delete BEFORE DELETE ON external_ticket_admissions
BEGIN SELECT RAISE(ABORT,'external admissions are retained for audit'); END;

CREATE TRIGGER external_ticket_audit_no_update BEFORE UPDATE ON external_ticket_audit
BEGIN SELECT RAISE(ABORT,'external ticket audit history is immutable'); END;

CREATE TRIGGER external_ticket_audit_no_delete BEFORE DELETE ON external_ticket_audit
BEGIN SELECT RAISE(ABORT,'external ticket audit history is immutable'); END;
