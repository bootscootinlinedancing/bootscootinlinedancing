-- Immutable, provider-authenticated email delivery evidence.
CREATE TABLE email_confirmation_attempts (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  idempotency_key TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  recipient_email TEXT,
  status TEXT NOT NULL DEFAULT 'ACCEPTED',
  accepted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider_id)
);

CREATE TABLE email_delivery_events (
  id TEXT PRIMARY KEY,
  provider_event_id TEXT NOT NULL UNIQUE,
  provider_id TEXT,
  event_type TEXT NOT NULL,
  occurred_at TEXT,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  payload_json TEXT NOT NULL,
  signature_timestamp INTEGER NOT NULL
);

CREATE INDEX email_delivery_events_provider ON email_delivery_events(provider_id,received_at);
CREATE TRIGGER email_confirmation_attempts_immutable_update BEFORE UPDATE ON email_confirmation_attempts BEGIN SELECT RAISE(ABORT,'email confirmation attempts are immutable'); END;
CREATE TRIGGER email_confirmation_attempts_immutable_delete BEFORE DELETE ON email_confirmation_attempts BEGIN SELECT RAISE(ABORT,'email confirmation attempts are immutable'); END;
CREATE TRIGGER email_delivery_events_immutable_update BEFORE UPDATE ON email_delivery_events BEGIN SELECT RAISE(ABORT,'email delivery events are immutable'); END;
CREATE TRIGGER email_delivery_events_immutable_delete BEFORE DELETE ON email_delivery_events BEGIN SELECT RAISE(ABORT,'email delivery events are immutable'); END;
