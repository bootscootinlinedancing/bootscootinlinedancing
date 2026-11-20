# Johnny event-management validation — 20 November 2026

Development and local synthetic testing only. No production or remote staging deployment, migration, cron configuration change, real customer notification, refund, cancellation or attendance write occurred. All SumUp/Resend operations were mocks. The only production-derived development input was the previously saved schema-only snapshot; no customer rows or live provider credentials were loaded.

## Drafts and dependencies

- A / #82: customer request portal, cancellation/refund/transfer owner controls, private evidence quarantine and shared effective admissions. Migration 0040.
- B / #83: admission-product FIFO queues, verification, owner overrides, capacity-reserving timed offers, existing-checkout reuse/resume and notification processing. Migration 0041 after 0040.
- C / #84: private Saturday/Sunday/weekend registers, Print and downloadable A4 PDFs. No additional migration beyond 0040.

B and C are stacked on A, independently of one another. PRs 73–81 were not modified. Production main remained d8cffbcb6485fef2895345046f7ecbd0bba171f0. The original ranch.js UK-time working copy remained byte-identical to its protected backup.

## Executed tests

| Build | Complete validate result |
|---|---|
| A | 49 scripts, HTML/CSS checks, 17 regression suites passed |
| B | 52 scripts, HTML/CSS checks, 18 regression suites passed |
| C | 55 scripts, HTML/CSS checks, 18 regression suites passed |
| Combined #80 + #81 + A + B + C | 65 scripts, HTML/CSS checks, 23 regression suites passed |

Additional `TEST_RECONCILIATION=true node tests/event-management/waiting.mjs` passed in the combined build. Its synthetic flow verifies email, enforces FIFO/group capacity, reserves an offer, accepts it once, reuses the same hold for hosted checkout, verifies the synthetic captured transaction, fulfils three admissions and creates one confirmation record despite duplicate callbacks. Complimentary paid inserts are also fenced against reserved offers.

Covered: injected mid-operation rollback, full/partial cancellations, preserved original quantity/payment, duplicate and concurrent operations, changed-payload idempotency rejection, authorised versus uncertain/confirmed refunds, current SumUp endpoint/pence contract, competing payment claims, approved/declined transfers, used admissions, root lineage/no resurrection, per-day attendance, signed owner access and spoof rejection, OTP exhaustion/replay, scoped private evidence/signatures/limits/quarantine/deletion/legal hold, outbox concurrency, owner/customer DOM escaping/duplicate taps/disabled buttons/stable retry keys, FIFO blocking/overrides/offer expiry/pricing, and sanitized Unicode multipage PDFs.

PR80's existing payment and scheduler regressions and PR81's existing UI/server concurrency/loyalty/day-separation regressions pass in the combined build. No protected draft was edited to obtain this result.

## Local integration rehearsal

Local-only branch `codex/johnny-integration-review-20261120`, commit 59cc665a3f9d5c5792ccd02e9123de3feec6f96c. It was not pushed or deployed. It combines protected PR80 head 1d97ee70572318de3bea1b6152195259eba8d65e and PR81 head 1485d01fea01e2091016af3d583bbf63cd16c3d1 with the new feature code.

Future merge conflicts require review: retain all module imports; retain PR80 delegation of bounded recovery (do not restore the legacy hourly full-event scan); run new queue/outbox jobs independently using settled promises; preserve PR81's in-place register updates; resolve test-loader imports and apply 0038,0039,0040,0041 exactly once in that order. Migration 0040 replaces only the special-event capacity guard with net-allocation logic and adds an insert guard for complimentary/manual admissions. The regular payment guards remain unchanged.

Migrations were also applied to an empty reconstruction of the saved production schema, with PR80 migrations 0038/0039 first. SQLite integrity passed and foreign-key violations were zero. This is not a validation of live historical customer rows; a separately authorised read-only migration preflight remains required before production.

## PDF evidence

Six synthetic PDFs cover Saturday, Sunday and weekend in both A4 orientations, with 65 references each. Text checks verified every reference, accented names and absence of sensitive fields. Portrait/landscape renderings, repeated headers, row wrapping, checkboxes, notes and pagination were visually inspected. No customer ticket attachment/QR format or standard booking-confirmation template was introduced.

## Remaining gates / decisions

**GO for owner code review; NO-GO for production deployment.** Authenticated isolated Cloudflare staging and physical Safari/venue printing were not performed in this task; no remote staging was authorised. The local tests are not presented as those checks.

Before enabling customer requests/evidence: independent security review, private deletable bucket/scanner provisioning and validation, privacy/health-data safeguards and retention review. The proposed 90-day deletion period is inactive. Unknown refunds/sends remain manual review; never interpret local approval or a timeout as money returned or a delivered message.

Waiting lists currently cover ADMISSION products only. Competition ADD_ON queues are not implemented; owner must confirm whether those are eligible or a follow-on extension is required. Competition add-ons within a waiting-list admission checkout require a separate existing qualifying-admission purchase; no competition entitlement is silently dropped. These are explicit scope limitations.

## Staging / rollout / rollback

No stage/prod actions are authorised by these drafts. If separately approved: build the reviewed combined dependency tree; provision empty isolated D1/private storage and synthetic SumUp/Resend adapters only; apply 0038/0039 once then 0040 and 0041; first deploy all flags OFF, validate ordinary checkout/check-in/email, then enable one synthetic feature at a time. C needs A/0040 but does not need B/0041.

For production, obtain separate approval after staging and data/schema preflight. Never connect staging to production records or credentials. Never run older policy seed migrations.

Rollback A by disabling customer management, evidence upload, notifications and refund execution while retaining effective-admission readers, lineage/release fences and additive schema. Rollback B by stopping new joins/offers/notifications while leaving existing offers accessible until honoured or their original deadlines expire; keep expiry processing and claims. Rollback C by disabling its flag/removing only export UI/routes/assets. Preserve decisions, payment/refund history, offers, outboxes, allocations and audits; never restore cancelled/transferred source admissions or delete history.
