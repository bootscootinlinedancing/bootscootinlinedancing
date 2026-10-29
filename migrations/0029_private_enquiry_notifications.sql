-- Durable owner notifications and HQ workflow metadata for private-event enquiries.
-- Existing enquiry lifecycle status remains untouched for quote/payment compatibility.

ALTER TABLE private_event_inquiries ADD COLUMN received_at TEXT;
ALTER TABLE private_event_inquiries ADD COLUMN workflow_status TEXT NOT NULL DEFAULT 'NEW'
  CHECK(workflow_status IN ('NEW','CONTACTED','QUOTED','BOOKED','CLOSED'));
ALTER TABLE private_event_inquiries ADD COLUMN is_unread INTEGER NOT NULL DEFAULT 1
  CHECK(is_unread IN (0,1));
ALTER TABLE private_event_inquiries ADD COLUMN last_contacted_at TEXT;

UPDATE private_event_inquiries
SET received_at = COALESCE(received_at, created_at);

UPDATE private_event_inquiries
SET workflow_status = CASE
  WHEN status IN ('QUOTE_SENT','QUOTE_ACCEPTED','AWAITING_DEPOSIT','BALANCE_DUE') THEN 'QUOTED'
  WHEN status IN ('CONFIRMED_DEPOSIT','CONFIRMED_PAID') THEN 'BOOKED'
  WHEN status IN ('COMPLETED','CANCELLED','DECLINED','EXPIRED') THEN 'CLOSED'
  WHEN status IN ('REVIEWING','CHANGES_REQUESTED','AWAITING_CUSTOMER') THEN 'CONTACTED'
  ELSE 'NEW'
END,
last_contacted_at = CASE WHEN status='NEW_INQUIRY' THEN NULL ELSE updated_at END;

CREATE TABLE private_event_notification_jobs (
  id TEXT PRIMARY KEY,
  inquiry_id TEXT NOT NULL UNIQUE REFERENCES private_event_inquiries(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK(status IN ('PENDING','PROCESSING','RETRY','SENT','FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_error TEXT,
  provider_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

CREATE TABLE private_event_notification_attempts (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES private_event_notification_jobs(id) ON DELETE CASCADE,
  attempt_number INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('SENT','RETRY','FAILED')),
  provider_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(job_id, attempt_number)
);

CREATE INDEX idx_private_event_workflow_received
  ON private_event_inquiries(workflow_status, is_unread, received_at DESC);
CREATE INDEX idx_private_event_notification_due
  ON private_event_notification_jobs(status, next_attempt_at);
