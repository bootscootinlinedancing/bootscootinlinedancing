# V92.6.5 static test report

## Checks completed

- `node --check _worker.js` — passed.
- `node --check ranch.js` — passed.
- `node --check service-worker.js` — passed.
- Verified HQ class cards calculate remaining places from capacity minus active PENDING/PAID quantities.
- Verified zero remaining places renders FULL and Waiting list open.
- Verified booking cards expose Cancel booking for active bookings.
- Verified SumUp refund is restricted to SUMUP PAID/CANCELLED bookings with a transaction ID.
- Verified D1 is only marked REFUNDED after an accepted SumUp API response.
- Verified refund and cancellation notifications use the existing duplicate-safe notification layer.
- Verified release/cache references use V92.6.5.

## Deployment test required

The live refund call requires the deployed Cloudflare Worker and the connected SumUp sandbox account. Test the existing £1 payment first.
