# Christmas Hoedown calendar entry — draft only

No production write, migration, merge, deployment, charge, refund, email or attendance change is authorised or performed by this draft.

## Live inspection

On 21 November, the public calendar contained ten published entries and none for 18 December. A separate production D1 SELECT checked all statuses for 18 December, Christmas titles and Bradley Rivers references: zero matching rows, zero rows written, `changed_db=false`. This includes unpublished/cancelled entries. Recheck immediately before any approved installation, because another owner may create a row in the meantime.

## Proposed calendar and ticket

- Boot Scootin’ Christmas Hoedown, Friday 18 December 2026.
- Low Places Bar, Digbeth, Birmingham (existing venue address 60–64 Heath Mill Lane, B9 4AR).
- 50 places; owner confirmed. Start 7:15 pm Friday; finish 1:00 am **Saturday 19 December**, owner confirmed.
- One £8 admission, internal existing code CLASS_SOCIAL with label “Christmas Hoedown admission”. No £6/£4/beginner/improver alternatives. No class-pass or promo option is enabled for this new event without separate approval.
- Explicit Christmas social description and one hour of teaching, 7:30–8:30 pm with Christmas song swaps.
- 8:30 pm Santa’s Naughty List elimination; 8:50 pm social and requests; 9:00 pm Bradley Rivers live. Last dancer standing wins one month of free line dancing. This displays the prize only; it does not create/issue vouchers or invent redemption terms.

The supplied PNG was found in Downloads and copied unmodified as `christmas-hoedown-18-december-2026.png`. Source and copy share SHA256 d52ed7b5732f228fef367007e9486f6379ed58dce3937b6ef9a83c1e59581056. Scoped CSS preserves the complete image, including logos, wording and price, without cropping. The programme and prize remain visible rather than hidden behind Read more. No artwork generation/editing or alternate flyer was used.

## Existing infrastructure reused

Migration 0042 inserts one **draft** row in existing `classes` and a disabled class-pass eligibility row. It adds a narrowly scoped duplicate/configuration guard. A duplicate of any status at Low Places on that date aborts for review; a changed pre-existing target row also aborts. Reapplication does not overwrite a matching row or reopen a closed/cancelled row. No booking/customer/payment or published policy is updated.

The existing public calendar, detail view, standard reservation/hold, named attendees, SumUp hosted checkout, payment callback and durable confirmation outbox are reused. Server-side product resolution restricts this class to £8 regardless of a client-submitted price, social-only code or accidentally copied £6/£4 settings. Other classes retain their normal options. Custom snapshots retain event ticket type, price and times in the usual confirmation; no separate PDF/QR ticket or new email service is introduced. Google/Apple calendar dates include the next-day 1:00 am finish.

No PR81 check-in code is copied into this branch. Its live-versus-draft comparison is documented separately in [check-in-live-review.md](check-in-live-review.md).

## Tests

- Self-contained SQLite reconstruction uses a schema-only fixture without production customer rows. Migration draft status, exact event fields, repeated application, conflicting pre-existing IDs and unpublished duplicates are checked.
- Real local Worker routes with mocked provider responses: public draft hidden, synthetic publication, one £8 product, rejection of cheaper/combined/social tickets and promo codes, two admissions at £16, named attendee allocation, exact synthetic paid checkout, repeated webhook, one confirmation job, standard confirmation date/venue/ticket/programme/price and next-day calendar end.
- Flyer SHA256 preservation and malicious/accidental copied price configuration checked.
- Desktop and 390px Chromium: actual calendar/details and popup, original flyer, full prize/programme, single £8 option, one-column ticket layout, hidden promo/credit controls, no horizontal overflow and synthetic two-person checkout submission. All external requests blocked. This is not a physical iPhone Safari test.
- `npm run validate`: syntax, HTML IDs, CSS structure and existing regression suites.

Optional browser test: serve this checkout on localhost, run the regression with `CHRISTMAS_EVIDENCE` pointing to an output directory, then run `tests/christmas-hoedown-browser.mjs` with `CHRISTMAS_CALENDAR_FIXTURE` set to its synthetic JSON and Playwright available. The script refuses non-localhost origins and blocks external requests.

## Approval / deployment / rollback

The production event does **not** yet exist. After separate approval: recheck current main/deployed SHA, migration history and duplicates; back up the deployment/configuration; apply 0042 to the correct database, then deploy compatible Worker/frontend/artwork together. Check the draft in HQ. Opening this new entry from draft to open is a separate explicit publication action; do not publish by editing existing events.

0042 reserves the next unused number after the draft 0038–0041 work. It is independently additive; it does not require merging PRs80–84. Preserve any payment/check-in improvements already landed when rebasing. Follow the agreed PR80→PR81 order if releasing those fixes first; do not publish a stale Worker that removes them.

Rollback by closing **this new event** to new sales using the existing audited HQ process and restoring the previous compatible assets after approval. Do not delete the event after any booking exists; keep its attendee/payment/outbox history. Do not undo cancellation decisions, published policies, existing attendance or other classes. Do not drop unrelated migrations. Any refunds, cancellations or customer messages require separate owner approval.

Production recommendation: NO-GO until owner review and explicit merge/migration/deployment/publication approval. Physical Safari remains a check-in release gate as detailed in the review.

## Final validation evidence

- Christmas branch: **14 suites passed**, 42 scripts plus HTML/CSS checks.
- Exact original PR81 archive: **15 suites passed**, 43 scripts.
- Christmas + PR81 local rehearsal: **16 suites passed**, 45 scripts.
- Christmas + PR80 + PR81 local rehearsal: **18 suites passed**, 49 scripts.
- The Christmas booking regression also passed with `TEST_RECONCILIATION=true` in that combined build: synthetic £16 captured checkout, two named attendees and one confirmation job.
- Desktop 1440×1000 and mobile 390×844 actual Chromium browser submissions passed, with all external requests intercepted/blocked. Flyer containment, visible programme/prize, one £8 product, correct teaching/finish times, promo/credit controls and horizontal bounds were checked. Screenshots were visually reviewed. Physical iPhone Safari remains untested.

Local-only combined branch: `codex/fast-checkin-review-20261121`, commit `def8b27b1ef714f80d4e784691bf8b3573e68477`. It was not pushed or deployed. The only merge conflict was combining independent test entries in the validator; the actual check-in/payment source merged without overwriting either draft. Production main remained `d8cffbcb6485fef2895345046f7ecbd0bba171f0`.

Protected remote heads checked unchanged: PR80 `1d97ee70572318de3bea1b6152195259eba8d65e`, PR81 `1485d01fea01e2091016af3d583bbf63cd16c3d1`, PR82 `5de68438fb05e9ac68b1595cd93096d3fdeb7adb`, PR83 `d85e1cc6691ecbf7cde6c13bcbc386a22743aa54`, PR84 `e9c8434b57b823b79f3bd8f121fd95367aef9485`. PR73–77 were also unchanged. The protected original ranch.js remains byte-identical to its existing UK-time backup.
