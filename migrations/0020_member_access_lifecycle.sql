ALTER TABLE member_accounts ADD COLUMN access_state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(access_state IN ('ACTIVE','REVOKED'));
ALTER TABLE member_accounts ADD COLUMN auth_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE member_accounts ADD COLUMN access_changed_at TEXT;
ALTER TABLE member_sessions ADD COLUMN auth_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE member_email_tokens ADD COLUMN auth_generation INTEGER NOT NULL DEFAULT 0;
CREATE TABLE admin_lifecycle_audit (
  operation_id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  customer_id TEXT,
  member_account_id TEXT,
  order_id TEXT,
  reason TEXT NOT NULL CHECK(length(trim(reason))>0),
  request_json TEXT NOT NULL,
  previous_json TEXT NOT NULL,
  next_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER admin_lifecycle_audit_no_update BEFORE UPDATE ON admin_lifecycle_audit
BEGIN SELECT RAISE(ABORT,'admin lifecycle audit is immutable'); END;
CREATE TRIGGER admin_lifecycle_audit_no_delete BEFORE DELETE ON admin_lifecycle_audit
BEGIN SELECT RAISE(ABORT,'admin lifecycle audit is immutable'); END;
