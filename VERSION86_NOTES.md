# Version 86 — Online Booking System

## Visual fixes
- Businesses I Love heading now uses deliberate whole-word line breaks.
- Ask Nora now opens with the inclusive greeting “🤠 Howdy!”
- Backroad Boots UK now uses the clean official profile logo supplied by Nora, without the decorative rainbow rings.

## Customer booking system
- Live D1 class availability.
- Secure booking for up to four places.
- Automatic waiting list for full classes.
- Fifteen-minute capacity holds while payment is being completed.
- SumUp Hosted Checkout integration when SUMUP_API_KEY and SUMUP_MERCHANT_CODE are configured.
- No card details are collected or stored by Boot Scootin’.
- Secure customer booking-management token.
- Booking confirmation and live payment-status checks.
- Customer online cancellation request.
- Waiting-list self-removal.

## Cancellation and refund policy
- 48+ hours: full refund or class credit.
- 24–48 hours: one transfer or class credit.
- Under 24 hours/no-show: normally no refund or credit unless the place is resold or exceptional circumstances are agreed.
- Boot Scootin’ cancellation: full refund or transfer.
- Fairness promise and statutory-rights wording.
- The policy is shown before the customer accepts and books.

## HQ admin
- Complete booking list including pending, paid, cancelled and refunded bookings.
- Payment, cancellation, refund, credit and check-in actions.
- Waiting-list register.
- Revenue, active-guest, refund-review and waiting-list figures.
- Booking filters.
- CSV export.
- Audit-log entries for booking actions.

## Configuration required before live payments
- Cloudflare Access must protect HQ.
- SUMUP_API_KEY and SUMUP_MERCHANT_CODE must be added as encrypted Cloudflare secrets.
- A SumUp sandbox payment, cancellation and refund test must be completed before using live credentials.
- Transactional email remains a separate setup step.
