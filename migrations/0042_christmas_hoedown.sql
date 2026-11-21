-- Draft calendar seed only. No existing class/booking/customer/payment is updated.
-- Apply ONLY after owner approval. Publication is a separate explicit HQ action.
-- December is GMT: 19:15 on Friday through 01:00 on Saturday.
CREATE TRIGGER IF NOT EXISTS christmas_hoedown_2026_duplicate_guard BEFORE INSERT ON classes
WHEN NEW.id='christmas-hoedown-2026-12-18-low-places'
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM classes c WHERE c.id<>NEW.id AND substr(c.starts_at,1,10)='2026-12-18' AND (lower(c.venue) LIKE '%low places%' OR lower(c.title) LIKE '%christmas%')) THEN RAISE(ABORT,'CHRISTMAS_DUPLICATE_REQUIRES_REVIEW') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM classes c WHERE c.id=NEW.id AND (c.id IS NOT 'christmas-hoedown-2026-12-18-low-places' OR c.title IS NOT 'Boot Scootin’ Christmas Hoedown' OR c.venue IS NOT 'Low Places Bar, Digbeth, Birmingham' OR c.location IS NOT '60–64 Heath Mill Lane, Digbeth, Birmingham, B9 4AR' OR c.starts_at IS NOT '2026-12-18T19:15:00.000Z' OR c.ends_at IS NOT '2026-12-19T01:00:00.000Z' OR c.price_pence IS NOT 800 OR c.capacity IS NOT 50 OR c.level IS NOT 'Christmas social · one hour of tuition' OR c.public_notes IS NOT 'BOOT SCOOTIN’ CHRISTMAS HOEDOWN
Friday 18 December 2026 · Low Places Bar, Digbeth, Birmingham

A Christmas social with ONE HOUR of line dancing tuition — this is not a normal weekly class.

7:15 pm — Saddle Up! Arrivals and get ready for dancing.
7:30–8:30 pm — One hour of line dancing tuition, including Christmas song swaps.
8:30 pm — Santa’s Naughty List: Christmas line dancing elimination challenge.
8:50 pm — Social dancing and requests.
9:00 pm — Bradley Rivers live.
1:00 am Saturday 19 December — Finish.

LAST DANCER STANDING WINS ONE MONTH OF FREE LINE DANCING!

Tickets: £8 per person. One admission option for the Christmas Hoedown. No separate £6 class or £4 social-only ticket is offered.
Capacity: 50 people.

Low Places Bar, 60–64 Heath Mill Lane, Digbeth, Birmingham, B9 4AR.
' OR c.poster_url IS NOT '/christmas-hoedown-18-december-2026.png')) THEN RAISE(ABORT,'CHRISTMAS_EXISTING_ENTRY_DIFFERS') END;
END;
INSERT OR IGNORE INTO classes(id,title,venue,location,starts_at,ends_at,price_pence,capacity,level,public_notes,poster_url,status,booking_format,social_only_enabled,social_only_price_pence,social_only_entry_time,special_booking_format)
VALUES('christmas-hoedown-2026-12-18-low-places','Boot Scootin’ Christmas Hoedown','Low Places Bar, Digbeth, Birmingham','60–64 Heath Mill Lane, Digbeth, Birmingham, B9 4AR','2026-12-18T19:15:00.000Z','2026-12-19T01:00:00.000Z',800,50,'Christmas social · one hour of tuition','BOOT SCOOTIN’ CHRISTMAS HOEDOWN
Friday 18 December 2026 · Low Places Bar, Digbeth, Birmingham

A Christmas social with ONE HOUR of line dancing tuition — this is not a normal weekly class.

7:15 pm — Saddle Up! Arrivals and get ready for dancing.
7:30–8:30 pm — One hour of line dancing tuition, including Christmas song swaps.
8:30 pm — Santa’s Naughty List: Christmas line dancing elimination challenge.
8:50 pm — Social dancing and requests.
9:00 pm — Bradley Rivers live.
1:00 am Saturday 19 December — Finish.

LAST DANCER STANDING WINS ONE MONTH OF FREE LINE DANCING!

Tickets: £8 per person. One admission option for the Christmas Hoedown. No separate £6 class or £4 social-only ticket is offered.
Capacity: 50 people.

Low Places Bar, 60–64 Heath Mill Lane, Digbeth, Birmingham, B9 4AR.
','/christmas-hoedown-18-december-2026.png','draft','STANDARD',0,NULL,NULL,NULL);
INSERT OR IGNORE INTO class_pass_class_eligibility(class_id,eligible,reason,updated_by)
VALUES('christmas-hoedown-2026-12-18-low-places',0,'One £8 Christmas Hoedown admission; no other ticket option approved.','MIGRATION_0042');
