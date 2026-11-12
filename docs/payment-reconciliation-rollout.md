# Payment reconciliation: review and deployment plan

No production action is part of this draft. Base: d8cffbcb6485fef2895345046f7ecbd0bba171f0.

## Evidence and root causes

The investigated regular class and Johnny event bookings had matching captured payments while local fulfilment remained PENDING. Both are now recovered. Retained evidence does not prove the specific reason SumUp's callback/return did not complete; do not label this a proven provider webhook outage.

Confirmed code gaps: regular pending bookings are not scanned by the scheduled endpoint; events depend on an hourly, unbounded pending scan; regular confirmations queue until the hourly processor; event status/outbox and attendees used separate transactions; event transaction selection chose transactions[0], including failed attempts; regular EXPIRED handling tried a value not permitted by the status constraint. Callback and customer-return handlers exist, but neither guarantees the customer returns or that a callback completes.

## Design

`PAYMENT_RECONCILIATION_ENABLED=true` enables a shared strict verifier and leased fulfilment guard for regular and special-event payment entry points. Exact ID/reference/merchant/GBP/amount and exactly one successful matching transaction are required. Cross-family checks plus durable unique checkout/transaction claims reject payment reuse; SQL triggers also prevent future claims from another family. Historical PAID rows return without transaction-ID rewrites. Capacity limits including active holds/guest allocations are checked inside the PAID transaction. A transaction fence rejects concurrent cancellation. Event status, attendee/day allocation, audit and outbox now commit together. Regular attendee inconsistencies go to review rather than inventing guests.

A separate secret-authenticated POST `/api/automation/reconcile-payments` handles at most four due pending checkouts. Every five minutes the existing cron worker invokes that endpoint in a separate HTTP request budget. The original minute-five hourly journeys/campaigns are retained. Provider downtime leaves PENDING untouched and backs off 5 minutes to 6 hours; fixed status codes and count-only monitoring avoid logging contacts/provider bodies. Expired/failed observations are reviewed, never inferred captures or unavailable-provider declines. REVIEW entries are not auto-replayed. HQ overview exposes review and incomplete event-fulfilment warnings.

Existing confirmation copy, provider idempotency keys and historical outboxes are preserved. The regular targeted sender and event leased/frozen-payload retry code are reused from draft PR77, not a second mailer. Event acceptance requires an ID. Ambiguous attempts older than 20 hours require manual review instead of replaying beyond Resend's retention. No PDFs, customer QR images or new templates.

## PR77 overlap

PR77 remains untouched. This PR incorporates its targeted regular confirmation processor, event leased/frozen payload retry processor, sender override and additive migration0038 verbatim or with integration adjustments. Its read-only verifier already shipped in PR78/79 and is not replaced here. Do not merge PR77 wholesale afterward: rebase it and drop the already-adopted hunks/migration; keep one dispatch path and one idempotency key. PR74's delivery webhook remains independent and unmerged; provider acceptance is not proof of delivery.

## Deployment (separate owner approval required)

1. Export D1 and record the exact current Pages/cron SHAs/configuration. Validate synthetic tests and stage both regular/event flows; never stage with production SumUp/Resend credentials or customers.
2. Apply migration0038 once (check D1 migration history first), then0039. They are additive and preserve provider IDs/history;0038 flags legacy ambiguous failed/in-flight sends for manual review. No bulk sending/backfill.
3. Deploy Pages code with fallback flag initially false. The updated event sender requires0038 columns even while fallback is off. Verify the existing read-only endpoint and owner HQ.
4. Inspect REVIEW/capacity fixtures and compare current inventory. Enable the fallback flag, then deploy the cron worker with its existing secret and five-minute schedule. Confirm one bounded run, count-only logs, last worker invocation and provider error response monitoring. A missing worker/flag must not be mistaken for a working fallback.
5. Observe callback duplication, PAID transitions, queue/acceptance IDs, provider delivery independently and unchanged historical records. Check recovery backlog count and oldest retry age; surface storage failures in HQ and alert on cron HTTP failures.

## Rollback

Disable the fallback flag and restore the prior hourly cron worker/configuration first. Restore the recorded Pages deployment if necessary. Keep0038/0039 columns, claims, audit and outbox history; do not drop tables or rewrite PAID rows. Capacity/duplicate triggers remain protective. Do not resend an ambiguous delivery during rollback; verify the provider ID first. Review any in-flight claim after its lease and retry only through the approved flow.

## Validation

`npm run validate` includes the new real SQLite synthetic suite: exact mismatch rejection, failed-then-successful attempt selection, duplicate callbacks, regular/event concurrent fulfilment, expired holds, competing capacity requests, cross-family claims including later writes, atomic allocation failure rollback, cancellation during fulfilment, mocked Resend acceptance/idempotency and bounded provider downtime. Existing suites cover reservation/cancellation/loyalty and event admission. No production data or provider call is made by these tests.
