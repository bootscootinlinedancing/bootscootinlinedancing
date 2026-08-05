# V92.6.2 Payment Sync Test Report

## Confirmed fault from the live sandbox test

- SumUp accepted the £1 hosted payment.
- D1 retained the related booking as PENDING.
- HQ revenue remained £0.00.
- The return page displayed a browser URL-pattern exception instead of completing verification.

## Repairs

- Checkout creation now supplies both the customer-facing `redirect_url` and SumUp webhook `return_url`.
- `/api/sumup-webhook` accepts checkout status events, retrieves the checkout directly from SumUp and updates the matching D1 booking only after SumUp reports PAID.
- Confirmation, HQ Home and HQ Bookings independently reconcile pending SumUp checkouts, providing recovery if a webhook is delayed or missed.
- Payment application is guarded by a conditional D1 update so repeated checks do not increment booked capacity twice.
- Confirmation URLs are constructed with the browser URL API rather than concatenated request strings.
- Public capacity now counts PAID bookings plus live holds, rather than counting a PENDING booking and its matching hold twice.

## Static checks passed

- `node --check _worker.js`
- `node --check booking-confirmation.js`
- `node --check ranch.js`
- SumUp webhook route and `return_url` coverage check
- Conditional PAID update/idempotency coverage check
- Release/cache version check
- ZIP integrity check

## Deployment test

After deployment, opening HQ or the original booking confirmation page should reconcile the existing £1 sandbox booking. A fresh £1 booking will additionally test the new webhook flow.
