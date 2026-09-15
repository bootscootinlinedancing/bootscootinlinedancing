-- Anniversary ticket inventory, guest list and immutable audit history.
-- Additive only: existing classes, bookings and payments remain unchanged.

CREATE TABLE anniversary_events (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL UNIQUE REFERENCES classes(id),
  title TEXT NOT NULL,
  total_capacity INTEGER NOT NULL CHECK(total_capacity > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE anniversary_ticket_releases (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES anniversary_events(id),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_pence INTEGER NOT NULL CHECK(price_pence >= 0),
  allocation INTEGER CHECK(allocation IS NULL OR allocation > 0),
  display_order INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(event_id,display_order)
);

CREATE TABLE anniversary_ticket_adjustments (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES anniversary_events(id),
  release_id TEXT NOT NULL REFERENCES anniversary_ticket_releases(id),
  source TEXT NOT NULL CHECK(source IN ('EVENTBRITE','MANUAL')),
  external_reference TEXT NOT NULL,
  places INTEGER NOT NULL CHECK(places > 0),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source,external_reference)
);

CREATE TABLE anniversary_guest_list (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES anniversary_events(id),
  guest_name TEXT NOT NULL,
  places INTEGER NOT NULL CHECK(places > 0),
  category TEXT NOT NULL CHECK(category IN ('VENDOR','ARTIST_PERFORMER','FRIEND_GUEST','COMPLIMENTARY','OTHER')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE anniversary_audit_log (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES anniversary_events(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_json TEXT,
  next_json TEXT,
  operation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_anniversary_release_event ON anniversary_ticket_releases(event_id,display_order);
CREATE INDEX idx_anniversary_adjustment_event ON anniversary_ticket_adjustments(event_id,status,release_id);
CREATE INDEX idx_anniversary_guest_event ON anniversary_guest_list(event_id,status);
CREATE INDEX idx_anniversary_audit_event ON anniversary_audit_log(event_id,created_at);

CREATE TRIGGER anniversary_audit_no_update BEFORE UPDATE ON anniversary_audit_log
BEGIN SELECT RAISE(ABORT,'anniversary audit history is immutable'); END;
CREATE TRIGGER anniversary_audit_no_delete BEFORE DELETE ON anniversary_audit_log
BEGIN SELECT RAISE(ABORT,'anniversary audit history is immutable'); END;
CREATE TRIGGER anniversary_adjustment_no_delete BEFORE DELETE ON anniversary_ticket_adjustments
BEGIN SELECT RAISE(ABORT,'anniversary ticket records must be cancelled, not deleted'); END;
CREATE TRIGGER anniversary_guest_no_delete BEFORE DELETE ON anniversary_guest_list
BEGIN SELECT RAISE(ABORT,'anniversary guest allocations must be cancelled, not deleted'); END;

ALTER TABLE booking_holds ADD COLUMN anniversary_release_id TEXT REFERENCES anniversary_ticket_releases(id);
ALTER TABLE bookings ADD COLUMN anniversary_release_id TEXT REFERENCES anniversary_ticket_releases(id);
CREATE INDEX idx_booking_holds_anniversary_release ON booking_holds(anniversary_release_id,expires_at);
CREATE INDEX idx_bookings_anniversary_release ON bookings(anniversary_release_id,status);

INSERT INTO anniversary_events(id,class_id,title,total_capacity)
SELECT 'anniversary-2026',id,'Boot Scootin’ Line Dancing — 1 Year Anniversary Party',100
FROM classes
WHERE starts_at>='2026-11-06T00:00:00.000Z'
  AND starts_at<'2026-11-07T00:00:00.000Z'
  AND lower(title) LIKE '%anniversary%'
ORDER BY id LIMIT 1;

INSERT INTO anniversary_ticket_releases(id,event_id,code,name,price_pence,allocation,display_order)
SELECT 'anniversary-2026-early',id,'EARLY_BIRD','Early Bird',700,10,10 FROM anniversary_events WHERE id='anniversary-2026'
UNION ALL SELECT 'anniversary-2026-general',id,'GENERAL_SALE','General Sale',800,10,20 FROM anniversary_events WHERE id='anniversary-2026'
UNION ALL SELECT 'anniversary-2026-final',id,'FINAL_RELEASE','Final Release',1000,NULL,30 FROM anniversary_events WHERE id='anniversary-2026';

-- Preserve existing anniversary bookings and classify the existing £7 website
-- sales as Early Bird inventory. No payment, status or customer field changes.
UPDATE bookings
SET anniversary_release_id='anniversary-2026-early'
WHERE class_id=(SELECT class_id FROM anniversary_events WHERE id='anniversary-2026')
  AND anniversary_release_id IS NULL;

UPDATE booking_holds
SET anniversary_release_id='anniversary-2026-early'
WHERE class_id=(SELECT class_id FROM anniversary_events WHERE id='anniversary-2026')
  AND anniversary_release_id IS NULL;
