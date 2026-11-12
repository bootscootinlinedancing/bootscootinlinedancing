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
 UNIQUE(kind,booking_id)
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
