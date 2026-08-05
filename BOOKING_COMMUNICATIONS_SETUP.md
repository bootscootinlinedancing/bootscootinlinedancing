# Boot Scootin’ booking communications — V92.6.4

The Worker now sends transactional messages for:

- `BOOKING_CONFIRMED` after a booking becomes PAID
- `CLASS_CANCELLED` when HQ cancels a class or an individual active booking
- `REFUND_CONFIRMED` after HQ records a refund

Email is attempted for every booking. SMS is attempted only when the customer supplied a valid phone number.

## Email — Resend
Add these Cloudflare Worker secrets/variables:

- `RESEND_API_KEY`
- `EMAIL_FROM` — for example `Boot Scootin’ <bookings@bootscootinlinedancing.co.uk>`

The sending domain/address must be verified in the email provider.

## SMS — Twilio
Add:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- either `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`

UK numbers entered as `07...` are normalised to `+44...` before delivery.

## Safety and retries

Messages are recorded in `notification_log`. A successfully sent event/channel is not sent twice. Failed or setup-required entries can be retried after credentials are corrected. Message failures do not roll back or block bookings, payments, cancellations or refunds.
