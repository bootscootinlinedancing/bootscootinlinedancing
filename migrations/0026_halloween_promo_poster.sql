-- Additive support for a second, independently managed promotional poster.
-- Existing primary poster URLs and class records are preserved unchanged.

ALTER TABLE classes ADD COLUMN promo_poster_url TEXT;
