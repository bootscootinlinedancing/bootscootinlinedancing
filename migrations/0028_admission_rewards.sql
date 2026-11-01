PRAGMA foreign_keys = ON;

-- Reusable, customer-linked complimentary admission rewards.
-- 0026 and 0027 are reserved by the approved Halloween and Sunday Sessions workstreams.
CREATE TABLE admission_reward_programs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  default_admissions INTEGER NOT NULL DEFAULT 1 CHECK(default_admissions BETWEEN 1 AND 100),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  notification_enabled INTEGER NOT NULL DEFAULT 0 CHECK(notification_enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customer_admission_rewards (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES admission_reward_programs(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  member_id TEXT NOT NULL REFERENCES member_accounts(id),
  original_allocation INTEGER NOT NULL CHECK(original_allocation BETWEEN 1 AND 100),
  active_from TEXT NOT NULL,
  original_expires_on TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
  source_type TEXT NOT NULL DEFAULT 'ADMIN' CHECK(source_type IN ('ADMIN','COMPETITION','GOODWILL','OTHER')),
  source_reference TEXT,
  notes TEXT,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(date(active_from) IS NOT NULL),
  CHECK(date(original_expires_on) IS NOT NULL),
  CHECK(date(expires_on) IS NOT NULL),
  CHECK(date(original_expires_on) >= date(active_from)),
  CHECK(date(expires_on) >= date(active_from))
);
CREATE INDEX idx_admission_rewards_customer ON customer_admission_rewards(customer_id,status,expires_on);
CREATE INDEX idx_admission_rewards_member ON customer_admission_rewards(member_id,status,expires_on);

CREATE TABLE admission_reward_class_eligibility (
  program_id TEXT NOT NULL REFERENCES admission_reward_programs(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  eligible INTEGER NOT NULL CHECK(eligible IN (0,1)),
  reason TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(program_id,class_id)
);

CREATE TABLE admission_reward_ticket_eligibility (
  program_id TEXT NOT NULL REFERENCES admission_reward_programs(id) ON DELETE CASCADE,
  ticket_product_code TEXT NOT NULL,
  eligible INTEGER NOT NULL CHECK(eligible IN (0,1)),
  reason TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(program_id,ticket_product_code)
);

CREATE TABLE admission_reward_ledger (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL REFERENCES customer_admission_rewards(id),
  booking_id TEXT REFERENCES bookings(id),
  class_id TEXT REFERENCES classes(id),
  amount INTEGER NOT NULL CHECK(amount <> 0),
  event_type TEXT NOT NULL CHECK(event_type IN ('ALLOCATION','REDEMPTION','RESTORATION','ADMIN_ADJUSTMENT','REVOCATION')),
  reason TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('ADMIN','MEMBER','SYSTEM')),
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_admission_reward_ledger_reward ON admission_reward_ledger(reward_id,created_at);
CREATE UNIQUE INDEX idx_admission_reward_redemption_booking
  ON admission_reward_ledger(booking_id) WHERE event_type='REDEMPTION';

CREATE TRIGGER admission_reward_ledger_immutable_update
BEFORE UPDATE ON admission_reward_ledger BEGIN
  SELECT RAISE(ABORT,'admission reward ledger is immutable');
END;
CREATE TRIGGER admission_reward_ledger_immutable_delete
BEFORE DELETE ON admission_reward_ledger BEGIN
  SELECT RAISE(ABORT,'admission reward ledger is immutable');
END;

CREATE TABLE admission_reward_booking_claims (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL REFERENCES customer_admission_rewards(id),
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  status TEXT NOT NULL CHECK(status IN ('CONFIRMED','RELEASED')),
  redemption_ledger_id TEXT NOT NULL UNIQUE REFERENCES admission_reward_ledger(id),
  restoration_ledger_id TEXT UNIQUE REFERENCES admission_reward_ledger(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT
);
CREATE UNIQUE INDEX idx_admission_reward_one_active_claim_per_class
  ON admission_reward_booking_claims(reward_id,class_id)
  WHERE status='CONFIRMED';

CREATE TABLE admission_reward_audit (
  id TEXT PRIMARY KEY,
  reward_id TEXT REFERENCES customer_admission_rewards(id),
  program_id TEXT REFERENCES admission_reward_programs(id),
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_admission_reward_audit_reward ON admission_reward_audit(reward_id,created_at);
CREATE TRIGGER admission_reward_audit_immutable_update
BEFORE UPDATE ON admission_reward_audit BEGIN
  SELECT RAISE(ABORT,'admission reward audit is immutable');
END;
CREATE TRIGGER admission_reward_audit_immutable_delete
BEFORE DELETE ON admission_reward_audit BEGIN
  SELECT RAISE(ABORT,'admission reward audit is immutable');
END;

CREATE TABLE admission_reward_notifications (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL REFERENCES customer_admission_rewards(id),
  notification_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DISABLED' CHECK(status IN ('DISABLED','READY','SENT','FAILED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

-- A programme exists for configuration, but no customer entitlement or live class
-- eligibility is seeded. Assignment and publication require separate owner action.
INSERT INTO admission_reward_programs(
  id,code,name,description,default_admissions,active,notification_enabled
) VALUES(
  'admission-program-golden-ticket',
  'GOLDEN_TICKET',
  'Golden Ticket',
  'Complimentary class admissions awarded through an owner-approved competition.',
  12,
  1,
  0
);

INSERT INTO admission_reward_ticket_eligibility(
  program_id,ticket_product_code,eligible,reason,updated_by
) VALUES
  ('admission-program-golden-ticket','CLASS_SOCIAL',1,'Owner-approved full class admission only','MIGRATION'),
  ('admission-program-golden-ticket','SOCIAL_ONLY',0,'Social-only admission is excluded','MIGRATION'),
  ('admission-program-golden-ticket','BEGINNER_IMPROVER_SOCIAL',0,'Multi-session tickets require separate approval','MIGRATION');
