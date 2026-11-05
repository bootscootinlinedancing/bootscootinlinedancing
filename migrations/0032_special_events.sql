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
  promo_video_url TEXT,
  promo_video_title TEXT,
  promo_video_caption TEXT,
  promo_video_poster_url TEXT,
  promo_video_display_enabled INTEGER NOT NULL DEFAULT 0 CHECK(promo_video_display_enabled IN (0,1)),
  saturday_evening_capacity INTEGER CHECK(saturday_evening_capacity IS NULL OR saturday_evening_capacity > 0),
  saturday_evening_capacity_confirmed INTEGER NOT NULL DEFAULT 0 CHECK(saturday_evening_capacity_confirmed IN (0,1)),
  instructor_name TEXT,
  instructor_intro TEXT,
  instructor_biography TEXT,
  instructor_website_url TEXT,
  instructor_photo_url TEXT,
  instructor_photo_caption TEXT,
  programme_approval_status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(programme_approval_status IN ('DRAFT','ARTIST_APPROVED')),
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
  programme_status TEXT NOT NULL DEFAULT 'PROVISIONAL' CHECK(programme_status IN ('PROVISIONAL','CONFIRMED','CANCELLED')),
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
  is_junior INTEGER NOT NULL DEFAULT 0 CHECK(is_junior IN (0,1)),
  requires_guardian INTEGER NOT NULL DEFAULT 0 CHECK(requires_guardian IN (0,1)),
  competition_eligible INTEGER NOT NULL DEFAULT 0 CHECK(competition_eligible IN (0,1)),
  includes_saturday_evening INTEGER NOT NULL DEFAULT 0 CHECK(includes_saturday_evening IN (0,1)),
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
  SELECT CASE WHEN NEW.saturday_evening_capacity IS NULL OR NEW.saturday_evening_capacity_confirmed<>1 THEN RAISE(ABORT,'special event Saturday evening capacity is unconfirmed') END;
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
  competition_quantity INTEGER NOT NULL DEFAULT 0 CHECK(competition_quantity BETWEEN 0 AND 20),
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
  qualifying_attendee_id TEXT REFERENCES special_event_attendees(id),
  issued_by TEXT,
  internal_reason TEXT,
  cancelled_by TEXT,
  cancellation_reason TEXT,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT,
  quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 20),
  product_code_snapshot TEXT NOT NULL,
  product_name_snapshot TEXT NOT NULL,
  unit_price_pence_snapshot INTEGER NOT NULL CHECK(unit_price_pence_snapshot >= 0),
  amount_pence INTEGER NOT NULL CHECK(amount_pence >= 0),
  competition_quantity INTEGER NOT NULL DEFAULT 0 CHECK(competition_quantity BETWEEN 0 AND 20),
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

CREATE TABLE special_event_booking_attendee_drafts (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES special_event_bookings(id) ON DELETE CASCADE,
  attendee_index INTEGER NOT NULL CHECK(attendee_index > 0),
  name TEXT NOT NULL,
  age_at_event INTEGER CHECK(age_at_event IS NULL OR age_at_event BETWEEN 0 AND 120),
  guardian_name TEXT,
  guardian_email TEXT,
  guardian_phone TEXT,
  competition_requested INTEGER NOT NULL DEFAULT 0 CHECK(competition_requested IN (0,1)),
  UNIQUE(booking_id,attendee_index)
);

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
  recipient_email TEXT,
  subject TEXT,
  provider_id TEXT,
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
  age_at_event INTEGER CHECK(age_at_event IS NULL OR age_at_event BETWEEN 0 AND 120),
  guardian_name TEXT,
  guardian_email TEXT,
  guardian_phone TEXT,
  ticket_number TEXT NOT NULL UNIQUE,
  qr_token TEXT NOT NULL UNIQUE,
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
  attendee_id TEXT REFERENCES special_event_attendees(id),
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  contact_is_guardian INTEGER NOT NULL DEFAULT 0 CHECK(contact_is_guardian IN (0,1)),
  entry_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'ENTERED' CHECK(status IN ('ENTERED','WITHDRAWN','FINALIST','WINNER')),
  result_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,entry_number),
  UNIQUE(booking_id),
  UNIQUE(event_id,attendee_id)
);

CREATE TABLE special_event_competitor_messages (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id),
  subject TEXT NOT NULL,
  body_text TEXT NOT NULL,
  recipient_count INTEGER NOT NULL CHECK(recipient_count >= 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','SENDING','SENT','FAILED','CANCELLED')),
  created_by TEXT NOT NULL,
  confirmed_by TEXT,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);

CREATE TABLE special_event_competitor_message_deliveries (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES special_event_competitor_messages(id) ON DELETE CASCADE,
  competition_entry_id TEXT NOT NULL REFERENCES special_event_competition_entries(id),
  recipient_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','SENDING','SENT','FAILED','CANCELLED')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  provider_id TEXT,
  last_error TEXT,
  sent_at TEXT,
  UNIQUE(message_id,recipient_email)
);

CREATE TABLE special_event_media (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK(media_type IN ('PROMO_VIDEO','VIDEO_POSTER','INSTRUCTOR_PHOTO')),
  title TEXT,
  caption TEXT,
  storage_key TEXT NOT NULL UNIQUE CHECK(storage_key LIKE 'private/special-events/%'),
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 104857600),
  sha256 TEXT NOT NULL,
  version INTEGER NOT NULL CHECK(version > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,media_type,version)
);
CREATE UNIQUE INDEX idx_special_event_active_media ON special_event_media(event_id,media_type) WHERE active=1;

CREATE TABLE special_event_media_uploads (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK(media_type IN ('PROMO_VIDEO','VIDEO_POSTER','INSTRUCTOR_PHOTO')),
  storage_key TEXT NOT NULL UNIQUE CHECK(storage_key LIKE 'private/special-events/%'),
  r2_upload_id TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 104857600),
  title TEXT,
  caption TEXT,
  status TEXT NOT NULL DEFAULT 'UPLOADING' CHECK(status IN ('UPLOADING','COMPLETED','ABORTED','FAILED')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE TABLE special_event_choreographies (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES special_events(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  info_url TEXT,
  copperknob_url TEXT,
  bootstepper_url TEXT,
  display_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,display_order)
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
INSERT INTO special_events(id,slug,title,subtitle,venue_name,venue_address,venue_notes,status,public_summary,public_description,saturday_evening_capacity,saturday_evening_capacity_confirmed,max_admission_per_checkout)
VALUES('special-event-johnny-rossato-2027','johnny-rossato','Johnny Rossato — His UK Debut','Kingdom of Fear','Low Places Bar','Digbeth, Birmingham',NULL,'DRAFT','Two days of workshops, dancing and fun!','Join Boot Scootin’ for a friendly two-day workshop and social experience with Johnny Rossato at Low Places Bar. No partner is required. Come for the workshops, stay for the music, dancing and good people.',100,0,4);

UPDATE special_events SET instructor_name='Gianmarco “Johnny” Rossato',instructor_intro='Johnny is a line-dance teacher and choreographer whose journey has taken him from Italy to dance floors in many countries.',instructor_biography='Johnny shares his passion for teaching through clear explanations, careful attention to each step and the joy of dancing.',instructor_website_url='https://www.learnwithjohnny.com/en',programme_approval_status='ARTIST_APPROVED' WHERE id='special-event-johnny-rossato-2027';

INSERT INTO special_event_choreographies(id,event_id,title,info_url,copperknob_url,bootstepper_url,display_order) VALUES
 ('johnny-choreography-kingdom-of-fear','special-event-johnny-rossato-2027','Kingdom of Fear','https://www.copperknob.co.uk/stepsheets/BHQS3WQ/kingdom-of-fear','https://www.copperknob.co.uk/stepsheets/BHQS3WQ/kingdom-of-fear','https://bootstepper.com/dances/D4255K8NC8B2RF7',1),
 ('johnny-choreography-wild-magnolia','special-event-johnny-rossato-2027','Wild Magnolia','https://www.copperknob.co.uk/stepsheets/XNGTVL3/wild-magnolia','https://www.copperknob.co.uk/stepsheets/XNGTVL3/wild-magnolia','https://bootstepper.com/dances/D4B7F6CC222C687',2),
 ('johnny-choreography-bar-none','special-event-johnny-rossato-2027','Bar None','https://www.copperknob.co.uk/stepsheets/Z543GQY/bar-none','https://www.copperknob.co.uk/stepsheets/Z543GQY/bar-none','https://bootstepper.com/dances/D36J5C6F3Q62F3J',3);

INSERT INTO special_event_days(id,event_id,event_date,label,capacity,display_order) VALUES
 ('johnny-2027-saturday','special-event-johnny-rossato-2027','2027-02-20','Saturday workshops',75,1),
 ('johnny-2027-sunday','special-event-johnny-rossato-2027','2027-02-21','Sunday workshops',75,2);

INSERT INTO special_event_ticket_products(id,event_id,code,name,product_type,price_pence,allocation,release_order,release_state,password_required,requires_qualifying_admission,max_per_checkout,display_order) VALUES
 ('johnny-loyalty-weekend','special-event-johnny-rossato-2027','LOYALTY_WEEKEND','Loyal Boot Scooters Weekend Pass','ADMISSION',3500,10,1,'INACTIVE',1,0,4,1),
 ('johnny-early-weekend','special-event-johnny-rossato-2027','EARLY_BIRD_WEEKEND','Early Bird Weekend Pass','ADMISSION',4000,20,2,'INACTIVE',0,0,4,2),
 ('johnny-standard-weekend','special-event-johnny-rossato-2027','STANDARD_WEEKEND','Standard Weekend Pass','ADMISSION',5000,25,3,'INACTIVE',0,0,4,3),
 ('johnny-junior-weekend','special-event-johnny-rossato-2027','JUNIOR_WEEKEND','Junior Weekend Workshop Pass','ADMISSION',2500,10,4,'INACTIVE',0,0,4,4),
 ('johnny-saturday-experience','special-event-johnny-rossato-2027','SATURDAY_EXPERIENCE','Saturday Day Experience','ADMISSION',3500,5,5,'INACTIVE',0,0,4,5),
 ('johnny-sunday-workshop','special-event-johnny-rossato-2027','SUNDAY_WORKSHOP','Sunday Workshop','ADMISSION',2500,5,6,'INACTIVE',0,0,4,6),
 ('johnny-saturday-social','special-event-johnny-rossato-2027','SATURDAY_SOCIAL','Saturday Social & Spectator','ADMISSION',1500,20,7,'INACTIVE',0,0,4,7),
 ('johnny-junior-saturday','special-event-johnny-rossato-2027','JUNIOR_SATURDAY','Junior Saturday Workshop','ADMISSION',1500,5,8,'INACTIVE',0,0,4,8),
 ('johnny-junior-sunday','special-event-johnny-rossato-2027','JUNIOR_SUNDAY','Junior Sunday Workshop','ADMISSION',1500,5,9,'INACTIVE',0,0,4,9),
 ('johnny-mini-competition','special-event-johnny-rossato-2027','MINI_COMPETITION','Mini Competition Entry','ADD_ON',500,25,10,'INACTIVE',0,1,4,10);

-- All configured ticket products open together through the explicit HQ launch action.
-- Loyalty access remains differentiated only by its server-verified password.
UPDATE special_event_ticket_products SET description=CASE code
  WHEN 'LOYALTY_WEEKEND' THEN 'Age 18+ · Saturday workshops · Saturday evening social · Sunday workshops · Restricted loyalty access.'
  WHEN 'EARLY_BIRD_WEEKEND' THEN 'Age 18+ · Saturday workshops · Saturday evening social · Sunday workshops.'
  WHEN 'STANDARD_WEEKEND' THEN 'Age 18+ · Saturday workshops · Saturday evening social · Sunday workshops.'
  WHEN 'JUNIOR_WEEKEND' THEN 'Under 18 · Saturday and Sunday workshops and free dancing · Responsible adult details required · Saturday departure by 8:30 pm · Late-night social not included.'
  WHEN 'SATURDAY_EXPERIENCE' THEN 'Age 18+ · Saturday workshops · Saturday evening social.'
  WHEN 'SATURDAY_SOCIAL' THEN 'Age 18+ · Saturday evening social · Spectator access to the competition.'
  WHEN 'SUNDAY_WORKSHOP' THEN 'Age 18+ · Sunday workshops.'
  WHEN 'JUNIOR_SATURDAY' THEN 'Under 18 · Saturday workshops and free dancing · Responsible adult details required · Departure by 8:30 pm · Late-night social not included.'
  WHEN 'JUNIOR_SUNDAY' THEN 'Under 18 · Sunday workshops and free dancing · Responsible adult details required.'
  WHEN 'MINI_COMPETITION' THEN 'Competition entry only · Qualifying Saturday admission required · No independent venue admission.'
END;

UPDATE special_event_ticket_products SET
  is_junior=CASE WHEN code LIKE 'JUNIOR_%' THEN 1 ELSE 0 END,
  requires_guardian=CASE WHEN code LIKE 'JUNIOR_%' THEN 1 ELSE 0 END,
  competition_eligible=CASE WHEN code IN ('LOYALTY_WEEKEND','EARLY_BIRD_WEEKEND','STANDARD_WEEKEND','JUNIOR_WEEKEND','SATURDAY_EXPERIENCE','JUNIOR_SATURDAY') THEN 1 ELSE 0 END,
  includes_saturday_evening=CASE WHEN code IN ('LOYALTY_WEEKEND','EARLY_BIRD_WEEKEND','STANDARD_WEEKEND','SATURDAY_EXPERIENCE','SATURDAY_SOCIAL') THEN 1 ELSE 0 END;

INSERT INTO special_event_programme_items(id,event_id,day_id,item_type,title,description,starts_at,ends_at,timing_confirmed,display_order) VALUES
 ('johnny-sat-registration','special-event-johnny-rossato-2027','johnny-2027-saturday','OTHER','Doors and registration','Provisional schedule.','2027-02-20T11:00:00','2027-02-20T11:30:00',0,1),
 ('johnny-sat-beginner','special-event-johnny-rossato-2027','johnny-2027-saturday','WORKSHOP','Beginner / Low Improver workshop','Provisional schedule.','2027-02-20T11:30:00','2027-02-20T12:30:00',0,2),
 ('johnny-sat-free-1','special-event-johnny-rossato-2027','johnny-2027-saturday','SOCIAL','Free dancing','Provisional schedule.','2027-02-20T12:30:00','2027-02-20T13:00:00',0,3),
 ('johnny-sat-intermediate','special-event-johnny-rossato-2027','johnny-2027-saturday','WORKSHOP','Intermediate workshop','Provisional schedule.','2027-02-20T13:00:00','2027-02-20T14:00:00',0,4),
 ('johnny-sat-free-2','special-event-johnny-rossato-2027','johnny-2027-saturday','SOCIAL','Free dancing','Provisional schedule.','2027-02-20T14:00:00','2027-02-20T14:30:00',0,5),
 ('johnny-sat-advanced','special-event-johnny-rossato-2027','johnny-2027-saturday','WORKSHOP','High Intermediate / Advanced workshop','Provisional schedule.','2027-02-20T14:30:00','2027-02-20T15:30:00',0,6),
 ('johnny-sat-free-3','special-event-johnny-rossato-2027','johnny-2027-saturday','SOCIAL','Free dancing','Provisional schedule.','2027-02-20T15:30:00','2027-02-20T16:00:00',0,7),
 ('johnny-sat-kingdom-workshop','special-event-johnny-rossato-2027','johnny-2027-saturday','WORKSHOP','Kingdom of Fear full workshop / refresher-styling — format TBC','The exact teaching format remains to be confirmed.','2027-02-20T16:00:00','2027-02-20T17:00:00',0,8),
 ('johnny-sat-break','special-event-johnny-rossato-2027','johnny-2027-saturday','BREAK','Break and refreshments','Two-hour break and refreshments.','2027-02-20T17:00:00','2027-02-20T19:00:00',1,9),
 ('johnny-sat-comp-registration','special-event-johnny-rossato-2027','johnny-2027-saturday','COMPETITION','Competition registration','Provisional schedule.','2027-02-20T19:00:00','2027-02-20T19:30:00',0,10),
 ('johnny-sat-competition','special-event-johnny-rossato-2027','johnny-2027-saturday','COMPETITION','Kingdom of Fear Mini Competition — duration TBC','At the beginning of the Saturday evening social; exact duration remains to be confirmed.','2027-02-20T19:30:00','2027-02-20T20:00:00',0,11),
 ('johnny-sat-awards','special-event-johnny-rossato-2027','johnny-2027-saturday','COMPETITION','Proposed awards','Awards remain provisional.','2027-02-20T20:00:00','2027-02-20T20:15:00',0,12),
 ('johnny-sat-under18','special-event-johnny-rossato-2027','johnny-2027-saturday','OTHER','Under-18s leave — subject to venue confirmation','Venue confirmation is required.','2027-02-20T20:30:00',NULL,0,13),
 ('johnny-sat-social','special-event-johnny-rossato-2027','johnny-2027-saturday','SOCIAL','Evening social — finish TBC','Provisional finish time.','2027-02-20T20:30:00','2027-02-21T01:00:00',0,14),
 ('johnny-sun-registration','special-event-johnny-rossato-2027','johnny-2027-sunday','OTHER','Doors and registration','Provisional schedule.','2027-02-21T12:00:00','2027-02-21T12:30:00',0,1),
 ('johnny-sun-workshop-1','special-event-johnny-rossato-2027','johnny-2027-sunday','WORKSHOP','Workshop 1 — dance TBC','Provisional schedule.','2027-02-21T12:30:00','2027-02-21T13:30:00',0,2),
 ('johnny-sun-free-1','special-event-johnny-rossato-2027','johnny-2027-sunday','SOCIAL','Free dancing','Provisional schedule.','2027-02-21T13:30:00','2027-02-21T14:00:00',0,3),
 ('johnny-sun-workshop-2','special-event-johnny-rossato-2027','johnny-2027-sunday','WORKSHOP','Workshop 2 — dance TBC','Provisional schedule.','2027-02-21T14:00:00','2027-02-21T15:00:00',0,4),
 ('johnny-sun-free-2','special-event-johnny-rossato-2027','johnny-2027-sunday','SOCIAL','Free dancing','Provisional schedule.','2027-02-21T15:00:00','2027-02-21T15:30:00',0,5),
 ('johnny-sun-workshop-3','special-event-johnny-rossato-2027','johnny-2027-sunday','WORKSHOP','Workshop 3 — dance TBC','Provisional schedule.','2027-02-21T15:30:00','2027-02-21T16:30:00',0,6),
 ('johnny-sun-recap','special-event-johnny-rossato-2027','johnny-2027-sunday','SOCIAL','Optional recap / social dancing','Provisional schedule.','2027-02-21T16:30:00','2027-02-21T17:00:00',0,7),
 ('johnny-sun-finish','special-event-johnny-rossato-2027','johnny-2027-sunday','OTHER','Proposed finish — TBC','The proposed 5:00 pm finish remains to be confirmed.','2027-02-21T17:00:00',NULL,0,8);

UPDATE special_event_programme_items SET timing_confirmed=1,programme_status='CONFIRMED'
WHERE event_id='special-event-johnny-rossato-2027'
  AND id NOT IN ('johnny-sat-kingdom-workshop','johnny-sat-competition','johnny-sat-awards','johnny-sat-under18','johnny-sat-social','johnny-sun-workshop-1','johnny-sun-workshop-2','johnny-sun-workshop-3','johnny-sun-recap','johnny-sun-finish');

INSERT INTO special_event_product_days(product_id,day_id,places_per_ticket) VALUES
 ('johnny-loyalty-weekend','johnny-2027-saturday',1),('johnny-loyalty-weekend','johnny-2027-sunday',1),
 ('johnny-early-weekend','johnny-2027-saturday',1),('johnny-early-weekend','johnny-2027-sunday',1),
 ('johnny-standard-weekend','johnny-2027-saturday',1),('johnny-standard-weekend','johnny-2027-sunday',1),
 ('johnny-junior-weekend','johnny-2027-saturday',1),('johnny-junior-weekend','johnny-2027-sunday',1),
 ('johnny-saturday-experience','johnny-2027-saturday',1),('johnny-saturday-social','johnny-2027-saturday',1),
 ('johnny-sunday-workshop','johnny-2027-sunday',1),
 ('johnny-junior-saturday','johnny-2027-saturday',1),('johnny-junior-sunday','johnny-2027-sunday',1),
 ('johnny-mini-competition','johnny-2027-saturday',0);

INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key)
VALUES('johnny-draft-seed-activity','special-event-johnny-rossato-2027','EVENT_DRAFT_CREATED','SPECIAL_EVENT','special-event-johnny-rossato-2027','MIGRATION','Owner-approved Draft configuration; publication remains blocked.','migration-0032-johnny-draft-seed');
