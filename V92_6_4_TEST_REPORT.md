# V92.6.4 static test report

## Passed
- `_worker.js` JavaScript syntax
- `ranch.js` JavaScript syntax
- `service-worker.js` JavaScript syntax
- HQ booking-stat DOM IDs match the render code
- Classes endpoint returns a computed `sold` quantity from PENDING/PAID bookings
- Notification table is created both by runtime schema preparation and migration 0006
- Paid, cancellation and refund notification hooks are present
- Duplicate-send protection uses booking/event/channel uniqueness
- Email/SMS delivery failures are isolated from booking and payment state changes

## Deployment-dependent checks
- D1 migration/runtime table creation
- Resend domain/API credentials and live email delivery
- Twilio sender/API credentials and live UK SMS delivery
- Cloudflare Access session and deployed Worker routes
