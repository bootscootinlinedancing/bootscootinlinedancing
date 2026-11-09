CREATE TABLE special_event_financial_plans (
  event_id TEXT PRIMARY KEY REFERENCES special_events(id),
  projected_revenue_pence INTEGER CHECK(projected_revenue_pence IS NULL OR projected_revenue_pence>=0),
  notes TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE special_event_expenses (
  id TEXT PRIMARY KEY,event_id TEXT NOT NULL REFERENCES special_events(id),
  category TEXT NOT NULL CHECK(category IN ('ARTIST_FEES','TRAVEL','ACCOMMODATION','INSURANCE','OTHER')),
  label TEXT NOT NULL,estimated_pence INTEGER CHECK(estimated_pence IS NULL OR estimated_pence>=0),
  confirmed_pence INTEGER CHECK(confirmed_pence IS NULL OR confirmed_pence>=0),
  status TEXT NOT NULL DEFAULT 'ESTIMATED' CHECK(status IN ('ESTIMATED','CONFIRMED','PAID','CANCELLED')),
  notes TEXT,created_by TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX special_event_expenses_event ON special_event_expenses(event_id,category,status);
