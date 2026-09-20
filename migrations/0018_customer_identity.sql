-- Stable, customer-owned email identities. This is deliberately additive and
-- does not backfill historical data: ambiguous legacy matches require review.
CREATE TABLE customer_email_identities (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  normalized_email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RETIRED')),
  verified_at TEXT,
  source TEXT NOT NULL CHECK(source IN ('BOOKING','MEMBER_VERIFICATION','ADMIN')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_email_identities_customer
ON customer_email_identities(customer_id,status,created_at);

CREATE TABLE customer_identity_audit (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  action TEXT NOT NULL,
  normalized_email TEXT,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_customer_identity_audit_customer
ON customer_identity_audit(customer_id,created_at);

CREATE TRIGGER customer_email_identities_no_delete
BEFORE DELETE ON customer_email_identities
BEGIN SELECT RAISE(ABORT,'customer email identities must be retired, not deleted'); END;

CREATE TRIGGER customer_identity_audit_no_update
BEFORE UPDATE ON customer_identity_audit
BEGIN SELECT RAISE(ABORT,'customer identity audit is immutable'); END;

CREATE TRIGGER customer_identity_audit_no_delete
BEFORE DELETE ON customer_identity_audit
BEGIN SELECT RAISE(ABORT,'customer identity audit is immutable'); END;
