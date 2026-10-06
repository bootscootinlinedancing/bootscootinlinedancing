-- Allow moderated public reviews without requiring a Member Zone account.
-- Existing review IDs, ownership, moderation state, timestamps and history are preserved.

-- D1 runs migrations in a transaction and requires deferred foreign-key checks
-- while the referenced reviews table is rebuilt.
PRAGMA defer_foreign_keys=ON;

CREATE TABLE reviews_0024 (
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

INSERT INTO reviews_0024 (
  id,member_account_id,customer_id,review_type,rating,review_text,class_id,display_name,
  reviewer_name,reviewer_email,reviewer_email_normalized,first_name_only,is_private,
  website_permission,social_permission,moderation_status,featured_homepage,version,
  moderation_operation_id,created_at,updated_at,archived_at
)
SELECT
  r.id,r.member_account_id,r.customer_id,r.review_type,r.rating,r.review_text,r.class_id,r.display_name,
  COALESCE(NULLIF(trim(r.display_name),''),(SELECT c.name FROM customers c WHERE c.id=r.customer_id)),
  (SELECT c.email FROM customers c WHERE c.id=r.customer_id),
  lower(trim((SELECT c.email FROM customers c WHERE c.id=r.customer_id))),
  r.first_name_only,r.is_private,r.website_permission,r.social_permission,r.moderation_status,
  r.featured_homepage,r.version,r.moderation_operation_id,r.created_at,r.updated_at,r.archived_at
FROM reviews r;

DROP TABLE reviews;
ALTER TABLE reviews_0024 RENAME TO reviews;

CREATE UNIQUE INDEX idx_reviews_one_active_general_member
ON reviews(member_account_id,review_type)
WHERE archived_at IS NULL AND member_account_id IS NOT NULL;

CREATE INDEX idx_reviews_moderation
ON reviews(moderation_status,created_at);

CREATE INDEX idx_reviews_public
ON reviews(moderation_status,is_private,archived_at,created_at);

CREATE INDEX idx_reviews_featured
ON reviews(featured_homepage,moderation_status,website_permission,created_at);

CREATE INDEX idx_reviews_anonymous_rate_limit
ON reviews(reviewer_email_normalized,created_at)
WHERE member_account_id IS NULL AND reviewer_email_normalized IS NOT NULL;

CREATE UNIQUE INDEX idx_reviews_moderation_operation
ON reviews(moderation_operation_id)
WHERE moderation_operation_id IS NOT NULL;

PRAGMA defer_foreign_keys=OFF;
