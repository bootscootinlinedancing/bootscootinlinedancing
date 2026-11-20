# Customer requests and effective admissions — draft, no rollout authorised

Base: production main d8cffbcb6485fef2895345046f7ecbd0bba171f0. Separate from PRs 73–81.

## Implemented workflow

Purchaser opens `/event-management.html`, enters booking reference and checkout email, then a one-use, ten-minute emailed code. Five guesses, three codes per booking/hour; generic access response. A hashed, one-hour, HttpOnly Secure SameSite Strict cookie scopes every read/write to that booking. No management bearer links in email or browser history. Requests contain selected attendees, optional reason/refund amount/replacement details. The original published policy is read from the event; this migration never seeds or rewrites it.

Submission atomically records request, acknowledgement outbox and immutable activity; admissions are unchanged. HQ `/ranch/event-management` provides decisions. Approval and execution are separate version-fenced actions. One atomic SQL operation commits releases, invalidation, replacement admissions, competition changes, queue wake-up, audit and decision notifications. Original booking.quantity, payment amounts/references, old attendees and attendance remain. Missing attendees never create free capacity. Explicit release ledger and lineage are immutable; cancelled/transferred source admissions cannot be resurrected. Partial cancellation removes selected attendees' entire original entitlement, not an arbitrary fraction of a weekend.

Refund authorisation is exact pence and independent of cancellation. One unresolved refund per booking; a separate execution action claims the operation before any provider POST. Current merchant API is `/v1.0/merchants/{merchant}/payments/{transaction}/refunds`, integer minor units. Checkout and transaction endpoints report major units. Exact checkout, successful transaction, merchant, reference, GBP, amount and competing claims must verify. Missing history/schema fails closed. API documentation does not promise a client idempotency key or uniquely correlated refund response. A 201 is therefore kept for owner verification of the exact refund event rather than inventing a correlation. Timeout/crash is NEVER retried. Existing OAuth/refund routes remain unchanged.

Evidence uses a separate deletable `EVENT_EVIDENCE_BUCKET`, opaque keys, three files / five MB each, PDF/JPG/PNG magic checks, quarantined by default. A trusted isolated scanner binding must return matching SHA256 and clean verdict before download. No scanner means no opening. Downloads require purchaser scope or HQ owner, use attachment/no-store/nosniff/sandbox. Explicit deletion removes bytes before tombstone/audit; failure remains retryable DELETE_PENDING. Legal hold prevents deletion. No automatic retention deletion exists: 90 days after closure is a proposal only. Legal review must also address free-text reasons, health data lawful basis/special-category condition, minimisation, privacy notice and processor agreements; optional evidence is not assumed to establish consent.

## Migration / integration

0040 adds request/operation/release/lineage/refund/evidence/session/outbox tables and effective views. It replaces only PR80's special-event capacity trigger with its net-allocation equivalent; regular guards remain. Apply **after** PR80 migrations 0038/0039 on a combined integration build. Existing capacity readers in this draft use net quantity/day places. Existing check-in still requires ACTIVE + PAID; the new database fence also rejects released sources. PR81's batch actions must be rehearsed against this schema before either feature is enabled. Do not reapply 0038 or replay policy seeds.

## Flags and remaining gates

Default OFF: EVENT_MANAGEMENT_ENABLED, EVENT_MANAGEMENT_NOTIFICATIONS_ENABLED, EVENT_REFUND_EXECUTION_ENABLED, EVENT_EVIDENCE_ENABLED. No production configuration or cron changed. Customer/admin POST and the existing scheduled handler can dispatch the new outbox through the existing transactional-email service using durable keys. Uncertain send is UNKNOWN_REVIEW, not an automatic resend; positively rejected sends may be retried. Confirmation outboxes and standard booking-confirmation copy are unchanged.

**Not production-ready yet:** independent security review; authenticated browser acceptance; scanner and private bucket provisioning; evidence/health-data legal review; combined PR80/81 integration; real provider contract verification with authorised sandbox only. Secure further-information replies, explicit refund execution/provider-event verification, deletion controls and independent scheduled/protected-automation notification fallback are now included. Do not enable until these gaps are resolved and staging is explicitly authorised.

## Rollout and rollback

1. Review combined dependency tree and migration history; take schema/config/Worker backups (no customer export into development).
2. Authorised synthetic staging only: apply 0038/0039 once, then 0040, feature flags OFF; verify existing purchase/confirmation/check-in, then enable each synthetic feature separately.
3. Independently approve production rollout. Deploy schema before compatible readers and leave actions OFF; monitor invalid/unknown queues without logging personal data. Enable only after acceptance and owner approval.
4. Roll back by disabling actions/sending/refund execution and retaining effective-admission readers and invalidation fences. Keep additive schema and all decisions, releases, lineage, financial/audit/outbox history. Never restore old admissions or drop tables. A pre-0040 Worker alone is not the supported rollback once cancellation decisions exist; retain this compatibility kernel.

Provider sources verified 20 November 2026: https://developer.sumup.com/api/transactions/refund/ and https://developer.sumup.com/api/transactions/get/ . No authenticated provider was contacted in development.

Owner gate independently verifies RS256 signature, pinned public keys (rotation fails closed), issuer, audience, expiry, not-before, owner email and configured HQ origin. Forwarded email alone is rejected. Isolated staging must use its own Access application/public-key configuration, never production authentication keys or services.
