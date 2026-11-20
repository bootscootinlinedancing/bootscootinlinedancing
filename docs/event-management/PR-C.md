# Printable Johnny registers — draft, no rollout authorised

Stacked on PR A's effective-admission foundation. Independent of waiting lists. No new migration beyond 0040; PR80/81 remain unchanged.

Owner-only `/ranch/event-registers` offers Saturday 20 February, Sunday 21 February and full-weekend registers, A4 portrait/landscape, Print and a real downloadable PDF. Names, original references, pass types, permitted sessions, per-day checkboxes, expected/checked totals, handwritten note space and London generation time are included. The exported data uses an explicit allowlist: no customer email, payment, guardian/health information, management tokens or QR/admission credentials. Cancelled, transferred-source, unpaid and invalid admissions are excluded by the same effective-attendee view and PAID/ACTIVE checks as check-in. Saturday and Sunday attendance remain independent.

PDF rendering is entirely local to the owner browser with pinned self-hosted pdf-lib/fontkit and an embedded Noto Sans font. No external PDF service/CDN or customer-data upload. Unsupported glyphs cause an explicit Print fallback rather than corrupting a name. Export always refreshes the private no-store source before printing/downloading. No attendance writes, ticket attachments, customer email changes or new customer ticket format.

Flag default OFF: EVENT_REGISTERS_ENABLED. Shared signed owner gate is provided by PR A. Protected JSON and page responses are private/no-store. Existing HQ has a separate Print / PDF link; PR81 itself is untouched.

Synthetic tests check privacy fields, paid/cancelled filtering, day counters, access denial, Unicode, pagination and A4 dimensions for all three scopes in both orientations. Six synthetic PDFs generated for visual QA, with long names and 65 rows to exercise repeated headers and page breaks. Remaining gates: authenticated browser acceptance, joint PR81 check-in dataset verification, vendor notice review, and physical venue print check. No physical iPhone testing is claimed.

Rollout: after PR80/81 integration and PR A/0040, explicitly authorised isolated staging with synthetic attendees; enable only EVENT_REGISTERS_ENABLED and test current check-in versus exports. Production still requires separate approval. No remote staging or production deployment has occurred.

Rollback: turn off EVENT_REGISTERS_ENABLED and remove only the new HQ link/export route/assets in a compatible build. Keep PR A views/invalidations and all admission/payment/request/audit records. This branch never changes live attendance or capacity. Do not roll back the shared cancellation foundation by restoring cancelled admissions.
