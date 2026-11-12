-- Additive; does not modify paid bookings or historical outboxes. 0038 belongs to PR77.
CREATE TABLE payment_reconciliation_jobs (
 kind TEXT NOT NULL CHECK(kind IN ('regular','special')), booking_id TEXT NOT NULL,
 checkout_id TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'WAIT' CHECK(state IN ('WAIT','REVIEW','COMPLETE')),
 code TEXT, attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 lease_id TEXT, lease_until TEXT, fulfil_guard INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(kind,booking_id)
);
CREATE INDEX payment_reconciliation_due ON payment_reconciliation_jobs(state,next_attempt_at);
CREATE TABLE verified_payment_claims (
 checkout_id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL UNIQUE,
 kind TEXT NOT NULL, booking_id TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(kind,booking_id),
 FOREIGN KEY(kind,booking_id) REFERENCES payment_reconciliation_jobs(kind,booking_id)
);
-- Atomic capacity guards: active holds other than the booking's own still consume capacity.
CREATE TRIGGER payment_regular_capacity BEFORE UPDATE OF status ON bookings
WHEN NEW.status='PAID' AND OLD.status<>'PAID' AND NEW.payment_provider='SUMUP'
BEGIN
 SELECT CASE WHEN OLD.status<>'PENDING' THEN RAISE(ABORT,'PAYMENT_CANCELLED_OR_FAILED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM classes c WHERE c.id=NEW.class_id AND c.status<>'cancelled'
   AND NEW.quantity+(SELECT COALESCE(SUM(quantity),0) FROM bookings b WHERE b.class_id=c.id AND (b.status='PAID' OR (b.status='PENDING' AND b.payment_provider='MANUAL')))
   +(SELECT COALESCE(SUM(quantity),0) FROM booking_holds h WHERE h.class_id=c.id AND h.id<>COALESCE(NEW.hold_id,'') AND julianday(h.expires_at)>julianday('now'))
   +(SELECT COALESCE(SUM(places),0) FROM class_guest_list g WHERE g.class_id=c.id AND g.status='ACTIVE')<=c.capacity)
 THEN RAISE(ABORT,'PAYMENT_CAPACITY_CONFLICT') END;
END;
CREATE TRIGGER payment_special_capacity BEFORE UPDATE OF status ON special_event_bookings
WHEN NEW.status='PAID' AND OLD.status<>'PAID' AND NEW.payment_provider='SUMUP'
BEGIN
 SELECT CASE WHEN OLD.status<>'PENDING' THEN RAISE(ABORT,'PAYMENT_CANCELLED_OR_FAILED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM special_events WHERE id=NEW.event_id AND status<>'CANCELLED') THEN RAISE(ABORT,'PAYMENT_EVENT_CANCELLED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM special_event_ticket_products WHERE id=NEW.product_id AND event_id=NEW.event_id) THEN RAISE(ABORT,'PAYMENT_PRODUCT_MISMATCH') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_product_days pd WHERE pd.product_id=NEW.product_id AND NOT EXISTS(SELECT 1 FROM special_event_booking_days bd WHERE bd.booking_id=NEW.id AND bd.day_id=pd.day_id AND bd.places=NEW.quantity*pd.places_per_ticket)) OR EXISTS(SELECT 1 FROM special_event_booking_days bd WHERE bd.booking_id=NEW.id AND NOT EXISTS(SELECT 1 FROM special_event_product_days pd WHERE pd.product_id=NEW.product_id AND pd.day_id=bd.day_id AND bd.places=NEW.quantity*pd.places_per_ticket)) THEN RAISE(ABORT,'PAYMENT_DAY_ALLOCATION_MISMATCH') END;
 SELECT CASE WHEN NEW.qualifying_booking_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM special_event_bookings b JOIN special_event_attendees a ON a.booking_id=b.id WHERE b.id=NEW.qualifying_booking_id AND b.event_id=NEW.event_id AND b.status='PAID' AND a.id=NEW.qualifying_attendee_id AND a.status='ACTIVE') THEN RAISE(ABORT,'PAYMENT_QUALIFYING_ADMISSION_REVIEW') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_ticket_products p JOIN special_event_ticket_products mini ON mini.event_id=p.event_id AND mini.code='MINI_COMPETITION' WHERE p.id=NEW.product_id AND mini.allocation IS NOT NULL AND (CASE WHEN p.code='MINI_COMPETITION' THEN NEW.quantity ELSE NEW.competition_quantity END)>0 AND
 (CASE WHEN p.code='MINI_COMPETITION' THEN NEW.quantity ELSE NEW.competition_quantity END)
 +(SELECT COUNT(*) FROM special_event_competition_entries ce JOIN special_event_bookings b ON b.id=ce.booking_id WHERE ce.event_id=NEW.event_id AND ce.status<>'WITHDRAWN' AND b.status='PAID')
 +(SELECT COALESCE(SUM(CASE WHEN hp.code='MINI_COMPETITION' THEN h.quantity ELSE h.competition_quantity END),0) FROM special_event_holds h JOIN special_event_ticket_products hp ON hp.id=h.product_id WHERE h.event_id=NEW.event_id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now'))>mini.allocation) THEN RAISE(ABORT,'PAYMENT_COMPETITION_CAPACITY_CONFLICT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_ticket_products p WHERE p.id=NEW.product_id AND p.allocation IS NOT NULL AND
 NEW.quantity+(SELECT COALESCE(SUM(quantity),0) FROM special_event_bookings b WHERE b.product_id=p.id AND b.status='PAID')+
 (SELECT COALESCE(SUM(quantity),0) FROM special_event_holds h WHERE h.product_id=p.id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now'))>p.allocation)
 THEN RAISE(ABORT,'PAYMENT_PRODUCT_CAPACITY_CONFLICT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_booking_days bd JOIN special_event_days d ON d.id=bd.day_id WHERE bd.booking_id=NEW.id AND d.capacity IS NOT NULL AND
 bd.places+(SELECT COALESCE(SUM(x.places),0) FROM special_event_booking_days x JOIN special_event_bookings b ON b.id=x.booking_id WHERE x.day_id=d.id AND b.status='PAID')+
 (SELECT COALESCE(SUM(x.places),0) FROM special_event_hold_days x JOIN special_event_holds h ON h.id=x.hold_id WHERE x.day_id=d.id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now'))>d.capacity)
 THEN RAISE(ABORT,'PAYMENT_DAY_CAPACITY_CONFLICT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_ticket_products p JOIN special_events e ON e.id=p.event_id WHERE p.id=NEW.product_id AND p.includes_saturday_evening=1 AND e.saturday_evening_capacity IS NOT NULL AND
 NEW.quantity+(SELECT COALESCE(SUM(b.quantity),0) FROM special_event_bookings b JOIN special_event_ticket_products p2 ON p2.id=b.product_id WHERE b.event_id=e.id AND b.status='PAID' AND p2.includes_saturday_evening=1)+
 (SELECT COALESCE(SUM(h.quantity),0) FROM special_event_holds h JOIN special_event_ticket_products p2 ON p2.id=h.product_id WHERE h.event_id=e.id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now') AND p2.includes_saturday_evening=1)>e.saturday_evening_capacity)
 THEN RAISE(ABORT,'PAYMENT_EVENING_CAPACITY_CONFLICT') END;
END;

-- This fence is the first statement of the fulfilment transaction. A concurrent
-- cancellation cannot silently skip PAID yet still create allocations/outbox rows.
CREATE TRIGGER payment_fulfilment_fence BEFORE UPDATE OF fulfil_guard ON payment_reconciliation_jobs
BEGIN
 SELECT CASE WHEN NEW.kind='regular' AND NOT EXISTS(SELECT 1 FROM bookings WHERE id=NEW.booking_id AND status='PENDING') THEN RAISE(ABORT,'PAYMENT_STATE_CHANGED') END;
 SELECT CASE WHEN NEW.kind='special' AND NOT EXISTS(SELECT 1 FROM special_event_bookings WHERE id=NEW.booking_id AND status='PENDING') THEN RAISE(ABORT,'PAYMENT_STATE_CHANGED') END;
END;

CREATE TRIGGER payment_claim_bookings_insert BEFORE INSERT ON bookings
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_checkout_id OR c.transaction_id=NEW.provider_transaction_id) AND (c.kind<>'regular' OR c.booking_id<>NEW.id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

CREATE TRIGGER payment_claim_bookings_update BEFORE UPDATE ON bookings
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_checkout_id OR c.transaction_id=NEW.provider_transaction_id) AND (c.kind<>'regular' OR c.booking_id<>NEW.id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

CREATE TRIGGER payment_claim_special_event_bookings_insert BEFORE INSERT ON special_event_bookings
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_checkout_id OR c.transaction_id=NEW.provider_transaction_id) AND (c.kind<>'special' OR c.booking_id<>NEW.id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

CREATE TRIGGER payment_claim_special_event_bookings_update BEFORE UPDATE ON special_event_bookings
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_checkout_id OR c.transaction_id=NEW.provider_transaction_id) AND (c.kind<>'special' OR c.booking_id<>NEW.id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

CREATE TRIGGER payment_claim_member_passes_insert BEFORE INSERT ON member_passes
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_checkout_id OR c.transaction_id=NEW.provider_transaction_id) AND (c.kind<>'pass' OR c.booking_id<>NEW.id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

CREATE TRIGGER payment_claim_member_passes_update BEFORE UPDATE ON member_passes
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_checkout_id OR c.transaction_id=NEW.provider_transaction_id) AND (c.kind<>'pass' OR c.booking_id<>NEW.id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

CREATE TRIGGER payment_claim_merch_orders_insert BEFORE INSERT ON merch_orders
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_checkout_id OR c.transaction_id=NEW.provider_transaction_id) AND (c.kind<>'merch' OR c.booking_id<>NEW.id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

CREATE TRIGGER payment_claim_merch_orders_update BEFORE UPDATE ON merch_orders
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_checkout_id OR c.transaction_id=NEW.provider_transaction_id) AND (c.kind<>'merch' OR c.booking_id<>NEW.id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

CREATE TRIGGER payment_claim_private_event_payments_insert BEFORE INSERT ON private_event_payments
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_reference OR c.transaction_id=NEW.provider_reference) AND (c.kind<>'private' OR c.booking_id<>NEW.id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

CREATE TRIGGER payment_claim_private_event_payments_update BEFORE UPDATE ON private_event_payments
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_reference OR c.transaction_id=NEW.provider_reference) AND (c.kind<>'private' OR c.booking_id<>NEW.id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

CREATE TRIGGER payment_claim_payments_insert BEFORE INSERT ON payments
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_reference OR c.transaction_id=NEW.provider_reference) AND (c.kind<>'regular' OR c.booking_id<>NEW.booking_id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

CREATE TRIGGER payment_claim_payments_update BEFORE UPDATE ON payments
WHEN EXISTS(SELECT 1 FROM verified_payment_claims c WHERE (c.checkout_id=NEW.provider_reference OR c.transaction_id=NEW.provider_reference) AND (c.kind<>'regular' OR c.booking_id<>NEW.booking_id))
BEGIN SELECT RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM'); END;

-- Recheck ownership at the INSERT, not only before the transaction: an older
-- family callback may have written between the HTTP verification and the batch.
CREATE TRIGGER verified_payment_claim_existing BEFORE INSERT ON verified_payment_claims
BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM bookings WHERE (provider_checkout_id=NEW.checkout_id OR provider_transaction_id=NEW.transaction_id) AND (NEW.kind<>'regular' OR id<>NEW.booking_id)) THEN RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_bookings WHERE (provider_checkout_id=NEW.checkout_id OR provider_transaction_id=NEW.transaction_id) AND (NEW.kind<>'special' OR id<>NEW.booking_id)) THEN RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM member_passes WHERE (provider_checkout_id=NEW.checkout_id OR provider_transaction_id=NEW.transaction_id) AND (NEW.kind<>'pass' OR id<>NEW.booking_id)) THEN RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM merch_orders WHERE (provider_checkout_id=NEW.checkout_id OR provider_transaction_id=NEW.transaction_id) AND (NEW.kind<>'merch' OR id<>NEW.booking_id)) THEN RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM private_event_payments WHERE (provider_reference=NEW.checkout_id OR provider_reference=NEW.transaction_id) AND (NEW.kind<>'private' OR id<>NEW.booking_id)) THEN RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM payments WHERE (provider_reference=NEW.checkout_id OR provider_reference=NEW.transaction_id) AND (NEW.kind<>'regular' OR booking_id<>NEW.booking_id)) THEN RAISE(ABORT,'PAYMENT_DUPLICATE_CLAIM') END;
END;
-- These also protect the flag-off legacy path if cancellation races its batch.
CREATE TRIGGER payment_special_outbox_paid BEFORE INSERT ON special_event_confirmation_outbox
WHEN NOT EXISTS(SELECT 1 FROM special_event_bookings WHERE id=NEW.booking_id AND status='PAID')
BEGIN SELECT RAISE(ABORT,'PAYMENT_STATE_CHANGED'); END;

-- A final statement in the SAME fulfilment batch proves the whole allocation.
CREATE TRIGGER payment_fulfilment_complete BEFORE UPDATE OF state ON payment_reconciliation_jobs
WHEN NEW.state='COMPLETE'
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM verified_payment_claims WHERE kind=NEW.kind AND booking_id=NEW.booking_id) THEN RAISE(ABORT,'PAYMENT_CLAIM_MISSING') END;
 SELECT CASE WHEN NEW.kind='regular' AND NOT EXISTS(
  SELECT 1 FROM bookings b JOIN classes c ON c.id=b.class_id JOIN verified_payment_claims v ON v.kind='regular' AND v.booking_id=b.id
  WHERE b.id=NEW.booking_id AND b.status='PAID' AND v.checkout_id=b.provider_checkout_id AND v.transaction_id=b.provider_transaction_id
  AND EXISTS(SELECT 1 FROM booking_confirmation_jobs WHERE booking_id=b.id)
  AND (SELECT COUNT(*) FROM booking_attendees a WHERE a.booking_id=b.id AND a.attendance_status<>'CANCELLED') BETWEEN 1 AND b.quantity
  AND c.sold=(SELECT COALESCE(SUM(x.quantity),0) FROM bookings x WHERE x.class_id=c.id AND (x.status='PAID' OR (x.status='PENDING' AND x.payment_provider='MANUAL')))
 ) THEN RAISE(ABORT,'PAYMENT_FULFILMENT_INCOMPLETE') END;
 SELECT CASE WHEN NEW.kind='special' AND NOT EXISTS(
  SELECT 1 FROM special_event_bookings b JOIN special_event_ticket_products p ON p.id=b.product_id AND p.event_id=b.event_id JOIN verified_payment_claims v ON v.kind='special' AND v.booking_id=b.id
  WHERE b.id=NEW.booking_id AND b.status='PAID' AND v.checkout_id=b.provider_checkout_id AND v.transaction_id=b.provider_transaction_id
  AND EXISTS(SELECT 1 FROM special_event_confirmation_outbox WHERE booking_id=b.id)
  AND (CASE WHEN p.code='MINI_COMPETITION' THEN b.quantity ELSE b.competition_quantity END)=(SELECT COUNT(*) FROM special_event_competition_entries c WHERE c.booking_id=b.id AND c.status<>'WITHDRAWN')
  AND (p.product_type<>'ADMISSION' OR (b.quantity=(SELECT COUNT(*) FROM special_event_attendees a WHERE a.booking_id=b.id AND a.status='ACTIVE')
    AND NOT EXISTS(SELECT 1 FROM special_event_attendees a JOIN special_event_booking_days bd ON bd.booking_id=b.id AND bd.places>0 WHERE a.booking_id=b.id AND a.status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM special_event_attendance x WHERE x.attendee_id=a.id AND x.day_id=bd.day_id))))
 ) THEN RAISE(ABORT,'PAYMENT_FULFILMENT_INCOMPLETE') END;
END;

-- Anniversary releases also consume recorded external sales and their separate
-- guest list. The generic class capacity alone is insufficient after a hold expires.
CREATE TRIGGER payment_anniversary_capacity BEFORE UPDATE OF status ON bookings
WHEN NEW.status='PAID' AND OLD.status<>'PAID' AND NEW.payment_provider='SUMUP' AND NEW.anniversary_release_id IS NOT NULL
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM anniversary_ticket_releases r JOIN anniversary_events e ON e.id=r.event_id WHERE r.id=NEW.anniversary_release_id AND e.class_id=NEW.class_id AND e.active=1) THEN RAISE(ABORT,'PAYMENT_RELEASE_REVIEW') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM anniversary_ticket_releases r WHERE r.id=NEW.anniversary_release_id AND r.allocation IS NOT NULL AND NEW.quantity
  +(SELECT COALESCE(SUM(quantity),0) FROM bookings b WHERE b.anniversary_release_id=r.id AND (b.status='PAID' OR (b.status='PENDING' AND b.payment_provider='MANUAL')))
  +(SELECT COALESCE(SUM(quantity),0) FROM booking_holds h WHERE h.anniversary_release_id=r.id AND h.id<>COALESCE(NEW.hold_id,'') AND julianday(h.expires_at)>julianday('now'))
  +(SELECT COALESCE(SUM(places),0) FROM anniversary_ticket_adjustments a WHERE a.release_id=r.id AND a.status='ACTIVE')>r.allocation) THEN RAISE(ABORT,'PAYMENT_RELEASE_CAPACITY_CONFLICT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM anniversary_events e WHERE e.class_id=NEW.class_id AND NEW.quantity
  +(SELECT COALESCE(SUM(quantity),0) FROM bookings b WHERE b.class_id=e.class_id AND (b.status='PAID' OR (b.status='PENDING' AND b.payment_provider='MANUAL')))
  +(SELECT COALESCE(SUM(quantity),0) FROM booking_holds h WHERE h.class_id=e.class_id AND h.id<>COALESCE(NEW.hold_id,'') AND julianday(h.expires_at)>julianday('now'))
  +(SELECT COALESCE(SUM(places),0) FROM anniversary_ticket_adjustments a WHERE a.event_id=e.id AND a.status='ACTIVE')
  +(SELECT COALESCE(SUM(places),0) FROM anniversary_guest_list g WHERE g.event_id=e.id AND g.status='ACTIVE')>e.total_capacity) THEN RAISE(ABORT,'PAYMENT_EVENT_CAPACITY_CONFLICT') END;
END;
