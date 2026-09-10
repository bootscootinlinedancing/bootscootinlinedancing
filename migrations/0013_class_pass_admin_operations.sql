-- Stage 6: durable idempotency and immutable audit for HQ class-pass administration.
CREATE TABLE IF NOT EXISTS class_pass_admin_operations (
  idempotency_key TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_json TEXT,
  next_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_class_pass_admin_operations_target
ON class_pass_admin_operations(target_type,target_id,created_at);

CREATE TRIGGER IF NOT EXISTS class_pass_admin_operations_no_update
BEFORE UPDATE ON class_pass_admin_operations
BEGIN
  SELECT RAISE(ABORT, 'class pass admin operations are immutable');
END;

CREATE TRIGGER IF NOT EXISTS class_pass_admin_operations_no_delete
BEFORE DELETE ON class_pass_admin_operations
BEGIN
  SELECT RAISE(ABORT, 'class pass admin operations are immutable');
END;
