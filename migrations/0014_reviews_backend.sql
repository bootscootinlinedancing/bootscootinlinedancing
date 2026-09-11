-- Stage 7: member reviews and immutable review history.
-- Additive only; no existing member, booking, attendance, or class-pass rows are changed.

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  member_account_id TEXT NOT NULL REFERENCES member_accounts(id),
  customer_id TEXT NOT NULL REFERENCES customers(id),
  review_type TEXT NOT NULL DEFAULT 'GENERAL' CHECK(review_type IN ('GENERAL')),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  review_text TEXT NOT NULL,
  class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
  display_name TEXT,
  first_name_only INTEGER NOT NULL DEFAULT 1 CHECK(first_name_only IN (0,1)),
  is_private INTEGER NOT NULL DEFAULT 0 CHECK(is_private IN (0,1)),
  website_permission INTEGER NOT NULL DEFAULT 0 CHECK(website_permission IN (0,1)),
  social_permission INTEGER NOT NULL DEFAULT 0 CHECK(social_permission IN (0,1)),
  moderation_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(moderation_status IN ('PENDING','PUBLISHED','PRIVATE','REJECTED','ARCHIVED')),
  featured_homepage INTEGER NOT NULL DEFAULT 0 CHECK(featured_homepage IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_one_active_general_member
ON reviews(member_account_id,review_type)
WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_moderation
ON reviews(moderation_status,created_at);

CREATE INDEX IF NOT EXISTS idx_reviews_public
ON reviews(moderation_status,is_private,archived_at,created_at);

CREATE INDEX IF NOT EXISTS idx_reviews_featured
ON reviews(featured_homepage,moderation_status,website_permission,created_at);

CREATE TABLE IF NOT EXISTS review_history (
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
);

CREATE INDEX IF NOT EXISTS idx_review_history_review
ON review_history(review_id,created_at);

CREATE TRIGGER IF NOT EXISTS review_history_no_update
BEFORE UPDATE ON review_history
BEGIN
  SELECT RAISE(ABORT, 'review history is immutable');
END;

CREATE TRIGGER IF NOT EXISTS review_history_no_delete
BEFORE DELETE ON review_history
BEGIN
  SELECT RAISE(ABORT, 'review history is immutable');
END;
