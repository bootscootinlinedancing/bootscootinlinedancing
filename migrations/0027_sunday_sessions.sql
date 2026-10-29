-- Additive Sunday Sessions support. Existing classes and bookings are untouched.
ALTER TABLE classes ADD COLUMN special_booking_format TEXT
  CHECK (special_booking_format IS NULL OR special_booking_format='SUNDAY_SESSIONS');

CREATE TABLE sunday_session_booking_details (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id) ON DELETE RESTRICT,
  class_id TEXT NOT NULL REFERENCES classes(id),
  selection_code TEXT NOT NULL CHECK(selection_code IN ('INDIVIDUAL','FAMILY_1A1C','FAMILY_1A2C','FAMILY_2A1C','FAMILY_2A2C')),
  adult_count INTEGER NOT NULL CHECK(adult_count>=0),
  child_10_17_count INTEGER NOT NULL CHECK(child_10_17_count>=0),
  child_5_9_count INTEGER NOT NULL CHECK(child_5_9_count>=0),
  under_5_count INTEGER NOT NULL CHECK(under_5_count>=0),
  total_people INTEGER NOT NULL CHECK(total_people BETWEEN 1 AND 10),
  calculated_amount_pence INTEGER NOT NULL CHECK(calculated_amount_pence>=0),
  price_breakdown_json TEXT NOT NULL CHECK(json_valid(price_breakdown_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(total_people=adult_count+child_10_17_count+child_5_9_count+under_5_count)
);

CREATE TABLE sunday_session_waiting_details (
  waiting_id TEXT PRIMARY KEY REFERENCES waiting_list(id) ON DELETE RESTRICT,
  class_id TEXT NOT NULL REFERENCES classes(id),
  selection_code TEXT NOT NULL CHECK(selection_code IN ('INDIVIDUAL','FAMILY_1A1C','FAMILY_1A2C','FAMILY_2A1C','FAMILY_2A2C')),
  adult_count INTEGER NOT NULL CHECK(adult_count>=0),
  child_10_17_count INTEGER NOT NULL CHECK(child_10_17_count>=0),
  child_5_9_count INTEGER NOT NULL CHECK(child_5_9_count>=0),
  under_5_count INTEGER NOT NULL CHECK(under_5_count>=0),
  total_people INTEGER NOT NULL CHECK(total_people BETWEEN 1 AND 10),
  calculated_amount_pence INTEGER NOT NULL CHECK(calculated_amount_pence>=0),
  price_breakdown_json TEXT NOT NULL CHECK(json_valid(price_breakdown_json)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(total_people=adult_count+child_10_17_count+child_5_9_count+under_5_count)
);

ALTER TABLE booking_attendees ADD COLUMN admission_category TEXT
  CHECK(admission_category IS NULL OR admission_category IN ('ADULT','CHILD_10_17','CHILD_5_9','UNDER_5'));
ALTER TABLE class_guest_list ADD COLUMN sunday_adult_count INTEGER CHECK(sunday_adult_count IS NULL OR sunday_adult_count>=0);
ALTER TABLE class_guest_list ADD COLUMN sunday_child_10_17_count INTEGER CHECK(sunday_child_10_17_count IS NULL OR sunday_child_10_17_count>=0);
ALTER TABLE class_guest_list ADD COLUMN sunday_child_5_9_count INTEGER CHECK(sunday_child_5_9_count IS NULL OR sunday_child_5_9_count>=0);
ALTER TABLE class_guest_list ADD COLUMN sunday_under_5_count INTEGER CHECK(sunday_under_5_count IS NULL OR sunday_under_5_count>=0);

CREATE INDEX idx_sunday_session_details_class ON sunday_session_booking_details(class_id,created_at);
CREATE INDEX idx_sunday_session_waiting_class ON sunday_session_waiting_details(class_id,created_at);

CREATE TRIGGER sunday_session_details_consistent BEFORE INSERT ON sunday_session_booking_details
WHEN NOT EXISTS(
  SELECT 1 FROM bookings b JOIN classes c ON c.id=b.class_id
  WHERE b.id=NEW.booking_id AND b.class_id=NEW.class_id AND c.special_booking_format='SUNDAY_SESSIONS'
    AND b.quantity=NEW.total_people AND b.amount_pence=NEW.calculated_amount_pence
)
BEGIN SELECT RAISE(ABORT,'Sunday booking composition does not match booking quantity/amount'); END;

CREATE TRIGGER sunday_session_waiting_consistent BEFORE INSERT ON sunday_session_waiting_details
WHEN NOT EXISTS(
  SELECT 1 FROM waiting_list w JOIN classes c ON c.id=w.class_id
  WHERE w.id=NEW.waiting_id AND w.class_id=NEW.class_id AND c.special_booking_format='SUNDAY_SESSIONS'
    AND w.quantity=NEW.total_people
)
BEGIN SELECT RAISE(ABORT,'Sunday waiting composition does not match waiting-list quantity'); END;

CREATE TRIGGER sunday_session_details_no_update BEFORE UPDATE ON sunday_session_booking_details
BEGIN SELECT RAISE(ABORT,'Sunday booking composition is immutable'); END;

CREATE TRIGGER sunday_session_details_no_delete BEFORE DELETE ON sunday_session_booking_details
BEGIN SELECT RAISE(ABORT,'Sunday booking composition is immutable'); END;

CREATE TRIGGER sunday_session_waiting_no_update BEFORE UPDATE ON sunday_session_waiting_details
BEGIN SELECT RAISE(ABORT,'Sunday waiting composition is immutable'); END;

CREATE TRIGGER sunday_session_waiting_no_delete BEFORE DELETE ON sunday_session_waiting_details
BEGIN SELECT RAISE(ABORT,'Sunday waiting composition is immutable'); END;

INSERT OR IGNORE INTO classes(
  id,title,venue,location,starts_at,ends_at,price_pence,capacity,status,level,public_notes,poster_url,special_booking_format
) VALUES(
  'sunday-sessions-2026-11-29',
  'Sunday Sessions — Family Hoedown',
  'Low Places Bar Birmingham',
  '60–64 Heath Mill Lane, Deritend, Birmingham B9 4AR',
  '2026-11-29T15:00:00.000Z','2026-11-29T17:00:00.000Z',300,75,'draft','All ages',
  'A family-friendly Sunday afternoon of line dancing, requests and social dancing.\n\nWelcome and warm-up 3:00–3:15pm. Beginner-friendly class 3:15–4:00pm. Short break 4:00–4:10pm. More dancing 4:10–4:40pm. Requests and social dancing 4:40–5:00pm.\n\nNo partner or experience needed. Cowboy boots optional. All attendees, including under-5s, count towards the shared 75-person capacity.',
  '/sunday-sessions-29-november-2026.png','SUNDAY_SESSIONS'
);
