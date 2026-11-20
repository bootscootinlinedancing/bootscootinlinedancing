-- Additive. Never rerun 0034 policy seeds. Retain these tables/views on rollback.
CREATE TABLE event_change_requests(
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES special_event_bookings(id),
 kind TEXT NOT NULL CHECK(kind IN ('CANCELLATION','REFUND','TRANSFER')),
 status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','NEEDS_INFORMATION','APPROVED','DECLINED','COMPLETED')),
 reason TEXT NOT NULL DEFAULT '', requested_refund_pence INTEGER CHECK(requested_refund_pence>=0),
 cancellation_state TEXT NOT NULL DEFAULT 'NONE' CHECK(cancellation_state IN ('NONE','REQUESTED','COMMITTED')),
 transfer_state TEXT NOT NULL DEFAULT 'NONE' CHECK(transfer_state IN ('NONE','REQUESTED','COMMITTED')),
 version INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, closed_at TEXT,
 submission_key TEXT NOT NULL UNIQUE, submission_hash TEXT NOT NULL
);
CREATE TABLE event_change_items(
 request_id TEXT NOT NULL REFERENCES event_change_requests(id), attendee_id TEXT NOT NULL REFERENCES special_event_attendees(id),
 replacement_name TEXT, replacement_email TEXT, replacement_age INTEGER CHECK(replacement_age BETWEEN 0 AND 120),
 guardian_name TEXT,guardian_email TEXT,guardian_phone TEXT,
 PRIMARY KEY(request_id,attendee_id)
);
CREATE TABLE event_admission_lineage(
 attendee_id TEXT PRIMARY KEY REFERENCES special_event_attendees(id),
 root_attendee_id TEXT NOT NULL REFERENCES special_event_attendees(id),
 previous_attendee_id TEXT NOT NULL UNIQUE REFERENCES special_event_attendees(id),
 request_id TEXT NOT NULL REFERENCES event_change_requests(id)
);
CREATE TABLE event_admission_releases(
 root_attendee_id TEXT PRIMARY KEY REFERENCES special_event_attendees(id),
 attendee_id TEXT NOT NULL UNIQUE REFERENCES special_event_attendees(id),
 request_id TEXT NOT NULL REFERENCES event_change_requests(id),
 released_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE event_change_operations(
 id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES event_change_requests(id), expected_version INTEGER NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('NEEDS_INFORMATION','DECLINE','APPROVE','CANCEL','TRANSFER','COMPLETE')),
 actor TEXT NOT NULL, reason TEXT NOT NULL CHECK(length(trim(reason))>0), customer_message TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE event_management_notifications(
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES special_event_bookings(id), recipient_email TEXT NOT NULL,
 kind TEXT NOT NULL, payload_json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'READY' CHECK(status IN ('READY','SENDING','SENT','RETRY','UNKNOWN_REVIEW')),
 attempts INTEGER NOT NULL DEFAULT 0, lease_id TEXT, leased_at TEXT, provider_id TEXT, next_attempt_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, sent_at TEXT
);
CREATE TABLE event_capacity_releases(
 request_id TEXT PRIMARY KEY REFERENCES event_change_requests(id), event_id TEXT NOT NULL REFERENCES special_events(id),
 processed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE event_refund_operations(
 id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES event_change_requests(id), booking_id TEXT NOT NULL REFERENCES special_event_bookings(id),
 amount_pence INTEGER NOT NULL CHECK(amount_pence>0), author TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'AUTHORISED' CHECK(status IN ('AUTHORISED','STARTED','UNKNOWN_REVIEW','CONFIRMED','DECLINED')),
 transaction_id TEXT NOT NULL, merchant_code TEXT NOT NULL, provider_refund_id TEXT UNIQUE,
 baseline_refunded_pence INTEGER, provider_confirmed_pence INTEGER, authorised_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 started_at TEXT,confirmed_at TEXT
);
CREATE UNIQUE INDEX event_one_unresolved_refund ON event_refund_operations(booking_id) WHERE status IN ('AUTHORISED','STARTED','UNKNOWN_REVIEW');
CREATE TABLE event_evidence(
 id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES event_change_requests(id), object_key TEXT NOT NULL UNIQUE,
 media_type TEXT NOT NULL CHECK(media_type IN ('application/pdf','image/jpeg','image/png')), bytes INTEGER NOT NULL CHECK(bytes BETWEEN 1 AND 5242880),
 sha256 TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'QUARANTINED' CHECK(state IN ('QUARANTINED','CLEAN','REJECTED','DELETE_PENDING','DELETED')),
 legal_hold INTEGER NOT NULL DEFAULT 0 CHECK(legal_hold IN(0,1)), scan_reference TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,deleted_at TEXT
);
CREATE TRIGGER event_evidence_limit BEFORE INSERT ON event_evidence BEGIN
 SELECT CASE WHEN (SELECT count(*) FROM event_evidence WHERE request_id=NEW.request_id AND state<>'DELETED')>=3 THEN RAISE(ABORT,'EVIDENCE_LIMIT') END;
END;
CREATE TABLE event_management_sessions(
 token_hash TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES special_event_bookings(id), expires_at TEXT NOT NULL
);
CREATE TABLE event_management_challenges(
 id TEXT PRIMARY KEY, booking_id TEXT NOT NULL REFERENCES special_event_bookings(id), code_hash TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0, expires_at TEXT NOT NULL, consumed_at TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX event_management_challenge_rate ON event_management_challenges(booking_id,created_at);
-- Missing fulfilment is NOT released capacity. Only explicit committed releases count.
CREATE VIEW event_effective_bookings AS
 SELECT b.*,b.quantity-(SELECT count(*) FROM event_admission_releases r JOIN special_event_attendees a ON a.id=r.root_attendee_id WHERE a.booking_id=b.id) AS effective_quantity
 FROM special_event_bookings b;
CREATE VIEW event_effective_booking_days AS
 SELECT bd.booking_id,bd.day_id,bd.places AS original_places,
 bd.places-(SELECT count(*) FROM event_admission_releases r JOIN special_event_attendees a ON a.id=r.root_attendee_id WHERE a.booking_id=bd.booking_id)*(bd.places/b.quantity) AS places
 FROM special_event_booking_days bd JOIN special_event_bookings b ON b.id=bd.booking_id;
CREATE VIEW event_effective_attendees AS
 SELECT a.* FROM special_event_attendees a JOIN special_event_bookings b ON b.id=a.booking_id
 WHERE a.status='ACTIVE' AND b.status='PAID'
 AND NOT EXISTS(SELECT 1 FROM event_admission_releases r WHERE r.root_attendee_id=coalesce((SELECT root_attendee_id FROM event_admission_lineage WHERE attendee_id=a.id),a.id));
CREATE TRIGGER event_release_validate BEFORE INSERT ON event_admission_releases BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM event_effective_attendees a WHERE a.id=NEW.attendee_id AND coalesce((SELECT root_attendee_id FROM event_admission_lineage WHERE attendee_id=a.id),a.id)=NEW.root_attendee_id) THEN RAISE(ABORT,'INVALID_ADMISSION') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_attendance WHERE attendee_id=NEW.attendee_id AND attended_at IS NOT NULL) THEN RAISE(ABORT,'ADMISSION_ALREADY_USED') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_booking_days bd JOIN special_event_attendees a ON a.booking_id=bd.booking_id JOIN special_event_bookings b ON b.id=bd.booking_id WHERE a.id=NEW.attendee_id AND bd.places % b.quantity<>0) THEN RAISE(ABORT,'AMBIGUOUS_DAY_ALLOCATION') END;
END;
CREATE TRIGGER event_no_released_checkin BEFORE UPDATE OF attended_at ON special_event_attendance WHEN NEW.attended_at IS NOT NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM event_effective_attendees WHERE id=NEW.attendee_id) THEN RAISE(ABORT,'INVALID_ADMISSION') END;
END;
CREATE TRIGGER event_operation_validate BEFORE INSERT ON event_change_operations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM event_change_requests WHERE id=NEW.request_id AND version=NEW.expected_version AND status NOT IN ('DECLINED','COMPLETED')) THEN RAISE(ABORT,'STALE_REQUEST') END;
 SELECT CASE WHEN NEW.action IN ('DECLINE','NEEDS_INFORMATION') AND EXISTS(SELECT 1 FROM event_change_requests WHERE id=NEW.request_id AND (cancellation_state='COMMITTED' OR transfer_state='COMMITTED')) THEN RAISE(ABORT,'OPERATION_ALREADY_COMMITTED') END;
 SELECT CASE WHEN NEW.action IN ('CANCEL','TRANSFER') AND NOT EXISTS(SELECT 1 FROM event_change_requests WHERE id=NEW.request_id AND status='APPROVED' AND kind=CASE WHEN NEW.action='CANCEL' THEN 'CANCELLATION' ELSE 'TRANSFER' END) THEN RAISE(ABORT,'APPROVAL_REQUIRED') END;
 SELECT CASE WHEN NEW.action IN ('CANCEL','TRANSFER') AND NOT EXISTS(SELECT 1 FROM event_change_items WHERE request_id=NEW.request_id) THEN RAISE(ABORT,'NO_ATTENDEES') END;
 SELECT CASE WHEN NEW.action IN ('CANCEL','TRANSFER') AND EXISTS(SELECT 1 FROM event_change_items i JOIN event_change_requests r ON r.id=i.request_id LEFT JOIN event_effective_attendees a ON a.id=i.attendee_id AND a.booking_id=r.booking_id WHERE i.request_id=NEW.request_id AND (a.id IS NULL OR EXISTS(SELECT 1 FROM special_event_attendance x WHERE x.attendee_id=a.id AND x.attended_at IS NOT NULL))) THEN RAISE(ABORT,'INVALID_OR_USED_ADMISSION') END;
 SELECT CASE WHEN NEW.action='TRANSFER' AND EXISTS(SELECT 1 FROM event_change_items i JOIN special_event_attendees a ON a.id=i.attendee_id WHERE i.request_id=NEW.request_id AND (length(trim(coalesce(i.replacement_name,'')))=0 OR i.replacement_age IS NULL OR (a.age_at_event<18)<>(i.replacement_age<18) OR (i.replacement_age<18 AND (coalesce(i.guardian_name,'')='' OR coalesce(i.guardian_email,'')='' OR coalesce(i.guardian_phone,'')='')))) THEN RAISE(ABORT,'TRANSFER_ELIGIBILITY') END;
 SELECT CASE WHEN NEW.action='COMPLETE' AND EXISTS(SELECT 1 FROM event_change_requests WHERE id=NEW.request_id AND (status<>'APPROVED' OR (kind='CANCELLATION' AND cancellation_state<>'COMMITTED') OR (kind='TRANSFER' AND transfer_state<>'COMMITTED') OR (kind='REFUND' AND NOT EXISTS(SELECT 1 FROM event_refund_operations WHERE request_id=NEW.request_id AND status='CONFIRMED')))) THEN RAISE(ABORT,'OPERATION_INCOMPLETE') END;
END;
CREATE TRIGGER event_operation_apply AFTER INSERT ON event_change_operations BEGIN
 INSERT INTO event_admission_releases(root_attendee_id,attendee_id,request_id)
 SELECT coalesce(l.root_attendee_id,a.id),a.id,NEW.request_id FROM event_change_items i JOIN special_event_attendees a ON a.id=i.attendee_id LEFT JOIN event_admission_lineage l ON l.attendee_id=a.id WHERE i.request_id=NEW.request_id AND NEW.action='CANCEL';
 UPDATE special_event_competition_entries SET status='WITHDRAWN' WHERE attendee_id IN(SELECT attendee_id FROM event_change_items WHERE request_id=NEW.request_id) AND NEW.action='CANCEL';
 UPDATE special_event_attendees SET status='CANCELLED' WHERE id IN(SELECT attendee_id FROM event_change_items WHERE request_id=NEW.request_id) AND NEW.action IN('CANCEL','TRANSFER');
 INSERT INTO special_event_attendees(id,booking_id,customer_id,name,email,age_at_event,guardian_name,guardian_email,guardian_phone,ticket_number,qr_token)
 SELECT NEW.id||':'||a.id,a.booking_id,a.customer_id,i.replacement_name,i.replacement_email,i.replacement_age,i.guardian_name,i.guardian_email,i.guardian_phone,a.ticket_number||':T:'||NEW.id,lower(hex(randomblob(32))) FROM event_change_items i JOIN special_event_attendees a ON a.id=i.attendee_id WHERE i.request_id=NEW.request_id AND NEW.action='TRANSFER';
 INSERT INTO event_admission_lineage(attendee_id,root_attendee_id,previous_attendee_id,request_id)
 SELECT NEW.id||':'||a.id,coalesce(l.root_attendee_id,a.id),a.id,NEW.request_id FROM event_change_items i JOIN special_event_attendees a ON a.id=i.attendee_id LEFT JOIN event_admission_lineage l ON l.attendee_id=a.id WHERE i.request_id=NEW.request_id AND NEW.action='TRANSFER';
 INSERT INTO special_event_attendance(attendee_id,day_id)
 SELECT NEW.id||':'||x.attendee_id,x.day_id FROM special_event_attendance x JOIN event_change_items i ON i.attendee_id=x.attendee_id WHERE i.request_id=NEW.request_id AND NEW.action='TRANSFER';
 UPDATE special_event_competition_entries SET attendee_id=NEW.id||':'||attendee_id WHERE attendee_id IN(SELECT attendee_id FROM event_change_items WHERE request_id=NEW.request_id) AND NEW.action='TRANSFER';
 INSERT INTO event_capacity_releases(request_id,event_id) SELECT r.id,b.event_id FROM event_change_requests r JOIN special_event_bookings b ON b.id=r.booking_id WHERE r.id=NEW.request_id AND NEW.action='CANCEL';
 UPDATE event_change_requests SET version=version+1,status=CASE NEW.action WHEN 'APPROVE' THEN 'APPROVED' WHEN 'DECLINE' THEN 'DECLINED' WHEN 'NEEDS_INFORMATION' THEN 'NEEDS_INFORMATION' WHEN 'COMPLETE' THEN 'COMPLETED' ELSE status END,
 cancellation_state=CASE WHEN NEW.action='CANCEL' THEN 'COMMITTED' ELSE cancellation_state END,transfer_state=CASE WHEN NEW.action='TRANSFER' THEN 'COMMITTED' ELSE transfer_state END,
 closed_at=CASE WHEN NEW.action IN('DECLINE','COMPLETE') THEN CURRENT_TIMESTAMP ELSE closed_at END WHERE id=NEW.request_id;
 INSERT INTO special_event_activity(id,event_id,action,target_type,target_id,actor,reason,idempotency_key)
 SELECT NEW.id,b.event_id,'CUSTOMER_REQUEST_'||NEW.action,'CHANGE_REQUEST',r.id,NEW.actor,'Owner decision recorded; private request details remain in the restricted portal.',NEW.id FROM event_change_requests r JOIN special_event_bookings b ON b.id=r.booking_id WHERE r.id=NEW.request_id;
 INSERT INTO event_management_notifications(id,booking_id,recipient_email,kind,payload_json)
 SELECT NEW.id,b.id,b.customer_email,'REQUEST_DECISION',json_object('request_id',r.id,'status',r.status,'action',NEW.action) FROM event_change_requests r JOIN special_event_bookings b ON b.id=r.booking_id WHERE r.id=NEW.request_id;
 INSERT INTO event_management_notifications(id,booking_id,recipient_email,kind,payload_json)
 SELECT NEW.id||':replacement:'||i.attendee_id,r.booking_id,i.replacement_email,'TRANSFER_COMPLETED',json_object('request_id',r.id) FROM event_change_items i JOIN event_change_requests r ON r.id=i.request_id WHERE i.request_id=NEW.request_id AND NEW.action='TRANSFER' AND coalesce(i.replacement_email,'')<>'';
END;
CREATE TRIGGER event_refund_authorise BEFORE INSERT ON event_refund_operations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM event_change_requests r JOIN special_event_bookings b ON b.id=r.booking_id WHERE r.id=NEW.request_id AND r.booking_id=NEW.booking_id AND r.status='APPROVED' AND b.payment_provider='SUMUP' AND b.provider_transaction_id=NEW.transaction_id AND b.paid_at IS NOT NULL AND NEW.amount_pence<=b.amount_pence-coalesce((SELECT sum(amount_pence) FROM event_refund_operations WHERE booking_id=b.id AND status<>'DECLINED'),0)) THEN RAISE(ABORT,'REFUND_NOT_AUTHORISED') END;
END;
CREATE TRIGGER event_release_immutable_update BEFORE UPDATE ON event_admission_releases BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RELEASE'); END;
CREATE TRIGGER event_release_immutable_delete BEFORE DELETE ON event_admission_releases BEGIN SELECT RAISE(ABORT,'IMMUTABLE_RELEASE'); END;
CREATE TRIGGER event_operation_immutable_update BEFORE UPDATE ON event_change_operations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_OPERATION'); END;
CREATE TRIGGER event_operation_immutable_delete BEFORE DELETE ON event_change_operations BEGIN SELECT RAISE(ABORT,'IMMUTABLE_OPERATION'); END;

-- Supersedes only PR80 special-event capacity guard; regular payment guards unchanged.
DROP TRIGGER IF EXISTS payment_special_capacity;
CREATE TRIGGER event_effective_payment_capacity BEFORE UPDATE OF status ON special_event_bookings
WHEN NEW.status='PAID' AND OLD.status<>'PAID' AND NEW.payment_provider='SUMUP'
BEGIN
 SELECT CASE WHEN OLD.status<>'PENDING' THEN RAISE(ABORT,'PAYMENT_CANCELLED_OR_FAILED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM special_events WHERE id=NEW.event_id AND status<>'CANCELLED') THEN RAISE(ABORT,'PAYMENT_EVENT_CANCELLED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM special_event_ticket_products WHERE id=NEW.product_id AND event_id=NEW.event_id) THEN RAISE(ABORT,'PAYMENT_PRODUCT_MISMATCH') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_product_days pd WHERE pd.product_id=NEW.product_id AND NOT EXISTS(SELECT 1 FROM event_effective_booking_days bd WHERE bd.booking_id=NEW.id AND bd.day_id=pd.day_id AND bd.places=NEW.quantity*pd.places_per_ticket)) OR EXISTS(SELECT 1 FROM event_effective_booking_days bd WHERE bd.booking_id=NEW.id AND NOT EXISTS(SELECT 1 FROM special_event_product_days pd WHERE pd.product_id=NEW.product_id AND pd.day_id=bd.day_id AND bd.places=NEW.quantity*pd.places_per_ticket)) THEN RAISE(ABORT,'PAYMENT_DAY_ALLOCATION_MISMATCH') END;
 SELECT CASE WHEN NEW.qualifying_booking_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM event_effective_bookings b JOIN special_event_attendees a ON a.booking_id=b.id WHERE b.id=NEW.qualifying_booking_id AND b.event_id=NEW.event_id AND b.status='PAID' AND a.id=NEW.qualifying_attendee_id AND a.status='ACTIVE') THEN RAISE(ABORT,'PAYMENT_QUALIFYING_ADMISSION_REVIEW') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_ticket_products p JOIN special_event_ticket_products mini ON mini.event_id=p.event_id AND mini.code='MINI_COMPETITION' WHERE p.id=NEW.product_id AND mini.allocation IS NOT NULL AND (CASE WHEN p.code='MINI_COMPETITION' THEN NEW.quantity ELSE NEW.competition_quantity END)>0 AND
 (CASE WHEN p.code='MINI_COMPETITION' THEN NEW.quantity ELSE NEW.competition_quantity END)
 +(SELECT COUNT(*) FROM special_event_competition_entries ce JOIN event_effective_bookings b ON b.id=ce.booking_id WHERE ce.event_id=NEW.event_id AND ce.status<>'WITHDRAWN' AND b.status='PAID')
 +(SELECT COALESCE(SUM(CASE WHEN hp.code='MINI_COMPETITION' THEN h.quantity ELSE h.competition_quantity END),0) FROM special_event_holds h JOIN special_event_ticket_products hp ON hp.id=h.product_id WHERE h.event_id=NEW.event_id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now'))>mini.allocation) THEN RAISE(ABORT,'PAYMENT_COMPETITION_CAPACITY_CONFLICT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_ticket_products p WHERE p.id=NEW.product_id AND p.allocation IS NOT NULL AND
 NEW.quantity+(SELECT COALESCE(SUM(effective_quantity),0) FROM event_effective_bookings b WHERE b.product_id=p.id AND b.status='PAID')+
 (SELECT COALESCE(SUM(quantity),0) FROM special_event_holds h WHERE h.product_id=p.id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now'))>p.allocation)
 THEN RAISE(ABORT,'PAYMENT_PRODUCT_CAPACITY_CONFLICT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM event_effective_booking_days bd JOIN special_event_days d ON d.id=bd.day_id WHERE bd.booking_id=NEW.id AND d.capacity IS NOT NULL AND
 bd.places+(SELECT COALESCE(SUM(x.places),0) FROM event_effective_booking_days x JOIN event_effective_bookings b ON b.id=x.booking_id WHERE x.day_id=d.id AND b.status='PAID')+
 (SELECT COALESCE(SUM(x.places),0) FROM special_event_hold_days x JOIN special_event_holds h ON h.id=x.hold_id WHERE x.day_id=d.id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now'))>d.capacity)
 THEN RAISE(ABORT,'PAYMENT_DAY_CAPACITY_CONFLICT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_ticket_products p JOIN special_events e ON e.id=p.event_id WHERE p.id=NEW.product_id AND p.includes_saturday_evening=1 AND e.saturday_evening_capacity IS NOT NULL AND
 NEW.quantity+(SELECT COALESCE(SUM(b.effective_quantity),0) FROM event_effective_bookings b JOIN special_event_ticket_products p2 ON p2.id=b.product_id WHERE b.event_id=e.id AND b.status='PAID' AND p2.includes_saturday_evening=1)+
 (SELECT COALESCE(SUM(h.quantity),0) FROM special_event_holds h JOIN special_event_ticket_products p2 ON p2.id=h.product_id WHERE h.event_id=e.id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now') AND p2.includes_saturday_evening=1)>e.saturday_evening_capacity)
 THEN RAISE(ABORT,'PAYMENT_EVENING_CAPACITY_CONFLICT') END;
END;
CREATE TRIGGER event_lineage_immutable_update BEFORE UPDATE ON event_admission_lineage BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LINEAGE'); END;
CREATE TRIGGER event_lineage_immutable_delete BEFORE DELETE ON event_admission_lineage BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LINEAGE'); END;
CREATE TRIGGER event_no_admission_resurrection BEFORE UPDATE OF status ON special_event_attendees WHEN NEW.status='ACTIVE' AND OLD.status='CANCELLED' BEGIN
 SELECT CASE WHEN EXISTS(SELECT 1 FROM event_admission_releases WHERE attendee_id=NEW.id OR root_attendee_id=NEW.id) OR EXISTS(SELECT 1 FROM event_admission_lineage WHERE previous_attendee_id=NEW.id) THEN RAISE(ABORT,'ADMISSION_PERMANENTLY_INVALIDATED') END;
END;

CREATE TRIGGER event_evidence_deletion_fence BEFORE UPDATE OF legal_hold ON event_evidence WHEN NEW.legal_hold=1 AND OLD.state IN('DELETE_PENDING','DELETED') BEGIN SELECT RAISE(ABORT,'DELETION_ALREADY_CLAIMED'); END;

CREATE TABLE event_change_replies(id TEXT PRIMARY KEY,request_id TEXT NOT NULL REFERENCES event_change_requests(id),body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);

-- Complimentary/manual PAID inserts also respect every active offer/checkout hold.
CREATE TRIGGER event_effective_insert_capacity BEFORE INSERT ON special_event_bookings WHEN NEW.status='PAID'
BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM special_events WHERE id=NEW.event_id AND status<>'CANCELLED') THEN RAISE(ABORT,'PAYMENT_EVENT_CANCELLED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM special_event_ticket_products WHERE id=NEW.product_id AND event_id=NEW.event_id) THEN RAISE(ABORT,'PAYMENT_PRODUCT_MISMATCH') END;
 SELECT CASE WHEN NEW.qualifying_booking_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM event_effective_bookings b JOIN special_event_attendees a ON a.booking_id=b.id WHERE b.id=NEW.qualifying_booking_id AND b.event_id=NEW.event_id AND b.status='PAID' AND a.id=NEW.qualifying_attendee_id AND a.status='ACTIVE') THEN RAISE(ABORT,'PAYMENT_QUALIFYING_ADMISSION_REVIEW') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_ticket_products p JOIN special_event_ticket_products mini ON mini.event_id=p.event_id AND mini.code='MINI_COMPETITION' WHERE p.id=NEW.product_id AND mini.allocation IS NOT NULL AND (CASE WHEN p.code='MINI_COMPETITION' THEN NEW.quantity ELSE NEW.competition_quantity END)>0 AND
 (CASE WHEN p.code='MINI_COMPETITION' THEN NEW.quantity ELSE NEW.competition_quantity END)
 +(SELECT COUNT(*) FROM special_event_competition_entries ce JOIN event_effective_bookings b ON b.id=ce.booking_id WHERE ce.event_id=NEW.event_id AND ce.status<>'WITHDRAWN' AND b.status='PAID')
 +(SELECT COALESCE(SUM(CASE WHEN hp.code='MINI_COMPETITION' THEN h.quantity ELSE h.competition_quantity END),0) FROM special_event_holds h JOIN special_event_ticket_products hp ON hp.id=h.product_id WHERE h.event_id=NEW.event_id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now'))>mini.allocation) THEN RAISE(ABORT,'PAYMENT_COMPETITION_CAPACITY_CONFLICT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_ticket_products p WHERE p.id=NEW.product_id AND p.allocation IS NOT NULL AND
 NEW.quantity+(SELECT COALESCE(SUM(effective_quantity),0) FROM event_effective_bookings b WHERE b.product_id=p.id AND b.status='PAID')+
 (SELECT COALESCE(SUM(quantity),0) FROM special_event_holds h WHERE h.product_id=p.id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now'))>p.allocation)
 THEN RAISE(ABORT,'PAYMENT_PRODUCT_CAPACITY_CONFLICT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_product_days pd JOIN special_event_days d ON d.id=pd.day_id WHERE pd.product_id=NEW.product_id AND d.capacity IS NOT NULL AND
 NEW.quantity*pd.places_per_ticket+(SELECT COALESCE(SUM(x.places),0) FROM event_effective_booking_days x JOIN event_effective_bookings b ON b.id=x.booking_id WHERE x.day_id=d.id AND b.status='PAID')+
 (SELECT COALESCE(SUM(x.places),0) FROM special_event_hold_days x JOIN special_event_holds h ON h.id=x.hold_id WHERE x.day_id=d.id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now'))>d.capacity)
 THEN RAISE(ABORT,'PAYMENT_DAY_CAPACITY_CONFLICT') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM special_event_ticket_products p JOIN special_events e ON e.id=p.event_id WHERE p.id=NEW.product_id AND p.includes_saturday_evening=1 AND e.saturday_evening_capacity IS NOT NULL AND
 NEW.quantity+(SELECT COALESCE(SUM(b.effective_quantity),0) FROM event_effective_bookings b JOIN special_event_ticket_products p2 ON p2.id=b.product_id WHERE b.event_id=e.id AND b.status='PAID' AND p2.includes_saturday_evening=1)+
 (SELECT COALESCE(SUM(h.quantity),0) FROM special_event_holds h JOIN special_event_ticket_products p2 ON p2.id=h.product_id WHERE h.event_id=e.id AND h.id<>COALESCE(NEW.hold_id,'') AND h.status='ACTIVE' AND julianday(h.expires_at)>julianday('now') AND p2.includes_saturday_evening=1)>e.saturday_evening_capacity)
 THEN RAISE(ABORT,'PAYMENT_EVENING_CAPACITY_CONFLICT') END;
END;
