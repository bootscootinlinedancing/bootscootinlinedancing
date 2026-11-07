CREATE TABLE event_announcements (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL UNIQUE REFERENCES classes(id) ON DELETE CASCADE,
  announcement_text TEXT NOT NULL,
  emoji TEXT,
  destination_url TEXT NOT NULL,
  starts_at TEXT,
  expires_at TEXT,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  featured INTEGER NOT NULL DEFAULT 0 CHECK(featured IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_event_announcements_visibility
ON event_announcements(enabled,featured,starts_at,expires_at);

INSERT INTO event_announcements(
  id,class_id,announcement_text,emoji,destination_url,starts_at,expires_at,enabled,featured
)
SELECT 'announcement-halloween-2026',id,'Halloween Hoedown · Friday 30 October · Book now','🎃',
       'bookings.html?event=4a5fe2de-52ab-44f5-a0c5-187cd58a13a2',NULL,NULL,1,1
FROM classes WHERE id='4a5fe2de-52ab-44f5-a0c5-187cd58a13a2';

INSERT INTO event_announcements(
  id,class_id,announcement_text,emoji,destination_url,starts_at,expires_at,enabled,featured
)
SELECT 'announcement-anniversary-2026',id,'First Year Anniversary Party · Friday 6 November · Tickets available','🎉',
       'bookings.html?event=6672aa15-7bc6-49eb-a0f6-90db946409f6',NULL,NULL,1,1
FROM classes WHERE id='6672aa15-7bc6-49eb-a0f6-90db946409f6';

INSERT INTO event_announcements(
  id,class_id,announcement_text,emoji,destination_url,starts_at,expires_at,enabled,featured
)
SELECT 'announcement-sunday-sessions-2026',id,'Sunday Sessions · Family Hoedown · Sunday 29 November','🤠',
       'bookings.html?event=sunday-sessions-2026-11-29',NULL,NULL,1,1
FROM classes WHERE id='sunday-sessions-2026-11-29';
