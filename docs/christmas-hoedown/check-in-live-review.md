# Live check-in review — 21 November 2026

Read-only live inspection. No attendance action was submitted against a customer register.

## Finding

Public live `/ranch.js` is byte-for-byte current production main d8cffbcb6485fef2895345046f7ecbd0bba171f0. SHA256: 2748dcf8ca6380132aa00bfe5508f4f9db01aa55535dfb9c3271732917ca9d61. It does not match PR81 head 1485d01fea01e2091016af3d583bbf63cd16c3d1. The new check-in helper is not served as JavaScript at `/check-in-ui.js`; that missing-asset request falls through to HTML.

Current live class person check-in ends with `await loadClassRegister(classId)`; the older booking-level action also refreshes that register. Johnny's `CHECK_IN_ATTENDEE` handler ends with `await loadSpecialEvents()`. These reload and rebuild the register/event DOM. This explains loss of the open view, scroll and filter/search state; it is an application refresh, not necessarily a full browser navigation.

PR81 is still OPEN and DRAFT. The observed live behaviour is explained by that fix not being deployed. There is no evidence here that a deployed PR81 has failed. A production write was deliberately not used to reproduce the symptom.

## Existing fix — reuse, do not duplicate

PR81 patches existing rows/state instead of reloading; updates totals; keeps class/day/register context, search, filters, selection and response-time scroll; coalesces duplicate taps; retains uncertain/failed selections for retries; and offers bounded multi-selection. Group/family members remain distinct named attendees. Unnamed capacity placeholders are not invented as people.

The backend revalidates PAID/active/class/day eligibility and uses conditional writes and immutable audit/idempotency operations. Loyalty remains at most one credit per eligible person/session. Johnny Saturday and Sunday remain separate attendance keys. The draft also contains the earlier fixes for unnamed-guest rendering, runtime DDL delays, CSS hidden rows, contrast and response-time browser anchoring.

Exact PR81 archived source rerun: `npm run validate` passed 43 scripts and 15 suites. No PR81 file or remote branch was modified. The test archive uses a temporary path without spaces because the original validator has an encoded-file-URL pathname issue; this is a runner portability issue, not a new live check-in defect.

## Safest release path — approval still required

1. Reuse the exact existing PR81; do not implement a second check-in controller in the Christmas PR.
2. Review/rebase only after approval onto the main that will actually be deployed. The prior rollout order was PR80 then PR81. If PR80 is deployed first, preserve its worker/payment/email changes when integrating PR81; never deploy the old complete worker over it.
3. Deploy backend and frontend together in explicitly authorised synthetic staging: `_worker.js`, `special-events.js`, `ranch.js`, `ranch.html`, `check-in-ui.js`, `check-in.css`, including cache versions.
4. Use synthetic paid/unpaid/cancelled, family, complimentary and unnamed-place examples. Exercise individual, multi-select, partial failures, rapid duplicate taps, search/filter persistence and scrolling during delayed responses. Verify totals and exactly one loyalty credit; verify Saturday does not check in Sunday.
5. Physical iPhone Safari acceptance remains outstanding: keyboard open, search, scroll, touch targets, failed selection retention and delayed-response anchoring. Desktop/mobile Chromium and DOM tests are not evidence of physical Safari behaviour. Owner can decide explicitly whether to waive this gate; no waiver is assumed.
6. Obtain separate merge/production deployment approval. Confirm the served controller/HTML/CSS cache versions and successful synthetic smoke checks after deployment. A read-only production check can verify the assets; customer attendance writes need their own authorisation.

PR81 has no database migration or payment dependency. Its code can be reviewed independently; the order above preserves the owner's existing staged rollout plan. Roll back only to the Pages version immediately before PR81, retaining any already-deployed PR80. Keep attendance, loyalty and audit history; do not replay check-ins or remove payment changes to undo UI changes.
