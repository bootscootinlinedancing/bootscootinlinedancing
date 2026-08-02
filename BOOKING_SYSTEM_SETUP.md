# Boot Scootin' Direct Booking — Version 63 (Test Foundation)

This release adds the first secure direct-booking application to the existing website.

## Important
This version is intentionally **not live for payments yet**. It does not collect card details and will not create a real paid booking until Cloudflare D1 and the verified SumUp checkout adapter are configured.

## Security design
- The browser never receives SumUp secret credentials.
- The website never collects or stores card numbers, expiry dates or security codes.
- Prices and availability are checked by a Cloudflare server function, not trusted from the browser.
- A 15-minute seat hold prevents casual overbooking during checkout.
- The private register endpoint requires Cloudflare Access and the configured administrator email.
- API responses are marked `no-store`.
- Data retention date is stored with each booking.

## Cloudflare setup
1. Create a D1 database, for example `boot-scootin-bookings`.
2. Run `migrations/0001_booking_schema.sql` against it.
3. Bind the database to Cloudflare Pages as `BOOKINGS_DB`.
4. Add encrypted secrets/variables:
   - `SUMUP_ACCESS_TOKEN` (secret)
   - `SUMUP_MERCHANT_CODE` (secret)
   - `ADMIN_EMAIL` (encrypted variable/secret)
5. Protect `/admin-bookings.html` and `/api/admin/*` with Cloudflare Access.
6. Add class rows to the `classes` table.
7. Verify the current SumUp official checkout API and complete the isolated adapter in `functions/api/create-checkout.js` before enabling live payments.
8. Test payment success, failure, duplicate callbacks, expired holds, refunds, sold-out races and email confirmations before accepting customer bookings.

## Files added
- `bookings.html`
- `bookings.js`
- `booking-confirmation.html`
- `booking-confirmation.js`
- `admin-bookings.html`
- `admin-bookings.js`
- `functions/api/*`
- `migrations/0001_booking_schema.sql`

## No sensitive values belong in GitHub
Do not commit API tokens, database credentials, customer exports or administrator secrets.
