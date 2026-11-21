-- Empty schema snapshot; no customer/booking/payment data.
CREATE TABLE _cf_KV (
        key TEXT PRIMARY KEY,
        value BLOB
      ) WITHOUT ROWID;
CREATE TABLE achievements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT,
      category TEXT NOT NULL DEFAULT 'general',
      points_bonus INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
CREATE TABLE admin_lifecycle_audit (
  operation_id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  customer_id TEXT,
  member_account_id TEXT,
  order_id TEXT,
  reason TEXT NOT NULL CHECK(length(trim(reason))>0),
  request_json TEXT NOT NULL,
  previous_json TEXT NOT NULL,
  next_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admission_reward_audit (
  id TEXT PRIMARY KEY,
  reward_id TEXT REFERENCES customer_admission_rewards(id),
  program_id TEXT REFERENCES admission_reward_programs(id),
  action TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  metadata_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admission_reward_booking_claims (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL REFERENCES customer_admission_rewards(id),
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  status TEXT NOT NULL CHECK(status IN ('CONFIRMED','RELEASED')),
  redemption_ledger_id TEXT NOT NULL UNIQUE REFERENCES admission_reward_ledger(id),
  restoration_ledger_id TEXT UNIQUE REFERENCES admission_reward_ledger(id),
  idempotency_key TEXT NOT NULL UNIQUE,
  confirmed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  released_at TEXT
);
CREATE TABLE admission_reward_class_eligibility (
  program_id TEXT NOT NULL REFERENCES admission_reward_programs(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  eligible INTEGER NOT NULL CHECK(eligible IN (0,1)),
  reason TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(program_id,class_id)
);
CREATE TABLE admission_reward_ledger (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL REFERENCES customer_admission_rewards(id),
  booking_id TEXT REFERENCES bookings(id),
  class_id TEXT REFERENCES classes(id),
  amount INTEGER NOT NULL CHECK(amount <> 0),
  event_type TEXT NOT NULL CHECK(event_type IN ('ALLOCATION','REDEMPTION','RESTORATION','ADMIN_ADJUSTMENT','REVOCATION')),
  reason TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK(actor_type IN ('ADMIN','MEMBER','SYSTEM')),
  actor_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admission_reward_notifications (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL REFERENCES customer_admission_rewards(id),
  notification_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DISABLED' CHECK(status IN ('DISABLED','READY','SENT','FAILED')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);
CREATE TABLE admission_reward_programs (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  default_admissions INTEGER NOT NULL DEFAULT 1 CHECK(default_admissions BETWEEN 1 AND 100),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  notification_enabled INTEGER NOT NULL DEFAULT 0 CHECK(notification_enabled IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admission_reward_ticket_eligibility (
  program_id TEXT NOT NULL REFERENCES admission_reward_programs(id) ON DELETE CASCADE,
  ticket_product_code TEXT NOT NULL,
  eligible INTEGER NOT NULL CHECK(eligible IN (0,1)),
  reason TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(program_id,ticket_product_code)
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
CREATE TABLE anniversary_events (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL UNIQUE REFERENCES classes(id),
  title TEXT NOT NULL,
  total_capacity INTEGER NOT NULL CHECK(total_capacity > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
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
CREATE TABLE attendance (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      checked_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      checked_in_by TEXT
    , recorded_at TEXT);
CREATE TABLE attendee_loyalty_credits (
  id TEXT PRIMARY KEY,
  attendee_id TEXT NOT NULL UNIQUE REFERENCES booking_attendees(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id,customer_id)
);
CREATE TABLE audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE booking_attendee_audit (
  id TEXT PRIMARY KEY,
  attendee_id TEXT REFERENCES booking_attendees(id),
  class_id TEXT NOT NULL REFERENCES classes(id),
  booking_id TEXT REFERENCES bookings(id),
  customer_id TEXT REFERENCES customers(id),
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  operation_id TEXT NOT NULL UNIQUE,
  previous_json TEXT,
  next_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE booking_attendees (
  id TEXT PRIMARY KEY,
  booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
  class_id TEXT NOT NULL REFERENCES classes(id),
  place_number INTEGER,
  role TEXT NOT NULL CHECK(role IN ('LEAD','GUEST','COMPLIMENTARY')),
  snapshot_name TEXT NOT NULL,
  snapshot_email TEXT,
  normalized_email TEXT,
  customer_id TEXT REFERENCES customers(id),
  attendance_status TEXT NOT NULL DEFAULT 'EXPECTED' CHECK(attendance_status IN ('EXPECTED','ATTENDED','CANCELLED')),
  checked_in_at TEXT,
  checked_in_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, admission_category TEXT
  CHECK(admission_category IS NULL OR admission_category IN ('ADULT','CHILD_10_17','CHILD_5_9','UNDER_5')),
  CHECK(
    (role IN ('LEAD','GUEST') AND booking_id IS NOT NULL AND place_number IS NOT NULL AND place_number >= 1)
    OR (role='COMPLIMENTARY' AND booking_id IS NULL AND place_number IS NULL AND customer_id IS NOT NULL)
  ),
  UNIQUE(booking_id,place_number)
);
CREATE TABLE booking_confirmation_delivery_tests (
  operation_id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL REFERENCES bookings(id),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENT','FAILED')),
  provider_id TEXT,
  error_message TEXT,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);
CREATE TABLE booking_confirmation_jobs (
  booking_id TEXT PRIMARY KEY REFERENCES bookings(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PROCESSING','RETRY','SENT','REVIEW','CANCELLED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  payload_json TEXT,
  claim_id TEXT,
  lease_until TEXT,
  first_attempt_at TEXT,
  next_attempt_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  provider_id TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT
);
CREATE TABLE booking_confirmation_policy (
  id INTEGER PRIMARY KEY CHECK(id=1),
  eligible_paid_from TEXT NOT NULL,
  delivery_enabled INTEGER NOT NULL DEFAULT 0 CHECK(delivery_enabled IN (0,1))
);
CREATE TABLE booking_holds (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , anniversary_release_id TEXT REFERENCES anniversary_ticket_releases(id), ticket_type TEXT CHECK (ticket_type IS NULL OR ticket_type IN ('CLASS_SOCIAL','SOCIAL_ONLY')), ticket_price_pence INTEGER CHECK (ticket_price_pence IS NULL OR ticket_price_pence > 0), ticket_entry_time TEXT, ticket_product_code TEXT CHECK (
  ticket_product_code IS NULL OR ticket_product_code IN (
    'CLASS_SOCIAL','BEGINNER_SOCIAL','IMPROVER_SOCIAL','BEGINNER_IMPROVER_SOCIAL','SOCIAL_ONLY'
  )
), ticket_product_label TEXT, ticket_starts_at TEXT, ticket_ends_at TEXT, ticket_entry_at TEXT);
CREATE TABLE bookings (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      class_id TEXT NOT NULL REFERENCES classes(id),
      hold_id TEXT REFERENCES booking_holds(id),
      customer_id TEXT REFERENCES customers(id),
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 10),
      amount_pence INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'GBP',
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','PAID','FAILED','CANCELLED','REFUNDED','WAITLISTED')),
      payment_provider TEXT NOT NULL DEFAULT 'SUMUP',
      provider_checkout_id TEXT,
      provider_transaction_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TEXT,
      retention_delete_after TEXT
    , secure_token TEXT, terms_accepted_at TEXT, marketing_consent INTEGER NOT NULL DEFAULT 0, cancellation_requested_at TEXT, cancellation_band TEXT, refund_status TEXT, refund_amount_pence INTEGER, admin_notes TEXT, customer_token TEXT, provider_transaction_code TEXT, original_amount_pence INTEGER, discount_pence INTEGER NOT NULL DEFAULT 0, promo_code TEXT, class_pass_id TEXT REFERENCES member_passes(id), class_pass_ledger_id TEXT REFERENCES class_pass_credit_ledger(id), anniversary_release_id TEXT REFERENCES anniversary_ticket_releases(id), ticket_type TEXT CHECK (ticket_type IS NULL OR ticket_type IN ('CLASS_SOCIAL','SOCIAL_ONLY')), ticket_entry_time TEXT, ticket_product_code TEXT CHECK (
  ticket_product_code IS NULL OR ticket_product_code IN (
    'CLASS_SOCIAL','BEGINNER_SOCIAL','IMPROVER_SOCIAL','BEGINNER_IMPROVER_SOCIAL','SOCIAL_ONLY'
  )
), ticket_product_label TEXT, ticket_unit_price_pence INTEGER CHECK (
  ticket_unit_price_pence IS NULL OR ticket_unit_price_pence >= 0
), ticket_starts_at TEXT, ticket_ends_at TEXT, ticket_entry_at TEXT);
CREATE TABLE class_guest_list (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  guest_name TEXT NOT NULL,
  places INTEGER NOT NULL CHECK(places > 0),
  category TEXT NOT NULL DEFAULT 'GUEST' CHECK(category IN ('GUEST','COMPLIMENTARY','INSTRUCTOR_STAFF','VENDOR','ARTIST_PERFORMER','OTHER')),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','CANCELLED')),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  last_operation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, sunday_adult_count INTEGER CHECK(sunday_adult_count IS NULL OR sunday_adult_count>=0), sunday_child_10_17_count INTEGER CHECK(sunday_child_10_17_count IS NULL OR sunday_child_10_17_count>=0), sunday_child_5_9_count INTEGER CHECK(sunday_child_5_9_count IS NULL OR sunday_child_5_9_count>=0), sunday_under_5_count INTEGER CHECK(sunday_under_5_count IS NULL OR sunday_under_5_count>=0));
CREATE TABLE class_guest_list_audit (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  guest_id TEXT NOT NULL REFERENCES class_guest_list(id),
  action TEXT NOT NULL CHECK(action IN ('GUEST_ADDED','GUEST_UPDATED','GUEST_CANCELLED')),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_json TEXT,
  next_json TEXT,
  operation_id TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE class_pass_admin_operations (
  idempotency_key TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_json TEXT,
  next_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE class_pass_audit_log (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES member_passes(id),
  action TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  reason TEXT NOT NULL,
  previous_json TEXT,
  next_json TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE class_pass_class_eligibility (
  class_id TEXT PRIMARY KEY REFERENCES classes(id) ON DELETE CASCADE,
  eligible INTEGER NOT NULL DEFAULT 0 CHECK(eligible IN (0,1)),
  reason TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE class_pass_credit_ledger (
  id TEXT PRIMARY KEY,
  pass_id TEXT NOT NULL REFERENCES member_passes(id),
  member_id TEXT NOT NULL REFERENCES member_accounts(id),
  booking_id TEXT REFERENCES bookings(id),
  amount INTEGER NOT NULL CHECK(amount <> 0),
  event_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE class_pass_products (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  price_pence INTEGER NOT NULL CHECK(price_pence >= 0),
  original_credits INTEGER NOT NULL CHECK(original_credits > 0),
  validity_days INTEGER NOT NULL CHECK(validity_days > 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE class_ticket_product_audit (
  operation_id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  previous_json TEXT NOT NULL,
  next_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE class_ticket_products (
  id TEXT PRIMARY KEY,
  class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL CHECK (product_code IN (
    'BEGINNER_SOCIAL','IMPROVER_SOCIAL','BEGINNER_IMPROVER_SOCIAL','SOCIAL_ONLY'
  )),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  price_pence INTEGER NOT NULL CHECK (price_pence > 0),
  starts_at TEXT,
  ends_at TEXT,
  entry_at TEXT,
  class_pass_eligible INTEGER NOT NULL DEFAULT 0 CHECK (class_pass_eligible IN (0,1)),
  class_pass_credit_cost INTEGER NOT NULL DEFAULT 1 CHECK (class_pass_credit_cost > 0),
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(class_id,product_code),
  CHECK (product_code != 'SOCIAL_ONLY' OR class_pass_eligible = 0)
);
CREATE TABLE classes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      venue TEXT NOT NULL,
      location TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT,
      price_pence INTEGER NOT NULL CHECK(price_pence >= 0),
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      sold INTEGER NOT NULL DEFAULT 0 CHECK(sold >= 0),
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('draft','open','closed','cancelled')),
      level TEXT NOT NULL DEFAULT 'Beginner friendly',
      public_notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , poster_url TEXT, social_only_enabled INTEGER NOT NULL DEFAULT 0 CHECK (social_only_enabled IN (0,1)), social_only_price_pence INTEGER CHECK (social_only_price_pence IS NULL OR social_only_price_pence >= 0), social_only_entry_time TEXT, booking_format TEXT NOT NULL DEFAULT 'STANDARD'
  CHECK (booking_format IN ('STANDARD','BEGINNER_IMPROVER')), promo_poster_url TEXT, special_booking_format TEXT
  CHECK (special_booking_format IS NULL OR special_booking_format='SUNDAY_SESSIONS'));
CREATE TABLE customer_admission_rewards (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES admission_reward_programs(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  member_id TEXT NOT NULL REFERENCES member_accounts(id),
  original_allocation INTEGER NOT NULL CHECK(original_allocation BETWEEN 1 AND 100),
  active_from TEXT NOT NULL,
  original_expires_on TEXT NOT NULL,
  expires_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','REVOKED')),
  source_type TEXT NOT NULL DEFAULT 'ADMIN' CHECK(source_type IN ('ADMIN','COMPETITION','GOODWILL','OTHER')),
  source_reference TEXT,
  notes TEXT,
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK(date(active_from) IS NOT NULL),
  CHECK(date(original_expires_on) IS NOT NULL),
  CHECK(date(expires_on) IS NOT NULL),
  CHECK(date(original_expires_on) >= date(active_from)),
  CHECK(date(expires_on) >= date(active_from))
);
CREATE TABLE customer_crm_notes (
      id TEXT PRIMARY KEY,
      customer_key TEXT NOT NULL,
      note_text TEXT NOT NULL,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE customer_crm_profiles (
      customer_key TEXT PRIMARY KEY,
      birthday TEXT,
      emergency_contact_name TEXT,
      emergency_contact_phone TEXT,
      emergency_contact_relationship TEXT,
      medical_notes TEXT,
      instructor_notes_summary TEXT,
      loyalty_adjustment INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE customer_crm_tags (
      customer_key TEXT NOT NULL,
      tag TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(customer_key,tag)
    );
CREATE TABLE customer_email_identities (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  normalized_email TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','RETIRED')),
  verified_at TEXT,
  source TEXT NOT NULL CHECK(source IN ('BOOKING','MEMBER_VERIFICATION','ADMIN')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE customer_identity_audit (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customers(id),
  action TEXT NOT NULL,
  normalized_email TEXT,
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      marketing_consent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE "d1_migrations"(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE email_automation_log (automation_key TEXT PRIMARY KEY,automation_type TEXT NOT NULL,email TEXT,class_id TEXT,booking_id TEXT,provider_id TEXT,status TEXT NOT NULL DEFAULT 'SENT',error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE email_automation_settings (setting_key TEXT PRIMARY KEY,enabled INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE email_campaign_recipients (id TEXT PRIMARY KEY,campaign_id TEXT NOT NULL,email TEXT NOT NULL,name TEXT,status TEXT NOT NULL DEFAULT 'PENDING',provider_id TEXT,error_message TEXT,sent_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(campaign_id,email));
CREATE TABLE email_campaigns (id TEXT PRIMARY KEY,subject TEXT NOT NULL,body_text TEXT NOT NULL,audience_type TEXT NOT NULL,audience_json TEXT,recipient_count INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'DRAFT',scheduled_at TEXT,sent_at TEXT,created_by TEXT,provider_message TEXT,error_message TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE email_templates (id TEXT PRIMARY KEY,name TEXT NOT NULL,subject TEXT NOT NULL,body_text TEXT NOT NULL,is_system INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
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
CREATE TABLE loyalty_stamp_ledger (
      id TEXT PRIMARY KEY,
      customer_email TEXT NOT NULL,
      member_id TEXT REFERENCES member_accounts(id) ON DELETE SET NULL,
      booking_id TEXT REFERENCES bookings(id) ON DELETE CASCADE,
      event_key TEXT NOT NULL UNIQUE,
      stamp_delta INTEGER NOT NULL CHECK(stamp_delta IN (-1,1)),
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE loyalty_transactions (
  id TEXT PRIMARY KEY,
  customer_id TEXT,
  customer_email TEXT NOT NULL,
  member_id TEXT,
  booking_id TEXT,
  amount INTEGER NOT NULL CHECK(amount <> 0),
  transaction_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type, source_id)
);
CREATE TABLE mailing_subscribers (email TEXT PRIMARY KEY,name TEXT,source TEXT NOT NULL DEFAULT 'website',subscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE mailing_unsubscribes (email TEXT PRIMARY KEY,unsubscribed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,source TEXT);
CREATE TABLE member_accounts (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , access_state TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(access_state IN ('ACTIVE','REVOKED')), auth_generation INTEGER NOT NULL DEFAULT 0, access_changed_at TEXT);
CREATE TABLE member_achievements (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES member_profiles(id) ON DELETE CASCADE,
      achievement_id TEXT NOT NULL REFERENCES achievements(id),
      earned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      source_type TEXT,
      source_id TEXT,
      UNIQUE(member_id,achievement_id)
    );
CREATE TABLE member_email_tokens (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES member_accounts(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      purpose TEXT NOT NULL CHECK(purpose IN ('VERIFY','RESET')),
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , auth_generation INTEGER NOT NULL DEFAULT 0);
CREATE TABLE member_login_attempts (
      key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      window_started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      blocked_until TEXT
    );
CREATE TABLE member_passes (
  id TEXT PRIMARY KEY,
  member_id TEXT NOT NULL REFERENCES member_accounts(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  product_id TEXT NOT NULL REFERENCES class_pass_products(id),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ACTIVE','CANCELLED')),
  purchased_at TEXT,
  original_valid_through TEXT,
  valid_through TEXT,
  original_credits INTEGER NOT NULL CHECK(original_credits > 0),
  purchase_amount_pence INTEGER NOT NULL CHECK(purchase_amount_pence >= 0),
  currency TEXT NOT NULL DEFAULT 'GBP',
  payment_provider TEXT NOT NULL DEFAULT 'SUMUP',
  provider_checkout_id TEXT UNIQUE,
  provider_transaction_id TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE member_profiles (
      id TEXT PRIMARY KEY,
      customer_id TEXT UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
      display_name TEXT,
      trail_rank TEXT NOT NULL DEFAULT 'First Steps',
      boot_points INTEGER NOT NULL DEFAULT 0 CHECK(boot_points >= 0),
      classes_attended INTEGER NOT NULL DEFAULT 0 CHECK(classes_attended >= 0),
      current_streak INTEGER NOT NULL DEFAULT 0 CHECK(current_streak >= 0),
      whos_going_opt_in INTEGER NOT NULL DEFAULT 0,
      profile_visibility TEXT NOT NULL DEFAULT 'private' CHECK(profile_visibility IN ('private','nora_only','members')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , birthday_visible INTEGER NOT NULL DEFAULT 0, trail_identity TEXT NOT NULL DEFAULT 'trail_rider', is_paused INTEGER NOT NULL DEFAULT 0);
CREATE TABLE member_sessions (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES member_accounts(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , auth_generation INTEGER NOT NULL DEFAULT 0);
CREATE TABLE merch_external_refunds (
  operation_id TEXT PRIMARY KEY REFERENCES admin_lifecycle_audit(operation_id),
  order_id TEXT NOT NULL UNIQUE REFERENCES merch_orders(id),
  amount_pence INTEGER NOT NULL CHECK(amount_pence>0),
  currency TEXT NOT NULL DEFAULT 'GBP' CHECK(currency='GBP'),
  source TEXT NOT NULL CHECK(source='EXTERNAL_MANUAL'),
  method TEXT NOT NULL CHECK(length(trim(method))>0),
  refunded_at TEXT NOT NULL,
  external_reference TEXT,
  reason TEXT NOT NULL CHECK(length(trim(reason))>0),
  actor TEXT NOT NULL,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE merch_orders (
      id TEXT PRIMARY KEY,
      reference TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      design TEXT NOT NULL,
      fit TEXT NOT NULL CHECK(fit IN ('unisex','womens')),
      size TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity BETWEEN 1 AND 4),
      unit_price_pence INTEGER NOT NULL,
      amount_pence INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'GBP',
      status TEXT NOT NULL DEFAULT 'PENDING',
      provider_checkout_id TEXT,
      provider_transaction_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      paid_at TEXT
    , fulfilment_method TEXT NOT NULL DEFAULT 'collection', delivery_address TEXT, delivery_pence INTEGER NOT NULL DEFAULT 0, fulfilment_status TEXT NOT NULL DEFAULT 'NEW', confirmation_email_sent_at TEXT, fulfilment_email_sent_at TEXT, payment_method TEXT, payment_url TEXT, cancelled_at TEXT);
CREATE TABLE newsletter_subscribers (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    source TEXT NOT NULL DEFAULT 'website-footer',
    status TEXT NOT NULL DEFAULT 'subscribed',
    consent_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
CREATE TABLE notification_log (
      id TEXT PRIMARY KEY,
      booking_id TEXT,
      class_id TEXT,
      event_type TEXT NOT NULL,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      provider_id TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      sent_at TEXT,
      UNIQUE(booking_id,event_type,channel)
    );
CREATE TABLE oauth_connections (
      provider TEXT PRIMARY KEY,
      access_token_cipher TEXT NOT NULL,
      refresh_token_cipher TEXT,
      expires_at TEXT,
      scope TEXT,
      merchant_code TEXT,
      connected_by TEXT,
      connected_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE oauth_states (
      state TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      actor TEXT,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE payments (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
      provider TEXT NOT NULL DEFAULT 'SUMUP',
      provider_reference TEXT,
      amount_pence INTEGER NOT NULL,
      currency TEXT NOT NULL DEFAULT 'GBP',
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE points_ledger (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES member_profiles(id) ON DELETE CASCADE,
      points INTEGER NOT NULL,
      reason_code TEXT NOT NULL,
      description TEXT,
      source_type TEXT,
      source_id TEXT,
      created_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE private_event_inquiries (
      id TEXT PRIMARY KEY, reference TEXT NOT NULL UNIQUE, secure_token TEXT NOT NULL UNIQUE,
      customer_name TEXT NOT NULL, customer_email TEXT NOT NULL, customer_phone TEXT,
      event_type TEXT NOT NULL, event_type_other TEXT, preferred_date TEXT NOT NULL, alternative_date TEXT,
      start_time TEXT, end_time TEXT, venue_name TEXT, venue_address TEXT NOT NULL, venue_postcode TEXT NOT NULL,
      guest_count INTEGER NOT NULL CHECK(guest_count > 0), age_range TEXT, experience_level TEXT, session_length TEXT,
      format_requested TEXT, music_requests TEXT, sound_system_provided INTEGER NOT NULL DEFAULT 0,
      microphone_provided INTEGER NOT NULL DEFAULT 0, dance_floor_confirmed INTEGER NOT NULL DEFAULT 0,
      power_available INTEGER NOT NULL DEFAULT 0, parking_loading_available INTEGER NOT NULL DEFAULT 0,
      equipment_notes TEXT, accessibility_notes TEXT, additional_notes TEXT, status TEXT NOT NULL DEFAULT 'NEW_INQUIRY',
      customer_change_request TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE private_event_payments (
      id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL REFERENCES private_event_inquiries(id) ON DELETE CASCADE,
      quote_id TEXT REFERENCES private_event_quotes(id) ON DELETE SET NULL, payment_kind TEXT NOT NULL, amount_pence INTEGER NOT NULL,
      provider TEXT NOT NULL DEFAULT 'SUMUP', provider_reference TEXT, status TEXT NOT NULL DEFAULT 'PENDING',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, paid_at TEXT
    );
CREATE TABLE private_event_quotes (
      id TEXT PRIMARY KEY, inquiry_id TEXT NOT NULL REFERENCES private_event_inquiries(id) ON DELETE CASCADE,
      version INTEGER NOT NULL DEFAULT 1, agreed_date TEXT, agreed_start_time TEXT, agreed_end_time TEXT,
      agreed_venue TEXT, agreed_address TEXT, package_description TEXT, base_fee_pence INTEGER NOT NULL DEFAULT 0,
      travel_fee_pence INTEGER NOT NULL DEFAULT 0, equipment_fee_pence INTEGER NOT NULL DEFAULT 0,
      extra_fee_pence INTEGER NOT NULL DEFAULT 0, discount_pence INTEGER NOT NULL DEFAULT 0, total_pence INTEGER NOT NULL DEFAULT 0,
      deposit_pence INTEGER NOT NULL DEFAULT 0, balance_due_pence INTEGER NOT NULL DEFAULT 0, balance_due_date TEXT,
      quote_expires_at TEXT, cancellation_terms TEXT, customer_notes TEXT, internal_notes TEXT,
      status TEXT NOT NULL DEFAULT 'DRAFT', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE private_event_timeline (
      id INTEGER PRIMARY KEY AUTOINCREMENT, inquiry_id TEXT NOT NULL REFERENCES private_event_inquiries(id) ON DELETE CASCADE,
      actor_type TEXT NOT NULL, actor_label TEXT, action TEXT NOT NULL, details_json TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE promotion_codes (
      id TEXT PRIMARY KEY, promotion_id TEXT NOT NULL REFERENCES promotions(id) ON DELETE CASCADE, code TEXT NOT NULL UNIQUE, customer_email TEXT,
      issued_reason TEXT, issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, expires_at TEXT, max_uses INTEGER NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1
    );
CREATE TABLE promotion_redemptions (
      id TEXT PRIMARY KEY, promotion_code_id TEXT NOT NULL REFERENCES promotion_codes(id), booking_id TEXT NOT NULL REFERENCES bookings(id),
      customer_email TEXT NOT NULL, discount_pence INTEGER NOT NULL DEFAULT 0, redeemed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(promotion_code_id,booking_id)
    );
CREATE TABLE promotions (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, code_prefix TEXT, discount_type TEXT NOT NULL CHECK(discount_type IN ('PERCENT','FIXED','FREE')),
      discount_value INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, max_uses INTEGER, uses_per_customer INTEGER NOT NULL DEFAULT 1,
      applicable_class_id TEXT, personal_only INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE review_history (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id),
  event_type TEXT NOT NULL CHECK(event_type IN ('CREATED','UPDATED','ARCHIVED')),
  review_version INTEGER NOT NULL CHECK(review_version > 0),
  operation_id TEXT NOT NULL UNIQUE,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  previous_json TEXT,
  next_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
, moderation_note TEXT);
CREATE TABLE "reviews" (
  id TEXT PRIMARY KEY,
  member_account_id TEXT REFERENCES member_accounts(id),
  customer_id TEXT REFERENCES customers(id),
  review_type TEXT NOT NULL DEFAULT 'GENERAL' CHECK(review_type IN ('GENERAL')),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL,
  class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
  display_name TEXT,
  reviewer_name TEXT,
  reviewer_email TEXT,
  reviewer_email_normalized TEXT,
  first_name_only INTEGER NOT NULL DEFAULT 1 CHECK(first_name_only IN (0,1)),
  is_private INTEGER NOT NULL DEFAULT 0 CHECK(is_private IN (0,1)),
  website_permission INTEGER NOT NULL DEFAULT 0 CHECK(website_permission IN (0,1)),
  social_permission INTEGER NOT NULL DEFAULT 0 CHECK(social_permission IN (0,1)),
  moderation_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(moderation_status IN ('PENDING','PUBLISHED','PRIVATE','REJECTED','ARCHIVED')),
  featured_homepage INTEGER NOT NULL DEFAULT 0 CHECK(featured_homepage IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  moderation_operation_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);
CREATE TABLE reward_catalog (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      points_cost INTEGER NOT NULL CHECK(points_cost > 0),
      stock_limit INTEGER,
      active INTEGER NOT NULL DEFAULT 1,
      reward_type TEXT NOT NULL DEFAULT 'perk'
    );
CREATE TABLE reward_redemptions (
      id TEXT PRIMARY KEY,
      member_id TEXT NOT NULL REFERENCES member_profiles(id) ON DELETE CASCADE,
      reward_id TEXT NOT NULL REFERENCES reward_catalog(id),
      points_spent INTEGER NOT NULL CHECK(points_spent > 0),
      status TEXT NOT NULL DEFAULT 'REQUESTED' CHECK(status IN ('REQUESTED','APPROVED','FULFILLED','CANCELLED')),
      requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      fulfilled_at TEXT
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
CREATE TABLE special_event_attendance (
  attendee_id TEXT NOT NULL REFERENCES special_event_attendees(id),
  day_id TEXT NOT NULL REFERENCES special_event_days(id),
  attended_at TEXT,
  checked_in_by TEXT,
  PRIMARY KEY(attendee_id,day_id)
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
CREATE TABLE special_event_booking_days (
  booking_id TEXT NOT NULL REFERENCES special_event_bookings(id) ON DELETE CASCADE,
  day_id TEXT NOT NULL REFERENCES special_event_days(id),
  places INTEGER NOT NULL CHECK(places >= 0),
  PRIMARY KEY(booking_id,day_id)
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
CREATE TABLE special_event_hold_days (
  hold_id TEXT NOT NULL REFERENCES special_event_holds(id) ON DELETE CASCADE,
  day_id TEXT NOT NULL REFERENCES special_event_days(id),
  places INTEGER NOT NULL CHECK(places >= 0),
  PRIMARY KEY(hold_id,day_id)
);
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
CREATE TABLE special_event_product_days (
  product_id TEXT NOT NULL REFERENCES special_event_ticket_products(id) ON DELETE CASCADE,
  day_id TEXT NOT NULL REFERENCES special_event_days(id) ON DELETE CASCADE,
  places_per_ticket INTEGER NOT NULL DEFAULT 1 CHECK(places_per_ticket BETWEEN 0 AND 10),
  PRIMARY KEY(product_id,day_id)
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
CREATE TABLE sunday_session_waiting_offers (
  id TEXT PRIMARY KEY,
  waiting_id TEXT NOT NULL REFERENCES waiting_list(id) ON DELETE RESTRICT,
  booking_id TEXT NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','PAID','FAILED','EXPIRED','CANCELLED')),
  checkout_url TEXT,
  created_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE venues (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      location TEXT NOT NULL,
      capacity INTEGER NOT NULL CHECK(capacity > 0),
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
CREATE TABLE waiting_list (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING','OFFERED','CONVERTED','CANCELLED')),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    , secure_token TEXT, ticket_type TEXT CHECK (ticket_type IS NULL OR ticket_type IN ('CLASS_SOCIAL','SOCIAL_ONLY')), ticket_price_pence INTEGER CHECK (ticket_price_pence IS NULL OR ticket_price_pence > 0), ticket_entry_time TEXT, ticket_product_code TEXT CHECK (
  ticket_product_code IS NULL OR ticket_product_code IN (
    'CLASS_SOCIAL','BEGINNER_SOCIAL','IMPROVER_SOCIAL','BEGINNER_IMPROVER_SOCIAL','SOCIAL_ONLY'
  )
), ticket_product_label TEXT, ticket_starts_at TEXT, ticket_ends_at TEXT, ticket_entry_at TEXT);
CREATE INDEX booking_confirmation_delivery_tests_booking ON booking_confirmation_delivery_tests(booking_id,created_at);
CREATE INDEX booking_confirmation_due ON booking_confirmation_jobs(status,next_attempt_at);
CREATE INDEX idx_admission_reward_audit_reward ON admission_reward_audit(reward_id,created_at);
CREATE INDEX idx_admission_reward_ledger_reward ON admission_reward_ledger(reward_id,created_at);
CREATE UNIQUE INDEX idx_admission_reward_one_active_claim_per_class
  ON admission_reward_booking_claims(reward_id,class_id)
  WHERE status='CONFIRMED';
CREATE UNIQUE INDEX idx_admission_reward_redemption_booking
  ON admission_reward_ledger(booking_id) WHERE event_type='REDEMPTION';
CREATE INDEX idx_admission_rewards_customer ON customer_admission_rewards(customer_id,status,expires_on);
CREATE INDEX idx_admission_rewards_member ON customer_admission_rewards(member_id,status,expires_on);
CREATE INDEX idx_anniversary_adjustment_event ON anniversary_ticket_adjustments(event_id,status,release_id);
CREATE INDEX idx_anniversary_audit_event ON anniversary_audit_log(event_id,created_at);
CREATE INDEX idx_anniversary_guest_event ON anniversary_guest_list(event_id,status);
CREATE INDEX idx_anniversary_release_event ON anniversary_ticket_releases(event_id,display_order);
CREATE UNIQUE INDEX idx_attendance_booking_unique ON attendance(booking_id);
CREATE INDEX idx_attendee_loyalty_customer
ON attendee_loyalty_credits(customer_id,created_at);
CREATE INDEX idx_booking_attendee_audit_target
ON booking_attendee_audit(class_id,attendee_id,created_at);
CREATE INDEX idx_booking_attendees_booking
ON booking_attendees(booking_id,place_number);
CREATE INDEX idx_booking_attendees_class
ON booking_attendees(class_id,attendance_status,role);
CREATE INDEX idx_booking_attendees_customer
ON booking_attendees(customer_id,class_id);
CREATE INDEX idx_booking_attendees_email
ON booking_attendees(normalized_email,class_id);
CREATE INDEX idx_booking_customer_token ON bookings(customer_token);
CREATE INDEX idx_booking_holds_anniversary_release ON booking_holds(anniversary_release_id,expires_at);
CREATE INDEX idx_booking_holds_class_ticket_product
ON booking_holds(class_id,ticket_product_code,expires_at);
CREATE UNIQUE INDEX idx_booking_secure_token ON bookings(secure_token);
CREATE INDEX idx_bookings_anniversary_release ON bookings(anniversary_release_id,status);
CREATE INDEX idx_bookings_class_pass
ON bookings(class_pass_id);
CREATE INDEX idx_bookings_class_status ON bookings(class_id,status);
CREATE INDEX idx_bookings_class_ticket_product
ON bookings(class_id,ticket_product_code);
CREATE INDEX idx_bookings_class_ticket_type ON bookings(class_id,ticket_type);
CREATE INDEX idx_bookings_email ON bookings(customer_email);
CREATE INDEX idx_class_guest_audit_class_created ON class_guest_list_audit(class_id,created_at);
CREATE INDEX idx_class_guest_list_class_status ON class_guest_list(class_id,status,created_at);
CREATE INDEX idx_class_pass_admin_operations_target
ON class_pass_admin_operations(target_type,target_id,created_at);
CREATE INDEX idx_class_pass_audit_pass
ON class_pass_audit_log(pass_id,created_at);
CREATE INDEX idx_class_pass_ledger_booking
ON class_pass_credit_ledger(booking_id,created_at);
CREATE INDEX idx_class_pass_ledger_member
ON class_pass_credit_ledger(member_id,created_at);
CREATE INDEX idx_class_pass_ledger_pass
ON class_pass_credit_ledger(pass_id,created_at);
CREATE INDEX idx_class_ticket_product_audit_class
ON class_ticket_product_audit(class_id,created_at);
CREATE INDEX idx_class_ticket_products_class_enabled
ON class_ticket_products(class_id,enabled,display_order);
CREATE INDEX idx_customer_crm_notes_key ON customer_crm_notes(customer_key,created_at);
CREATE INDEX idx_customer_crm_tags_key ON customer_crm_tags(customer_key);
CREATE INDEX idx_customer_email_identities_customer
ON customer_email_identities(customer_id,status,created_at);
CREATE INDEX idx_customer_identity_audit_customer
ON customer_identity_audit(customer_id,created_at);
CREATE INDEX idx_event_announcements_visibility
ON event_announcements(enabled,featured,starts_at,expires_at);
CREATE INDEX idx_holds_class_expiry ON booking_holds(class_id, expires_at);
CREATE INDEX idx_loyalty_email ON loyalty_stamp_ledger(customer_email,created_at);
CREATE INDEX idx_loyalty_transactions_booking
ON loyalty_transactions(booking_id, created_at);
CREATE INDEX idx_loyalty_transactions_customer
ON loyalty_transactions(customer_email, created_at);
CREATE INDEX idx_loyalty_transactions_customer_id
ON loyalty_transactions(customer_id, created_at);
CREATE UNIQUE INDEX idx_member_accounts_email ON member_accounts(email);
CREATE INDEX idx_member_achievements_member ON member_achievements(member_id,earned_at);
CREATE INDEX idx_member_email_tokens_hash ON member_email_tokens(token_hash);
CREATE INDEX idx_member_email_tokens_member ON member_email_tokens(member_id,purpose);
CREATE INDEX idx_member_passes_customer
ON member_passes(customer_id,created_at);
CREATE INDEX idx_member_passes_member
ON member_passes(member_id,status,valid_through);
CREATE INDEX idx_member_sessions_token ON member_sessions(token_hash);
CREATE INDEX idx_member_tokens_token ON member_email_tokens(token_hash);
CREATE INDEX idx_notification_booking ON notification_log(booking_id,event_type);
CREATE INDEX idx_points_member_created ON points_ledger(member_id,created_at);
CREATE INDEX idx_private_event_status ON private_event_inquiries(status,created_at);
CREATE INDEX idx_private_event_token ON private_event_inquiries(secure_token);
CREATE INDEX idx_private_quote_inquiry ON private_event_quotes(inquiry_id,version);
CREATE INDEX idx_promo_codes_code ON promotion_codes(code);
CREATE INDEX idx_promo_redemptions_code ON promotion_redemptions(promotion_code_id);
CREATE INDEX idx_review_history_review
ON review_history(review_id,created_at);
CREATE INDEX idx_reviews_anonymous_rate_limit
ON reviews(reviewer_email_normalized,created_at)
WHERE member_account_id IS NULL AND reviewer_email_normalized IS NOT NULL;
CREATE INDEX idx_reviews_featured
ON reviews(featured_homepage,moderation_status,website_permission,created_at);
CREATE INDEX idx_reviews_moderation
ON reviews(moderation_status,created_at);
CREATE UNIQUE INDEX idx_reviews_moderation_operation
ON reviews(moderation_operation_id)
WHERE moderation_operation_id IS NOT NULL;
CREATE UNIQUE INDEX idx_reviews_one_active_general_member
ON reviews(member_account_id,review_type)
WHERE archived_at IS NULL AND member_account_id IS NOT NULL;
CREATE INDEX idx_reviews_public
ON reviews(moderation_status,is_private,archived_at,created_at);
CREATE INDEX idx_reward_redemptions_member ON reward_redemptions(member_id,requested_at);
CREATE UNIQUE INDEX idx_special_event_active_media ON special_event_media(event_id,media_type) WHERE active=1;
CREATE INDEX idx_special_event_activity_event ON special_event_activity(event_id,created_at);
CREATE INDEX idx_special_event_bookings_customer ON special_event_bookings(customer_id,created_at);
CREATE INDEX idx_special_event_bookings_inventory ON special_event_bookings(event_id,product_id,status);
CREATE INDEX idx_special_event_holds_inventory ON special_event_holds(event_id,product_id,status,expires_at);
CREATE UNIQUE INDEX idx_special_event_one_active_credential ON special_event_access_credentials(product_id) WHERE active=1;
CREATE INDEX idx_sunday_session_details_class ON sunday_session_booking_details(class_id,created_at);
CREATE INDEX idx_sunday_session_waiting_class ON sunday_session_waiting_details(class_id,created_at);
CREATE UNIQUE INDEX idx_sunday_waiting_active_offer
  ON sunday_session_waiting_offers(waiting_id) WHERE status='ACTIVE';
CREATE INDEX idx_sunday_waiting_offer_booking ON sunday_session_waiting_offers(booking_id,status);
CREATE INDEX idx_waiting_class_status ON waiting_list(class_id,status);
CREATE INDEX idx_waiting_list_class_ticket_product
ON waiting_list(class_id,ticket_product_code,status);
CREATE UNIQUE INDEX idx_waitlist_secure_token ON waiting_list(secure_token);
CREATE TRIGGER admin_lifecycle_audit_no_delete BEFORE DELETE ON admin_lifecycle_audit
BEGIN SELECT RAISE(ABORT,'admin lifecycle audit is immutable'); END;
CREATE TRIGGER admin_lifecycle_audit_no_update BEFORE UPDATE ON admin_lifecycle_audit
BEGIN SELECT RAISE(ABORT,'admin lifecycle audit is immutable'); END;
CREATE TRIGGER admission_reward_audit_immutable_delete
BEFORE DELETE ON admission_reward_audit BEGIN
  SELECT RAISE(ABORT,'admission reward audit is immutable');
END;
CREATE TRIGGER admission_reward_audit_immutable_update
BEFORE UPDATE ON admission_reward_audit BEGIN
  SELECT RAISE(ABORT,'admission reward audit is immutable');
END;
CREATE TRIGGER admission_reward_ledger_immutable_delete
BEFORE DELETE ON admission_reward_ledger BEGIN
  SELECT RAISE(ABORT,'admission reward ledger is immutable');
END;
CREATE TRIGGER admission_reward_ledger_immutable_update
BEFORE UPDATE ON admission_reward_ledger BEGIN
  SELECT RAISE(ABORT,'admission reward ledger is immutable');
END;
CREATE TRIGGER anniversary_adjustment_no_delete BEFORE DELETE ON anniversary_ticket_adjustments
BEGIN SELECT RAISE(ABORT,'anniversary ticket records must be cancelled, not deleted'); END;
CREATE TRIGGER anniversary_audit_no_delete BEFORE DELETE ON anniversary_audit_log
BEGIN SELECT RAISE(ABORT,'anniversary audit history is immutable'); END;
CREATE TRIGGER anniversary_audit_no_update BEFORE UPDATE ON anniversary_audit_log
BEGIN SELECT RAISE(ABORT,'anniversary audit history is immutable'); END;
CREATE TRIGGER anniversary_guest_no_delete BEFORE DELETE ON anniversary_guest_list
BEGIN SELECT RAISE(ABORT,'anniversary guest allocations must be cancelled, not deleted'); END;
CREATE TRIGGER attendee_loyalty_credits_no_delete
BEFORE DELETE ON attendee_loyalty_credits
BEGIN SELECT RAISE(ABORT,'attendee loyalty credits are immutable'); END;
CREATE TRIGGER attendee_loyalty_credits_no_update
BEFORE UPDATE ON attendee_loyalty_credits
BEGIN SELECT RAISE(ABORT,'attendee loyalty credits are immutable'); END;
CREATE TRIGGER booking_attendee_audit_no_delete
BEFORE DELETE ON booking_attendee_audit
BEGIN SELECT RAISE(ABORT,'booking attendee audit is immutable'); END;
CREATE TRIGGER booking_attendee_audit_no_update
BEFORE UPDATE ON booking_attendee_audit
BEGIN SELECT RAISE(ABORT,'booking attendee audit is immutable'); END;
CREATE TRIGGER class_guest_audit_no_delete BEFORE DELETE ON class_guest_list_audit
BEGIN SELECT RAISE(ABORT,'class guest audit history is immutable'); END;
CREATE TRIGGER class_guest_audit_no_update BEFORE UPDATE ON class_guest_list_audit
BEGIN SELECT RAISE(ABORT,'class guest audit history is immutable'); END;
CREATE TRIGGER class_guest_list_no_delete BEFORE DELETE ON class_guest_list
BEGIN SELECT RAISE(ABORT,'class guest records must be cancelled, not deleted'); END;
CREATE TRIGGER class_guest_list_no_reactivate BEFORE UPDATE OF status ON class_guest_list
WHEN OLD.status='CANCELLED' AND NEW.status<>'CANCELLED'
BEGIN SELECT RAISE(ABORT,'cancelled class guests cannot be reactivated'); END;
CREATE TRIGGER class_pass_admin_operations_no_delete
BEFORE DELETE ON class_pass_admin_operations
BEGIN
  SELECT RAISE(ABORT, 'class pass admin operations are immutable');
END;
CREATE TRIGGER class_pass_admin_operations_no_update
BEFORE UPDATE ON class_pass_admin_operations
BEGIN
  SELECT RAISE(ABORT, 'class pass admin operations are immutable');
END;
CREATE TRIGGER class_pass_audit_no_delete
BEFORE DELETE ON class_pass_audit_log
BEGIN
  SELECT RAISE(ABORT, 'class pass audit log is immutable');
END;
CREATE TRIGGER class_pass_audit_no_update
BEFORE UPDATE ON class_pass_audit_log
BEGIN
  SELECT RAISE(ABORT, 'class pass audit log is immutable');
END;
CREATE TRIGGER class_pass_credit_ledger_no_delete
BEFORE DELETE ON class_pass_credit_ledger
BEGIN
  SELECT RAISE(ABORT, 'class pass credit ledger is immutable');
END;
CREATE TRIGGER class_pass_credit_ledger_no_update
BEFORE UPDATE ON class_pass_credit_ledger
BEGIN
  SELECT RAISE(ABORT, 'class pass credit ledger is immutable');
END;
CREATE TRIGGER class_ticket_product_audit_no_delete
BEFORE DELETE ON class_ticket_product_audit
BEGIN
  SELECT RAISE(ABORT, 'class ticket product audit is immutable');
END;
CREATE TRIGGER class_ticket_product_audit_no_update
BEFORE UPDATE ON class_ticket_product_audit
BEGIN
  SELECT RAISE(ABORT, 'class ticket product audit is immutable');
END;
CREATE TRIGGER customer_email_identities_no_delete
BEFORE DELETE ON customer_email_identities
BEGIN SELECT RAISE(ABORT,'customer email identities must be retired, not deleted'); END;
CREATE TRIGGER customer_identity_audit_no_delete
BEFORE DELETE ON customer_identity_audit
BEGIN SELECT RAISE(ABORT,'customer identity audit is immutable'); END;
CREATE TRIGGER customer_identity_audit_no_update
BEFORE UPDATE ON customer_identity_audit
BEGIN SELECT RAISE(ABORT,'customer identity audit is immutable'); END;
CREATE TRIGGER loyalty_transactions_no_delete
BEFORE DELETE ON loyalty_transactions
BEGIN
  SELECT RAISE(ABORT, 'loyalty transactions are immutable');
END;
CREATE TRIGGER loyalty_transactions_no_update
BEFORE UPDATE ON loyalty_transactions
BEGIN
  SELECT RAISE(ABORT, 'loyalty transactions are immutable');
END;
CREATE TRIGGER merch_external_refund_no_delete BEFORE DELETE ON merch_external_refunds
BEGIN SELECT RAISE(ABORT,'external refund record is immutable'); END;
CREATE TRIGGER merch_external_refund_no_update BEFORE UPDATE ON merch_external_refunds
BEGIN SELECT RAISE(ABORT,'external refund record is immutable'); END;
CREATE TRIGGER merch_paid_history_no_delete BEFORE DELETE ON merch_orders
WHEN OLD.paid_at IS NOT NULL OR OLD.status IN ('PAID','CANCELLED')
BEGIN SELECT RAISE(ABORT,'historically paid or cancelled orders must be retained'); END;
CREATE TRIGGER review_history_no_delete
BEFORE DELETE ON review_history
BEGIN
  SELECT RAISE(ABORT, 'review history is immutable');
END;
CREATE TRIGGER review_history_no_update
BEFORE UPDATE ON review_history
BEGIN
  SELECT RAISE(ABORT, 'review history is immutable');
END;
CREATE TRIGGER special_event_activity_immutable_delete BEFORE DELETE ON special_event_activity BEGIN
  SELECT RAISE(ABORT,'special event activity is immutable');
END;
CREATE TRIGGER special_event_activity_immutable_update BEFORE UPDATE ON special_event_activity BEGIN
  SELECT RAISE(ABORT,'special event activity is immutable');
END;
CREATE TRIGGER special_event_document_versions_immutable_delete BEFORE DELETE ON special_event_document_versions BEGIN
  SELECT RAISE(ABORT,'special event document versions are immutable');
END;
CREATE TRIGGER special_event_document_versions_immutable_update BEFORE UPDATE ON special_event_document_versions BEGIN
  SELECT RAISE(ABORT,'special event document versions are immutable');
END;
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
CREATE TRIGGER sunday_session_details_consistent BEFORE INSERT ON sunday_session_booking_details
WHEN NOT EXISTS(
  SELECT 1 FROM bookings b JOIN classes c ON c.id=b.class_id
  WHERE b.id=NEW.booking_id AND b.class_id=NEW.class_id AND c.special_booking_format='SUNDAY_SESSIONS'
    AND b.quantity=NEW.total_people AND b.amount_pence=NEW.calculated_amount_pence
)
BEGIN SELECT RAISE(ABORT,'Sunday booking composition does not match booking quantity/amount'); END;
CREATE TRIGGER sunday_session_details_no_delete BEFORE DELETE ON sunday_session_booking_details
BEGIN SELECT RAISE(ABORT,'Sunday booking composition is immutable'); END;
CREATE TRIGGER sunday_session_details_no_update BEFORE UPDATE ON sunday_session_booking_details
BEGIN SELECT RAISE(ABORT,'Sunday booking composition is immutable'); END;
CREATE TRIGGER sunday_session_waiting_consistent BEFORE INSERT ON sunday_session_waiting_details
WHEN NOT EXISTS(
  SELECT 1 FROM waiting_list w JOIN classes c ON c.id=w.class_id
  WHERE w.id=NEW.waiting_id AND w.class_id=NEW.class_id AND c.special_booking_format='SUNDAY_SESSIONS'
    AND w.quantity=NEW.total_people
)
BEGIN SELECT RAISE(ABORT,'Sunday waiting composition does not match waiting-list quantity'); END;
CREATE TRIGGER sunday_session_waiting_no_delete BEFORE DELETE ON sunday_session_waiting_details
BEGIN SELECT RAISE(ABORT,'Sunday waiting composition is immutable'); END;
CREATE TRIGGER sunday_session_waiting_no_update BEFORE UPDATE ON sunday_session_waiting_details
BEGIN SELECT RAISE(ABORT,'Sunday waiting composition is immutable'); END;
CREATE TRIGGER sunday_waiting_offer_claim BEFORE INSERT ON sunday_session_waiting_offers
WHEN NOT EXISTS(
  SELECT 1
  FROM waiting_list w
  JOIN sunday_session_waiting_details wd ON wd.waiting_id=w.id
  JOIN bookings b ON b.id=NEW.booking_id AND b.class_id=w.class_id
  JOIN sunday_session_booking_details bd ON bd.booking_id=b.id
  WHERE w.id=NEW.waiting_id AND w.status='WAITING'
    AND bd.class_id=wd.class_id
    AND bd.selection_code=wd.selection_code
    AND bd.adult_count=wd.adult_count
    AND bd.child_10_17_count=wd.child_10_17_count
    AND bd.child_5_9_count=wd.child_5_9_count
    AND bd.under_5_count=wd.under_5_count
    AND bd.total_people=wd.total_people
    AND bd.calculated_amount_pence=wd.calculated_amount_pence
)
BEGIN SELECT RAISE(ABORT,'Sunday waiting entry or matching booking is not available for promotion'); END;