-- Allow one paid booking to contain multiple named competition entrants.
-- The attendee uniqueness constraint continues to prevent duplicate entries.
PRAGMA foreign_keys=OFF;

ALTER TABLE special_event_competitor_message_deliveries
  RENAME TO special_event_competitor_message_deliveries_0035_old;
ALTER TABLE special_event_competition_entries
  RENAME TO special_event_competition_entries_0035_old;

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
  UNIQUE(event_id,attendee_id)
);

INSERT INTO special_event_competition_entries
SELECT * FROM special_event_competition_entries_0035_old;

-- Recover any paid per-attendee add-ons that the former UNIQUE(booking_id)
-- constraint prevented from receiving their own entry row.
INSERT INTO special_event_competition_entries(
  id,event_id,booking_id,admission_booking_id,customer_id,attendee_id,
  contact_email,contact_phone,contact_is_guardian,entry_number,status
)
SELECT
  b.id||':competition:'||d.attendee_index,
  b.event_id,b.id,b.id,b.customer_id,a.id,
  CASE WHEN d.age_at_event<18 THEN d.guardian_email ELSE b.customer_email END,
  CASE WHEN d.age_at_event<18 THEN d.guardian_phone ELSE NULL END,
  CASE WHEN d.age_at_event<18 THEN 1 ELSE 0 END,
  (SELECT COALESCE(MAX(entry_number),0) FROM special_event_competition_entries)
    + ROW_NUMBER() OVER (ORDER BY b.created_at,b.id,d.attendee_index),
  'ENTERED'
FROM special_event_bookings b
JOIN special_event_booking_attendee_drafts d ON d.booking_id=b.id
JOIN special_event_attendees a
  ON a.booking_id=b.id AND a.id=b.id||':attendee:'||d.attendee_index
WHERE b.status='PAID'
  AND d.competition_requested=1
  AND NOT EXISTS(
    SELECT 1 FROM special_event_competition_entries c
    WHERE c.event_id=b.event_id AND c.attendee_id=a.id
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

INSERT INTO special_event_competitor_message_deliveries
SELECT * FROM special_event_competitor_message_deliveries_0035_old;

DROP TABLE special_event_competitor_message_deliveries_0035_old;
DROP TABLE special_event_competition_entries_0035_old;

PRAGMA foreign_keys=ON;
