# Payment verification and confirmation dispatch

This change is prepared for review. Do not deploy it or apply its migration without owner approval.

Regular paid confirmations now dispatch their own durable outbox job immediately after enqueueing. Other customers' jobs are not processed by that immediate call. The existing scheduled processor remains the recovery/retry fallback, with its existing cutoff and delivery switch. A failed send cannot revert a verified paid booking. The existing payload snapshot, atomic lease, provider idempotency key, backoff and 20-hour automatic retry limit remain in use.

Special Event payment callbacks and return reconciliation target the booking they just verified, instead of processing whichever older outbox row happens to be first. Additive migration `0038_confirmation_dispatch_reliability.sql` adds a claim lease, immutable retry payload, first-attempt time and manual-review flag. An ambiguous historical attempt is flagged for review rather than replayed without knowing its original provider payload/window. Successful sends require a provider acceptance ID. Retries keep the original recipient, sender, content and idempotency key. No outbox history or provider IDs are deleted or backfilled.

Special Event paid transitions select a successful transaction from the checkout rather than its first attempted transaction. Existing paid bookings' references are not rewritten. Regular webhook and status reconciliation now verify checkout ID, booking reference, merchant, amount and GBP currency before applying provider status.

## Read-only evidence

Authenticated HQ GET `/ranch/api/admin/payment-verification?kind=regular&reference=<exact-reference>` verifies one existing checkout. Use `kind=special` for event bookings. It makes SELECTs and one provider GET; it does not reconcile, create a booking, queue a message or send an email. It reports checkout/transaction evidence, expected customer and product, and payment claims across regular bookings, Special Events, class passes, merchandise and private events. Missing tables/provider failures fail closed. A verified result is evidence for review, not authorisation to mutate capacity or recover a booking.

The legacy full-event audit hits a per-invocation subrequest ceiling; this is not a limit that waiting alone fixes. Use the single-booking check for the outstanding references after approval and deployment. Provider delivery status remains a separate check in Resend; the production send-only key cannot retrieve delivery results. No key or permission change is included.

## Rollout and remaining safeguards

1. Preserve the database and deployed code before approved rollout. Apply migration 0038 before enabling the new Special Event processor. Do not apply migrations 0036 or 0037 from unrelated draft PRs as part of this change.
2. Keep production customer sends and data changes out of staging. Validate with synthetic data and a mocked email provider first; no live customer smoke sends are needed.
3. After approval, deploy the selected change, then perform exact GET-only verification. Inspect current capacity, hold, attendee, outbox and duplicate claims again before any specifically authorised booking recovery.
4. Do not use the generic customer status endpoint for a read-only investigation: it reconciles. The new endpoint deliberately does not.
5. Delivery acceptance is not final delivery. Check the returned provider ID in Resend separately.

This PR does not change the hourly scheduler, add automatic reconciliation of pending regular payments, automatically recover failed/expired bookings, or remove existing capacity checks. A missed regular payment webhook can still require reconciliation. A future bounded payment-specific reconciliation job needs atomic capacity/duplicate guards and a separate approved rollout; invoking all HQ or customer status routes indiscriminately is unsafe.

Tests use disposable SQLite fixtures and mocked providers. They cover immediate dispatch, unpaid rejection, concurrent claims, stable ambiguous retries, provider failures, manual review after the retry window, history-preserving migration, correct successful-attempt selection, authenticated read-only lookup, provider mismatches and cross-family duplicate claims.
