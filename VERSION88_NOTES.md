# Version 88 — Phase 2 Customer Booking Experience

## My Bookings
- New secure customer booking portal.
- Secure access through a personal token created during booking.
- Lost-link recovery using booking reference and matching email address.
- Upcoming bookings.
- Past and cancelled booking history.
- Live cancellation eligibility and guidance.
- Add-to-calendar downloads for each booking.

## Loyalty
- Attendance-based loyalty progress.
- Nine attended classes unlock the next free-class reward state.
- Visual stamp tracker.
- Upcoming, attended and reward summaries.

## Booking flow
- Booking confirmation now links directly to My Bookings.
- Customer tokens are stored against all bookings using the same email address.
- SumUp checkout URLs are validated before redirecting.
- If SumUp is unavailable or returns an invalid URL, the booking is retained for manual confirmation instead of showing a developer error.
- Friendly customer-facing fallback messages replace browser pattern errors.

## Privacy and safety
- Customer portal tokens are separate from individual booking cancellation tokens.
- Booking lookup requires the exact booking reference and matching email address.
- Calendar files contain only the booked class details and booking reference.

## Retained
- Phase 1 design and accessibility polish.
- Live class availability and waiting list.
- Cancellation and refund policy.
- HQ class and booking management.
