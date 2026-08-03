# Version 89 — Phase 3 HQ Admin & Reliability Fixes

## Booking reliability
- Rebuilt class reservation handling with backward-compatible D1 inserts.
- Prevents schema propagation issues from blocking bookings.
- If SumUp is not connected, unavailable or returns an unusable checkout URL, the class place is retained for manual payment confirmation.
- Customers receive a valid confirmation rather than a developer/browser pattern error.
- Booking errors remain customer-friendly.

## System Health
- Added a dedicated, protected system-health endpoint.
- Added a ten-second timeout so checks cannot run forever.
- D1 and R2 are checked directly.
- SumUp status reflects whether the required secrets exist.
- Cloudflare email routing is shown as information rather than incorrectly failed.
- Status cards now use ready, setup, information and error colours.

## HQ Command Centre
- Replaced the permanently red checklist with live status results.
- Added safe timeout and stopped-state messaging.
- The dashboard no longer remains stuck on “Checking your platform…”.

## Member Hub
- Replaced future-authentication placeholder text with the live secure My Bookings route.
- Added a direct My Bookings button.
- Clarified current privacy and future profile-visibility controls.

## Phase 3 HQ administration
- Added a customer register.
- Customer search.
- Booking, paid-booking, cancellation and attendance totals.
- Loyalty progress and reward-ready status.
- Marketing-consent visibility.
- Customer CSV export.
- Existing booking, payment, cancellation, refund, credit, waiting-list and attendance controls remain included.

## Deployment
- Cloudflare Access should protect HQ and System Health.
- SumUp remains optional until sandbox credentials are added.
- Complete a manual booking test before connecting SumUp, followed by a sandbox payment test.
