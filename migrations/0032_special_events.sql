PRAGMA foreign_keys = ON;

-- Reusable special-event domain. This is deliberately separate from classes:
-- regular class bookings and their historical foreign keys are unchanged.
CREATE TABLE special_events (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  subtitle TEXT,
  venue_name TEXT NOT NULL,
  venue_address TEXT,
  venue_notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','CLOSED','CANCELLED')),
  public_summary TEXT,
  public_description TEXT,
  artwork_url TEXT,
  age_terms TEXT,
  age_terms_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(age_terms_confirmed IN (0,1)),
  refund_policy TEXT,
  refund_policy_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(refund_policy_confirmed IN (0,1)),
  max_admission_per_checkout INTEGER NOT NULL DEFAULT 4 CHECK(max_admission_per_checkout BETWEEN 1 AND 20),
  public_presentation_approved INTEGER NOT NULL DEFAULT 0 CHECK(public_presentation_approved IN (0,1)),
  payment_integration_verified INTEGER NOT NULL DEFAULT 0 CHECK(payment_integration_verified IN (0,1)),
  production_installation_verified INTEGER NOT NULL DEFAULT 0 CHECK(production_installation_verified IN (0,1)),
  publication_enabled INTEGER NOT NULL DEFAULT 0 CHECK(publication_enabled IN (0,1)),
  checkout_enabled INTEGER NOT NULL DEFAULT 0 CHECK(checkout_enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE special_event_days (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id) ON DELETE CASCADE,
  event_date TEXT NOT NULL,
  label TEXT NOT NULL,
  capacity INTEGER CHECK(capacity IS NULL OR capacity > 0),
  display_order INTEGER NOT NULL,
  UNIQUE(event_id,event_date),
  UNIQUE(event_id,display_order)
);

CREATE TABLE special_event_programme_items (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id) ON DELETE CASCADE,
  day_id TEXT NOT NULL REFERENCES special_event_days(id) ON DELETE CASCADE,
  item_type TEXT NOT NULL CHECK(item_type IN ('WORKSHOP','SOCIAL','COMPETITION','PERFORMANCE','BREAK','OTHER')),
  title TEXT NOT NULL,
  description TEXT,
  starts_at TEXT,
  ends_at TEXT,
  timing_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(timing_confirmed IN (0,1)),
  display_order INTEGER NOT NULL,
  UNIQUE(day_id,display_order)
);

CREATE TABLE special_event_ticket_products (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  product_type TEXT NOT NULL CHECK(product_type IN ('ADMISSION','ADD_ON')),
  price_pence INTEGER NOT NULL CHECK(price_pence >= 0),
  allocation INTEGER CHECK(allocation IS NULL OR allocation >= 0),
  release_order INTEGER NOT NULL DEFAULT 0,
  release_state TEXT NOT NULL DEFAULT 'INACTIVE' CHECK(release_state IN ('INACTIVE','ACTIVE','SOLD_OUT','CLOSED')),
  auto_activate_after_product_id TEXT REFERENCES special_event_ticket_products(id),
  password_required INTEGER NOT NULL DEFAULT 0 CHECK(password_required IN (0,1)),
  requires_qualifying_admission INTEGER NOT NULL DEFAULT 0 CHECK(requires_qualifying_admission IN (0,1)),
  max_per_checkout INTEGER CHECK(max_per_checkout IS NULL OR max_per_checkout BETWEEN 1 AND 20),
  display_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,code),
  UNIQUE(event_id,display_order)
);

CREATE TABLE special_event_product_days (
  product_id TEXT NOT NULL REFERENCES special_event_ticket_products(id) ON DELETE CASCADE,
  day_id TEXT NOT NULL REFERENCES special_event_days(id) ON DELETE CASCADE,
  places_per_ticket INTEGER NOT NULL DEFAULT 1 CHECK(places_per_ticket BETWEEN 0 AND 10),
  PRIMARY KEY(product_id,day_id)
);

CREATE TABLE special_event_access_credentials (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES special_event_ticket_products(id) ON DELETE CASCADE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  hash_algorithm TEXT NOT NULL DEFAULT 'PBKDF2-SHA256-100000',
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  configured_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  replaced_at TEXT
);
CREATE UNIQUE INDEX idx_special_event_one_active_credential ON special_event_access_credentials(product_id) WHERE active=1;

CREATE TRIGGER special_event_publication_safety_update
BEFORE UPDATE OF status,publication_enabled,checkout_enabled ON special_events
WHEN NEW.status='PUBLISHED' OR NEW.publication_enabled=1 OR NEW.checkout_enabled=1
BEGIN
  SELECT CASE WHEN NEW.age_terms_confirmed<>1 THEN RAISE(ABORT,'special event age terms are unconfirmed') END;
  SELECT CASE WHEN NEW.refund_policy_confirmed<>1 THEN RAISE(ABORT,'special event refund policy is unconfirmed') END;
  SELECT CASE WHEN NEW.public_presentation_approved<>1 THEN RAISE(ABORT,'special event presentation is unapproved') END;
  SELECT CASE WHEN NEW.payment_integration_verified<>1 THEN RAISE(ABORT,'special event payment integration is unverified') END;
  SELECT CASE WHEN NEW.production_installation_verified<>1 THEN RAISE(ABORT,'special event production installation is unverified') END;
  SELECT CASE WHEN NEW.artwork_url IS NULL OR length(trim(NEW.artwork_url))=0 THEN RAISE(ABORT,'special event artwork is missing') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_days WHERE event_id=NEW.id AND capacity IS NULL) THEN RAISE(ABORT,'special event day capacity is unconfirmed') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_ticket_products WHERE event_id=NEW.id AND allocation IS NULL) THEN RAISE(ABORT,'special event ticket allocation is unconfirmed') END;
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM special_event_ticket_products p
    WHERE p.event_id=NEW.id AND p.password_required=1
      AND NOT EXISTS(SELECT 1 FROM special_event_access_credentials c WHERE c.product_id=p.id AND c.active=1)
  ) THEN RAISE(ABORT,'special event restricted release password is unconfigured') END;
END;

CREATE TABLE special_event_holds (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id),
  product_id TEXT NOT NULL REFERENCES special_event_ticket_products(id),
  customer_id TEXT REFERENCES customers(id),
  customer_email TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),
  amount_pence INTEGER NOT NULL CHECK(amount_pence >= 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CONSUMED','EXPIRED','RELEASED')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  idempotency_key TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_special_event_holds_inventory ON special_event_holds(event_id,product_id,status,expires_at);

CREATE TABLE special_event_hold_days (
  hold_id TEXT NOT NULL REFERENCES special_event_holds(id) ON DELETE CASCADE,
  day_id TEXT NOT NULL REFERENCES special_event_days(id),
  places INTEGER NOT NULL CHECK(places >= 0),
  PRIMARY KEY(hold_id,day_id)
);

CREATE TABLE special_event_bookings (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL REFERENCES special_events(id),
  product_id TEXT NOT NULL REFERENCES special_event_ticket_products(id),
  hold_id TEXT UNIQUE REFERENCES special_event_holds(id),
  qualifying_booking_id TEXT REFERENCES special_event_bookings(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),
  product_code_snapshot TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  unit_price_pence_snapshot INTEGER NOT NULL CHECK(unit_price_pence_snapshot >= 0),
  amount_pence INTEGER NOT NULL CHECK(amount_pence >= 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','CANCELLED','FAILED','REFUNDED')),
  payment_provider TEXT NOT NULL DEFAULT 'SUMUP' CHECK(payment_provider IN ('SUMUP','MANUAL','COMPLIMENTARY')),
  provider_checkout_id TEXT,
  provider_transaction_id TEXT,
  secure_token TEXT NOT NULL UNIQUE,
  customer_token TEXT NOT NULL UNIQUE,
  terms_accepted_at TEXT NOT NULL,
  paid_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_special_event_bookings_inventory ON special_event_bookings(event_id,product_id,status);
CREATE INDEX idx_special_event_bookings_customer ON special_event_bookings(customer_id,created_at);

CREATE TABLE special_event_confirmation_outbox (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE REFERENCES special_event_bookings(id),
  event_type TEXT NOT NULL DEFAULT 'SPECIAL_EVENT_BOOKING_PAID',
  status TEXT NOT NULL DEFAULT 'DISABLED' CHECK(status IN ('DISABLED','READY','SENDING','SENT','FAILED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  sent_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE special_event_booking_days (
  booking_id TEXT NOT NULL REFERENCES special_event_bookings(id) ON DELETE CASCADE,
  day_id TEXT NOT NULL REFERENCES special_event_days(id),
  places INTEGER NOT NULL CHECK(places >= 0),
  PRIMARY KEY(booking_id,day_id)
);

CREATE TABLE special_event_attendees (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES special_event_bookings(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id),
  name TEXT NOT NULL,
  email TEXT,
  ticket_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE special_event_attendance (
  attendee_id TEXT NOT NULL REFERENCES special_event_attendees(id),
  day_id TEXT NOT NULL REFERENCES special_event_days(id),
  attended_at TEXT,
  checked_in_by TEXT,
  PRIMARY KEY(attendee_id,day_id)
);

CREATE TABLE special_event_competition_entries (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id),
  booking_id TEXT NOT NULL REFERENCES special_event_bookings(id),
  admission_booking_id TEXT NOT NULL REFERENCES special_event_bookings(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  entry_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ENTERED' CHECK(status IN ('ENTERED','WITHDRAWN','FINALIST','WINNER')),
  result_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,entry_number),
  UNIQUE(booking_id)
);

CREATE TABLE special_event_tasks (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_PROGRESS','BLOCKED','DONE','CANCELLED')),
  due_at TEXT,
  assigned_to TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE special_event_documents (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('CONTRACT','INVOICE','INSURANCE','RISK_ASSESSMENT','TRACKER','ARTWORK','OTHER')),
  current_version INTEGER NOT NULL DEFAULT 0 CHECK(current_version >= 0),
  retention_until TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE special_event_document_versions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES special_event_documents(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(version > 0),
  storage_key TEXT NOT NULL UNIQUE CHECK(storage_key LIKE 'private/special-events/%'),
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 26214400),
  sha256 TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(document_id,version)
);
CREATE TRIGGER special_event_document_versions_immutable_update BEFORE UPDATE ON special_event_document_versions BEGIN
  SELECT RAISE(ABORT,'special event document versions are immutable');
END;
CREATE TRIGGER special_event_document_versions_immutable_delete BEFORE DELETE ON special_event_document_versions BEGIN
  SELECT RAISE(ABORT,'special event document versions are immutable');
END;

CREATE TABLE special_event_activity (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  actor TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_special_event_activity_event ON special_event_activity(event_id,created_at);
CREATE TRIGGER special_event_activity_immutable_update BEFORE UPDATE ON special_event_activity BEGIN
  SELECT RAISE(ABORT,'special event activity is immutable');
END;
CREATE TRIGGER special_event_activity_immutable_delete BEFORE DELETE ON special_event_activity BEGIN
  SELECT RAISE(ABORT,'special event activity is immutable');
END;

-- Draft-only seed. Capacities, several allocations, policies, timings and the
-- loyalty credential remain intentionally unset. Publication guards reject it.
INSERT INTO special_events(id,slug,title,subtitle,venue_name,venue_address,venue_notes,status,public_summary,public_description,max_admission_per_checkout)
VALUES('special-event-johnny-rossato-2027','johnny-rossato','Johnny Rossato — His UK Debut','Kingdom of Fear','Low Places Bar','Digbeth, Birmingham',NULL,'DRAFT','Two days of workshops, dancing and fun!','Join Boot Scootin’ for a friendly two-day workshop and social experience with Johnny Rossato at Low Places Bar. No partner is required. Come for the workshops, stay for the music, dancing and good people.',4);

INSERT INTO special_event_days(id,event_id,event_date,label,capacity,display_order) VALUES
 ('johnny-2027-saturday','special-event-johnny-rossato-2027','2027-02-20','Saturday',NULL,1),
 ('johnny-2027-sunday','special-event-johnny-rossato-2027','2027-02-21','Sunday',NULL,2);

INSERT INTO special_event_ticket_products(id,event_id,code,name,product_type,price_pence,allocation,release_order,release_state,password_required,requires_qualifying_admission,max_per_checkout,display_order) VALUES
 ('johnny-loyalty-weekend','special-event-johnny-rossato-2027','LOYALTY_WEEKEND','Loyalty Weekend Pass','ADMISSION',3500,10,1,'INACTIVE',1,0,4,1),
 ('johnny-early-weekend','special-event-johnny-rossato-2027','EARLY_BIRD_WEEKEND','Early Bird Weekend Pass','ADMISSION',4000,20,2,'INACTIVE',0,0,4,2),
 ('johnny-standard-weekend','special-event-johnny-rossato-2027','STANDARD_WEEKEND','Standard Weekend Pass','ADMISSION',5000,20,3,'INACTIVE',0,0,4,3),
 ('johnny-saturday-experience','special-event-johnny-rossato-2027','SATURDAY_EXPERIENCE','Saturday Experience','ADMISSION',3500,NULL,4,'INACTIVE',0,0,4,4),
 ('johnny-saturday-social','special-event-johnny-rossato-2027','SATURDAY_SOCIAL','Saturday Social & Spectator','ADMISSION',1500,NULL,5,'INACTIVE',0,0,4,5),
 ('johnny-sunday-workshop','special-event-johnny-rossato-2027','SUNDAY_WORKSHOP','Sunday Workshop','ADMISSION',2500,NULL,6,'INACTIVE',0,0,4,6),
 ('johnny-mini-competition','special-event-johnny-rossato-2027','MINI_COMPETITION','Mini Competition Entry','ADD_ON',500,NULL,7,'INACTIVE',0,1,1,7);

UPDATE special_event_ticket_products SET auto_activate_after_product_id='johnny-early-weekend' WHERE id='johnny-standard-weekend';
UPDATE special_event_ticket_products SET description=CASE code
  WHEN 'LOYALTY_WEEKEND' THEN 'Saturday workshops · Saturday evening social · Sunday workshops · Restricted loyalty access.'
  WHEN 'EARLY_BIRD_WEEKEND' THEN 'Saturday workshops · Saturday evening social · Sunday workshops.'
  WHEN 'STANDARD_WEEKEND' THEN 'Saturday workshops · Saturday evening social · Sunday workshops.'
  WHEN 'SATURDAY_EXPERIENCE' THEN 'Saturday workshops · Saturday evening social.'
  WHEN 'SATURDAY_SOCIAL' THEN 'Saturday evening social · Spectator access to the competition.'
  WHEN 'SUNDAY_WORKSHOP' THEN 'Sunday workshops.'
  WHEN 'MINI_COMPETITION' THEN 'Competition entry only · Qualifying Saturday admission required · No independent venue admission.'
END;

INSERT INTO special_event_programme_items(id,event_id,day_id,item_type,title,description,starts_at,ends_at,timing_confirmed,display_order) VALUES
 ('johnny-saturday-workshops','special-event-johnny-rossato-2027','johnny-2027-saturday','WORKSHOP','Line Dancing Workshops with Johnny Rossato','Workshop timings and durations are still to be confirmed.',NULL,NULL,0,1),
 ('johnny-saturday-social','special-event-johnny-rossato-2027','johnny-2027-saturday','SOCIAL','Saturday Evening Social','The Kingdom of Fear Mini Competition will take place at the beginning of the social.',NULL,NULL,0,2),
 ('johnny-saturday-competition','special-event-johnny-rossato-2027','johnny-2027-saturday','COMPETITION','Kingdom of Fear Mini Competition','At the beginning of the Saturday evening social. Further details to be announced.',NULL,NULL,0,3),
 ('johnny-sunday-workshops','special-event-johnny-rossato-2027','johnny-2027-sunday','WORKSHOP','Line Dancing Workshops with Johnny Rossato','Workshop timings and durations are still to be confirmed.',NULL,NULL,0,1);

INSERT INTO special_event_product_days(product_id,day_id,places_per_ticket) VALUES
 ('johnny-loyalty-weekend','johnny-2027-saturday',1),('johnny-loyalty-weekend','johnny-2027-sunday',1),
 ('johnny-early-weekend','johnny-2027-saturday',1),('johnny-early-weekend','johnny-2027-sunday',1),
 ('johnny-standard-weekend','johnny-2027-saturday',1),('johnny-standard-weekend','johnny-2027-sunday',1),
 ('johnny-saturday-experience','johnny-2027-saturday',1),('johnny-saturday-social','johnny-2027-saturday',1),
 ('johnny-sunday-workshop','johnny-2027-sunday',1),('johnny-mini-competition','johnny-2027-saturday',0);

INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key)
VALUES('johnny-draft-seed-activity','special-event-johnny-rossato-2027','EVENT_DRAFT_CREATED','SPECIAL_EVENT','special-event-johnny-rossato-2027','MIGRATION','Owner-approved Draft configuration; publication remains blocked.','migration-0032-johnny-draft-seed');
