# Admission rewards — technical design and release gate

This feature provides reusable complimentary admissions without changing loyalty stamps, Class Pass credits, SumUp, or paid-booking history.

## Identity and assignment

- An entitlement belongs to one authoritative `customers.id` and its verified, active `member_accounts.id`.
- Programmes are configurable. The migration creates a disabled-notification `GOLDEN_TICKET` programme definition, but assigns no customer reward.
- Sarah Kavanagh is not named or hardcoded anywhere in the implementation. A live assignment requires a separate, audited HQ action after deployment approval.
- Every assignment, adjustment, expiry extension, eligibility decision, redemption, restoration, and revocation has an idempotency key and immutable audit or ledger row.

## Eligibility and booking

- Classes are ineligible by default and must be explicitly enabled per programme.
- Ticket-product eligibility is explicit. The initial programme allows only `CLASS_SOCIAL`; Social Only and multi-session tickets are excluded.
- Redemption requires an authenticated Member Zone session linked to the same customer and member IDs as the entitlement.
- A 15-minute capacity hold is acquired before redemption. One database batch then creates the £0 `PAID` booking, consumes one admission, records the claim, creates the lead attendee, expires the hold, and queues the normal booking confirmation.
- The booking uses `payment_provider='ADMISSION_REWARD'`; no SumUp checkout or payment record is created.
- The partial unique claim index and idempotency keys prevent overlapping or repeated redemption for the same reward and class.

## Cancellation and loyalty isolation

- Customer cancellation at least 24 hours before class restores one admission exactly once. A late cancellation does not restore it.
- HQ class cancellation restores confirmed reward admissions exactly once.
- The original expiry date is unchanged on restoration.
- £0 admission-reward bookings are deliberately excluded from loyalty earning. Existing Class Pass and paid-booking rules remain unchanged.

## Notifications

- Normal confirmation/cancellation notifications use the existing booking lifecycle.
- Reward-assignment notification rows are prepared as `DISABLED`. No assignment notification is scheduled or sent until separately approved.

## Migration and release order

The migration is numbered `0030_admission_rewards.sql`. The reviewed Halloween, Sunday Sessions, external-ticket and private-enquiry workstreams reserve `0026` through `0029` respectively. Before any future release:

1. Merge and apply the approved `0026` workstream.
2. Merge/rehearse/apply the approved `0027` workstream.
3. Take and verify a fresh production D1 backup.
4. Release or otherwise record the reviewed `0028` and `0029` workstreams before this migration; do not reuse their numbers.
5. Rehearse `0030` against a disposable copy and run foreign-key/integrity checks.
6. Apply `0030` before deploying code that reads admission-reward tables.
7. Deploy the exact reviewed commit and verify Member Zone/HQ read-only views.
8. Only after separate owner approval, enable intended classes and assign a verified customer reward in HQ.

Rollback is code-first. The additive tables and immutable history should be retained; never drop them or delete reward history as an application rollback.
