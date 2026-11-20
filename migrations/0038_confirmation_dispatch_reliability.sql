-- Additive only. Preserve every outbox record and previous provider ID.
ALTER TABLE special_event_confirmation_outbox ADD COLUMN claim_id TEXT;
ALTER TABLE special_event_confirmation_outbox ADD COLUMN lease_until TEXT;
ALTER TABLE special_event_confirmation_outbox ADD COLUMN first_attempt_at TEXT;
ALTER TABLE special_event_confirmation_outbox ADD COLUMN payload_json TEXT;
ALTER TABLE special_event_confirmation_outbox ADD COLUMN review_required INTEGER NOT NULL DEFAULT 0 CHECK(review_required IN (0,1));
-- Old ambiguous attempts lack a trustworthy first-attempt time/payload. Never replay blindly.
UPDATE special_event_confirmation_outbox SET review_required=1
WHERE status='SENDING' OR (status='FAILED' AND attempt_count>0);
