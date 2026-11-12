# Fast check-in and register usability

Draft only. No production attendance, customer, payment, booking or email operations were performed.

## Confirmed cause

`checkInAttendeeFromRegister()` and the legacy lead check-in called `loadClassRegister()`, which cleared the register HTML and called scrollIntoView. The special-event check-in handler called `loadSpecialEvents()`, rebuilding the entire event panel and filter form. That explains both scroll jumps and lost event filters.

## Resulting behavior

Class person check-in updates the existing attendee object, button, row highlight and checked-in counters in place. The shared `check-in-ui.js` control retains the search query, attendance filter, register/day context, selected attendees, DOM nodes and scroll. Newly checked rows remain visible until the operator changes filters, so the success confirmation does not disappear or move the next row. The legacy lead control also updates in place and rejects unpaid bookings. Existing corrections retain their explicit audit confirmation.

Multi-select is opt-in, with a selection count, clear action and explicit "Check in N people" button. Each request is bounded to25 people and reports a result for each. Successful people leave the selection; failed or uncertain people remain. A retry retains its operation ID. Network errors do not optimistically count attendance, rapid taps are coalesced and late responses never patch a different register. Group/family attendees are selected individually; unnamed places cannot be invented or checked in as real people.

Johnny uses the same controls, with a mandatory single Saturday or Sunday selection for bulk check-in. The day selector is disabled while its bulk request is in flight. Single-day buttons remain available in the existing all-days view. Day admission totals and capacity-card attendance counters update locally. An already recorded admission is an idempotent success; it does not imply checking in for another day.

Backend writes revalidate current payment, cancellation, class/event and day entitlement. Regular conditional writes and existing unique attendance/loyalty constraints preserve one attendance/credit. Event conditional UPDATE plus audit insertion is one D1 batch, recording only a successful state transition. Bulk deliberately allows partial success, with no new global transaction that loses good check-ins because one attendee is ineligible. New controls call authenticated same-origin existing admin routes.

## Validation

`npm ci` then `npm run validate` (Node22+ with node:sqlite; validation here ran on Node26).

15 suites pass, including actual renderer/controller DOM tests and synthetic SQLite tests for single/bulk check-in, simultaneous staff requests, duplicate taps, cancellation between read/write, unpaid/wrong-class people, partial failures, retry, immutable audit and unchanged loyalty. Event end-to-end tests cover Saturday/Sunday separation, social-only entitlement, cancelled complimentary attendees and repeated/concurrent family operations. The DOM tests cover search/filters, stable row identity, scroll, complimentary/group entries, running totals and navigation during in-flight requests.

A localhost-only synthetic fixture was visually reviewed at390px mobile iframe width and desktop width using the actual register HTML/CSS. No production services were used. Touch controls are at least48px high; named selection checkboxes have enlarged labels/spacing.

## Deployment and rollback (owner approval required)

No migration. Deploy backend and frontend assets together (`_worker.js`, `special-events.js`, `ranch.js`, `ranch.html`, `check-in-ui.js`, `check-in.css`). The script and stylesheet are versioned; do not publish the new frontend against an old backend. Stage with synthetic paid/unpaid/cancelled/complimentary/group attendees before approval. Validate exact one loyalty credit, one event-day admission and failed-row retention on an iPhone.

Rollback by restoring the recorded previous Pages version/assets. Existing attendance/loyalty/audit rows are untouched by deployment and remain in place during rollback. No destructive schema rollback is needed.

This PR starts independently from current main. PR80 changes other parts of `_worker.js`, `special-events.js`, `ranch.js`, validation and test harnesses. An isolated combined-source rehearsal passes all16 suites. Validation entries are placed separately to avoid an unnecessary merge conflict; the new test loader accepts PR80’s shared module. Rebase after whichever PR lands first and rerun the combined suites. PR73–77 and protected local UK-time/timetable work remain unchanged. No unrelated HQ page redesign or payment change is included here.

## Final safety review — 12 November 2026

Corrected a slow-network scroll defect: the controller formerly restored the scroll position captured at tap time. If staff scrolled further while awaiting the response, that restoration jumped backwards. Stable rows now update without any forced scroll; a regression checks scrolling during an in-flight request. The actual renderer/controller retains its DOM rows, filters, selection and class/day context. Existing single and bulk backend tests cover concurrent staff, failed rows, groups/complimentary people, immutable attendance audits and one loyalty credit per eligible person/session. Saturday and Sunday remain separate admission keys.

Independent branch validation:15 suites. The payment areas of `_worker.js` and `special-events.js`, migrations, email processors and automation worker are unchanged by this PR; only check-in helpers/routes and their client controls are changed. No schema migration or dependency on PR80 is introduced. Deploy all of PR81's backend and frontend assets together. After PR80 is deployed, replay PR81 on that new main and rerun the combined tests; do not publish a stale full worker that would remove PR80.

Physical iPhone Safari was NOT tested. The available iPhone Mirroring app reports “iPhone in Use” and is disconnected. The prior visual review used a localhost synthetic register with real renderer/CSS at390px and desktop widths; jsdom tests verify stable DOM and mobile rules, not Safari layout/touch/keyboard behavior. A physical-device smoke check remains a release gate: search with keyboard open, scroll during a slow check-in, tap individual/family/multi-select actions, retain failed selections, switch day after a completed request, and verify day counts/loyalty on synthetic staging records. Do not perform these attendance writes on the live customer register.

Readiness: GO for staging/review of the corrected commit; NO-GO for final production release until the physical Safari smoke (or an explicit owner waiver of that limitation) and combined-on-new-main check are complete. No code/cron/database deployment occurred during review.

Deploy PR80 first and observe its monitored gates including one hourly email cycle. Then stage/approve PR81 independently. Record the Pages version immediately BEFORE PR81 (which must include the deployed PR80). Roll back PR81 by restoring that version/assets; never restore the pre-PR80 version just to undo check-in UI. Attendance, loyalty, audits and payment history stay in place. No schema reversal, payment flag change, reconciliation cron change or email replay is part of PR81 rollback.

## Isolated hosted staging correction

Staging review found an undefined attendee variable in the unnamed-guest placeholder. A booking with more reserved places than named attendees could throw while rendering the register. The placeholder now remains plain capacity information, with no selectable person checkbox. The real-renderer regression first reproduced the error, then passed with one named lead plus one unnamed place; expected attendance remains two. The frontend cache version was advanced. This is a targeted register correction; no payment, timetable or production record changes are included.
