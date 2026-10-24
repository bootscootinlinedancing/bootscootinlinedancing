-- Person-level attendance for paid booking leads, optional named guests and
-- complimentary attendees. Existing booking/attendance/loyalty rows are left
-- untouched and continue to use the historical booking-level model.
CREATE TABLE booking_attendees (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id),
  place_number INTEGER,
  role TEXT NOT NULL CHECK(role IN ('LEAD','GUEST','COMPLIMENTARY')),
  snapshot_name TEXT NOT NULL,
  snapshot_email TEXT,
  normalized_email TEXT,
  customer_id TEXT REFERENCES customers(id),
  attendance_status TEXT NOT NULL DEFAULT 'EXPECTED' CHECK(attendance_status IN ('EXPECTED','ATTENDED','CANCELLED')),
  checked_in_at TEXT,
  checked_in_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(
    (role IN ('LEAD','GUEST') AND booking_id IS NOT NULL AND place_number IS NOT NULL AND place_number >= 1)
    OR (role='COMPLIMENTARY' AND booking_id IS NULL AND place_number IS NULL AND customer_id IS NOT NULL)
  ),
  UNIQUE(booking_id,place_number)
);

CREATE INDEX idx_booking_attendees_booking
ON booking_attendees(booking_id,place_number);

CREATE INDEX idx_booking_attendees_class
ON booking_attendees(class_id,attendance_status,role);

CREATE INDEX idx_booking_attendees_customer
ON booking_attendees(customer_id,class_id);

CREATE INDEX idx_booking_attendees_email
ON booking_attendees(normalized_email,class_id);

-- This claim is the database-level person/class idempotency boundary. Multiple
-- attendee snapshots may exist, but one resolved customer can earn at most one
-- attendance-derived loyalty credit for a class.
CREATE TABLE attendee_loyalty_credits (
  id TEXT PRIMARY KEY,
  attendee_id TEXT NOT NULL UNIQUE REFERENCES booking_attendees(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id,customer_id)
);

CREATE INDEX idx_attendee_loyalty_customer
ON attendee_loyalty_credits(customer_id,created_at);

CREATE TABLE booking_attendee_audit (
  id TEXT PRIMARY KEY,
  attendee_id TEXT REFERENCES booking_attendees(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  booking_id TEXT REFERENCES bookings(id),
  customer_id TEXT REFERENCES customers(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  previous_json TEXT,
  next_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_booking_attendee_audit_target
ON booking_attendee_audit(class_id,attendee_id,created_at);

CREATE TRIGGER booking_attendee_audit_no_update
BEFORE UPDATE ON booking_attendee_audit
BEGIN SELECT RAISE(ABORT,'booking attendee audit is immutable'); END;

CREATE TRIGGER booking_attendee_audit_no_delete
BEFORE DELETE ON booking_attendee_audit
BEGIN SELECT RAISE(ABORT,'booking attendee audit is immutable'); END;

CREATE TRIGGER attendee_loyalty_credits_no_update
BEFORE UPDATE ON attendee_loyalty_credits
BEGIN SELECT RAISE(ABORT,'attendee loyalty credits are immutable'); END;

CREATE TRIGGER attendee_loyalty_credits_no_delete
BEFORE DELETE ON attendee_loyalty_credits
BEGIN SELECT RAISE(ABORT,'attendee loyalty credits are immutable'); END;
