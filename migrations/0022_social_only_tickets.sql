-- Additive Social Only ticket configuration and booking snapshots.
ALTER TABLE classes ADD COLUMN social_only_enabled INTEGER NOT NULL DEFAULT 0 CHECK (social_only_enabled IN (0,1));
ALTER TABLE classes ADD COLUMN social_only_price_pence INTEGER CHECK (social_only_price_pence IS NULL OR social_only_price_pence >= 0);
ALTER TABLE classes ADD COLUMN social_only_entry_time TEXT;

ALTER TABLE bookings ADD COLUMN ticket_type TEXT CHECK (ticket_type IS NULL OR ticket_type IN ('CLASS_SOCIAL','SOCIAL_ONLY'));
ALTER TABLE bookings ADD COLUMN ticket_entry_time TEXT;

ALTER TABLE booking_holds ADD COLUMN ticket_type TEXT CHECK (ticket_type IS NULL OR ticket_type IN ('CLASS_SOCIAL','SOCIAL_ONLY'));
ALTER TABLE booking_holds ADD COLUMN ticket_price_pence INTEGER CHECK (ticket_price_pence IS NULL OR ticket_price_pence > 0);
ALTER TABLE booking_holds ADD COLUMN ticket_entry_time TEXT;

ALTER TABLE waiting_list ADD COLUMN ticket_type TEXT CHECK (ticket_type IS NULL OR ticket_type IN ('CLASS_SOCIAL','SOCIAL_ONLY'));
ALTER TABLE waiting_list ADD COLUMN ticket_price_pence INTEGER CHECK (ticket_price_pence IS NULL OR ticket_price_pence > 0);
ALTER TABLE waiting_list ADD COLUMN ticket_entry_time TEXT;

CREATE INDEX IF NOT EXISTS idx_bookings_class_ticket_type ON bookings(class_id,ticket_type);
