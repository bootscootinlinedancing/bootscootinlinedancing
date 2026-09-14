-- Stage 9: immutable HQ moderation notes on the existing review history ledger.
-- Additive only; no existing review or history rows are rewritten.

ALTER TABLE review_history ADD COLUMN moderation_note TEXT;

-- Records the exact admin operation that last won an optimistic-concurrency
-- update. This lets the immutable history insert prove that its own update,
-- rather than a competing request, changed the review.
ALTER TABLE reviews ADD COLUMN moderation_operation_id TEXT;

CREATE UNIQUE INDEX idx_reviews_moderation_operation
ON reviews(moderation_operation_id)
WHERE moderation_operation_id IS NOT NULL;
