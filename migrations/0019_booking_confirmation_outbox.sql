-- Apply once through the migration runner. No historical confirmation backfill.
CREATE TABLE booking_confirmation_policy (
  id INTEGER PRIMARY KEY CHECK(id=1),
  eligible_paid_from TEXT NOT NULL,
  delivery_enabled INTEGER NOT NULL DEFAULT 0 CHECK(delivery_enabled IN (0,1))
);
INSERT INTO booking_confirmation_policy(id,eligible_paid_from) VALUES(1,CURRENT_TIMESTAMP);
CREATE TABLE booking_confirmation_jobs (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','RETRY','SENT','REVIEW','CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  claim_id TEXT,
  lease_until TEXT,
  first_attempt_at TEXT,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);
CREATE INDEX booking_confirmation_due ON booking_confirmation_jobs(status,next_attempt_at);
CREATE TABLE booking_confirmation_delivery_tests (
  operation_id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','FAILED')),
  provider_id TEXT,
  error_message TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);
CREATE INDEX booking_confirmation_delivery_tests_booking ON booking_confirmation_delivery_tests(booking_id,created_at);
