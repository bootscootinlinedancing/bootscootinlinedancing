-- Additive per-class ticket products for the Beginner + Improver trial.
-- Existing 0022 ticket_type fields and legacy rows remain unchanged.

ALTER TABLE classes ADD COLUMN booking_format TEXT NOT NULL DEFAULT 'STANDARD'
  CHECK (booking_format IN ('STANDARD','BEGINNER_IMPROVER'));

CREATE TABLE class_ticket_products (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL CHECK (product_code IN (
    'BEGINNER_SOCIAL','IMPROVER_SOCIAL','BEGINNER_IMPROVER_SOCIAL','SOCIAL_ONLY'
  )),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  price_pence INTEGER NOT NULL CHECK (price_pence > 0),
  starts_at TEXT,
  ends_at TEXT,
  entry_at TEXT,
  class_pass_eligible INTEGER NOT NULL DEFAULT 0 CHECK (class_pass_eligible IN (0,1)),
  class_pass_credit_cost INTEGER NOT NULL DEFAULT 1 CHECK (class_pass_credit_cost > 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id,product_code),
  CHECK (product_code != 'SOCIAL_ONLY' OR class_pass_eligible = 0)
);

CREATE INDEX idx_class_ticket_products_class_enabled
ON class_ticket_products(class_id,enabled,display_order);

CREATE TABLE class_ticket_product_audit (
  operation_id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_json TEXT NOT NULL,
  next_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_class_ticket_product_audit_class
ON class_ticket_product_audit(class_id,created_at);

CREATE TRIGGER class_ticket_product_audit_no_update
BEFORE UPDATE ON class_ticket_product_audit
BEGIN
  SELECT RAISE(ABORT, 'class ticket product audit is immutable');
END;

CREATE TRIGGER class_ticket_product_audit_no_delete
BEFORE DELETE ON class_ticket_product_audit
BEGIN
  SELECT RAISE(ABORT, 'class ticket product audit is immutable');
END;

ALTER TABLE bookings ADD COLUMN ticket_product_code TEXT CHECK (
  ticket_product_code IS NULL OR ticket_product_code IN (
    'CLASS_SOCIAL','BEGINNER_SOCIAL','IMPROVER_SOCIAL','BEGINNER_IMPROVER_SOCIAL','SOCIAL_ONLY'
  )
);
ALTER TABLE bookings ADD COLUMN ticket_product_label TEXT;
ALTER TABLE bookings ADD COLUMN ticket_unit_price_pence INTEGER CHECK (
  ticket_unit_price_pence IS NULL OR ticket_unit_price_pence >= 0
);
ALTER TABLE bookings ADD COLUMN ticket_starts_at TEXT;
ALTER TABLE bookings ADD COLUMN ticket_ends_at TEXT;
ALTER TABLE bookings ADD COLUMN ticket_entry_at TEXT;

ALTER TABLE booking_holds ADD COLUMN ticket_product_code TEXT CHECK (
  ticket_product_code IS NULL OR ticket_product_code IN (
    'CLASS_SOCIAL','BEGINNER_SOCIAL','IMPROVER_SOCIAL','BEGINNER_IMPROVER_SOCIAL','SOCIAL_ONLY'
  )
);
ALTER TABLE booking_holds ADD COLUMN ticket_product_label TEXT;
ALTER TABLE booking_holds ADD COLUMN ticket_starts_at TEXT;
ALTER TABLE booking_holds ADD COLUMN ticket_ends_at TEXT;
ALTER TABLE booking_holds ADD COLUMN ticket_entry_at TEXT;

ALTER TABLE waiting_list ADD COLUMN ticket_product_code TEXT CHECK (
  ticket_product_code IS NULL OR ticket_product_code IN (
    'CLASS_SOCIAL','BEGINNER_SOCIAL','IMPROVER_SOCIAL','BEGINNER_IMPROVER_SOCIAL','SOCIAL_ONLY'
  )
);
ALTER TABLE waiting_list ADD COLUMN ticket_product_label TEXT;
ALTER TABLE waiting_list ADD COLUMN ticket_starts_at TEXT;
ALTER TABLE waiting_list ADD COLUMN ticket_ends_at TEXT;
ALTER TABLE waiting_list ADD COLUMN ticket_entry_at TEXT;

CREATE INDEX idx_bookings_class_ticket_product
ON bookings(class_id,ticket_product_code);

CREATE INDEX idx_booking_holds_class_ticket_product
ON booking_holds(class_id,ticket_product_code,expires_at);

CREATE INDEX idx_waiting_list_class_ticket_product
ON waiting_list(class_id,ticket_product_code,status);
