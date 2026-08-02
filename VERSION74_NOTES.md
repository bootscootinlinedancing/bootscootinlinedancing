# Version 74 — D1 Database Setup

This release connects the existing `BOOKINGS_DB` binding to the platform worker and safely prepares the booking database on the first health check.

## Included
- Detects and tests the Cloudflare D1 binding
- Creates the core tables with `CREATE TABLE IF NOT EXISTS`
- Creates indexes for bookings, holds and waiting lists
- Adds Edgbaston Community Centre (capacity 20) and Low Places (capacity 50)
- Reports the database as READY only after schema creation and a live D1 query succeed
- Enables the public `/api/classes` endpoint through the root worker

No payment system is enabled and no card details are collected or stored.
