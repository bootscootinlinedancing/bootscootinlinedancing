CREATE TABLE class_guest_list (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  guest_name TEXT NOT NULL,
  places INTEGER NOT NULL CHECK(places > 0),
  category TEXT NOT NULL DEFAULT 'GUEST' CHECK(category IN ('GUEST','COMPLIMENTARY','INSTRUCTOR_STAFF','VENDOR','ARTIST_PERFORMER','OTHER')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE class_guest_list_audit (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  guest_id TEXT NOT NULL REFERENCES class_guest_list(id),
  action TEXT NOT NULL CHECK(action IN ('GUEST_ADDED','GUEST_CANCELLED')),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_json TEXT,
  next_json TEXT,
  operation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_class_guest_list_class_status ON class_guest_list(class_id,status,created_at);
CREATE INDEX idx_class_guest_audit_class_created ON class_guest_list_audit(class_id,created_at);

CREATE TRIGGER class_guest_list_no_delete BEFORE DELETE ON class_guest_list
BEGIN SELECT RAISE(ABORT,'class guest records must be cancelled, not deleted'); END;

CREATE TRIGGER class_guest_audit_no_update BEFORE UPDATE ON class_guest_list_audit
BEGIN SELECT RAISE(ABORT,'class guest audit history is immutable'); END;

CREATE TRIGGER class_guest_audit_no_delete BEFORE DELETE ON class_guest_list_audit
BEGIN SELECT RAISE(ABORT,'class guest audit history is immutable'); END;
