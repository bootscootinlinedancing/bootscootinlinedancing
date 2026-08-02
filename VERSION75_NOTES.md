# Boot Scootin’ Platform V75

## Class booking pilot
- Public classes load from Cloudflare D1.
- Customers can request places without entering card details.
- Capacity reduces automatically for pilot reservations.
- Full classes place customers on the waiting list.
- Every request clearly states that no payment is taken and Nora must confirm it.

## Private events
- New detailed private-event inquiry form for birthdays, hen parties, weddings, corporate events, children’s parties, community events and bespoke bookings.
- Captures preferred/alternative date, timings, venue, postcode, guests, age range, experience, session format, music requests, equipment, access and additional notes.
- 15 miles each way from Birmingham B5 is included by default.
- Longer travel is added as a separately agreed quote item; journeys beyond 30 miles are bespoke.
- Submitting the form never confirms or reserves the event.
- Each inquiry receives a reference and a long private status/proposal link.
- Customers can later review a proposal and request changes without creating an account.
- Deposit/full-payment buttons remain disabled until SumUp is configured.

## HQ private events
- Added a Private Events section to HQ.
- Customer details are locked until Cloudflare Access protects HQ.
- Once protected, Nora can review inquiries, change statuses and prepare itemised quotes.
- Quote builder supports base fee, travel, equipment, extras, discounts, deposit, balance due date, expiry and cancellation terms.
- Timeline and quote versions are retained in D1.

## Security
- Card and bank details are never collected or stored.
- Private HQ APIs require Cloudflare Access.
- Public inquiry input is validated, length-limited and protected with a honeypot.
- The customer proposal uses a long unguessable token.
