## v96.0.0 – Honky Tonk visual redesign

- Rebuilt the visual identity around matte black, warm cream and neon red.
- Preserved the Boot Scootin’ silhouette logo and made it more prominent.
- Added a professional Western SVG icon system to replace standalone emojis.
- Added richer cards, buttons, typography, textures and subtle neon motion.
- Converted the mobile navigation into contained drill-down sections.
- Prevented users from rolling through unrelated menu groups; each group now has an intentional back action.
- Applied the new visual system across public pages, The Boot Room and HQ pages.
- Updated visible platform versioning and asset cache references to v96.0.0.

# V95.0.0 – Customer Portal, Rewards Wallet & Achievements

- Expanded My Bookings into a personal Boot Scootin’ customer portal.
- Added lifetime spend, activity status and available-reward summaries.
- Added My Rewards wallet for birthday, loyalty and personal promotion codes.
- Added customer achievements for first class, 10, 25 and 100 classes, plus Birthday Dancer.
- Kept secure booking access, cancellation controls and calendar downloads.
- Personal rewards remain tied to the customer email and their existing promotion rules.
- Updated portal styling for mobile and desktop.

# V94.0.0 — Promotions & Rewards Engine

- Added a secure promo-code box to the public booking form with live validation and an itemised discount total.
- Added percentage, fixed-value and free-class promotions.
- Added personal birthday rewards: 20% off one class, one use, valid for 30 days.
- Added automatic loyalty rewards: after nine attended classes, the tenth class is free; one use, valid for 90 days.
- Personal rewards are tied to the customer email address and cannot be used by another customer.
- Promo discounts are calculated and revalidated by the Worker before SumUp checkout creation.
- Zero-balance free-class bookings are confirmed without opening SumUp.
- Added HQ Promotions & Rewards management, activation controls and redemption totals.
- Added D1 migration `migrations/0009_promotions_rewards.sql`.

# Boot Scootin’ Platform v93.7.0

## Protected Email Automation Scheduler Bridge

- Added a protected `POST /api/automation/run` endpoint for the standalone Cloudflare scheduler Worker.
- Added shared-secret authentication using `EMAIL_AUTOMATION_SECRET`.
- Added SHA-256 digest comparison so secrets are not compared directly or returned.
- Added structured success and failure responses for scheduled campaigns and automatic customer journeys.
- Added a ready-to-paste standalone Worker in `scheduler-worker/worker.js`.
- Added scheduler health output without exposing secret values.
- Added a 55-second request timeout and clear Cloudflare logs.
- Preserved duplicate protection for reminders, birthdays, welcome emails and follow-ups.
- Updated HQ and Worker versions to v93.7.0.

# Boot Scootin’ Platform v93.6.0

## Automated Customer Journeys & Unsubscribe

- Sends a welcome email automatically after a customer opts into the mailing list.
- Sends class reminders approximately 48 hours before class and again on the class-day morning.
- Sends birthday emails automatically to opted-in customers with a birthday saved in CRM.
- Prepares a draft mailing-list announcement whenever a new class is created.
- Emails booked customers automatically when class date, time, venue or title changes.
- Retains automatic class-cancellation and booking-update emails.
- Keeps dance recap emails editable for the instructor to add dances and links manually.
- Adds HQ automation on/off controls and recent automation history.
- Adds signed unsubscribe links to every marketing email and immediately records opt-outs.
- Essential booking, cancellation and safety messages remain separate from marketing consent.
- Uses duplicate-protection logs so automatic messages are not sent twice.
- Requires an hourly Cloudflare Cron Trigger: `0 * * * *`.
## V93.5.0 — Branded Emails & Automatic Reminders

- Added the Boot Scootin’ logo and full branded styling to transactional and campaign emails.
- Added Manage My Booking, Google Calendar, Apple/Outlook calendar and venue directions buttons.
- Added website, Instagram and WhatsApp Community links to email footers.
- Improved class date and time formatting for UK customers.
- Routed booking-related emails through the bookings sender address.
- Added automatic 24-hour class reminders and same-day reminders.
- Added automatic thank-you emails after attended classes.
- Kept notification delivery idempotent so reminders are not sent twice.
- Updated HQ, Worker and service-worker versions to V93.5.0.

## V93.4.0 — Email Centre Reliability & Smart Recipients

- Prevented Email Centre API failures from becoming unhandled Worker exceptions.
- Added clear Resend HTTP and provider error messages.
- Added automatic customer audiences from the CRM and booking database.
- Added all-customer, waiting-list and individual customer audience options.
- Added searchable customer selection with Select all and Clear controls.
- Kept manual email entry only as an optional audience.
- Added departmental sender selection for general, bookings, events and memberships.
- Added automatic exclusion of unsubscribed email addresses.
- Updated HQ and asset cache versions to V93.4.0.

## V93.2.0 — Customer CRM

- Added a complete Cloudflare-protected customer profile for every customer.
- Added customer health status: Active, At risk and Inactive.
- Added lifetime spend, attendance rate, upcoming bookings, loyalty and customer-since metrics.
- Added booking history, activity timeline and communication history.
- Added private instructor notes with audit records.
- Added editable customer tags for targeted communications.
- Added optional birthday, emergency contact, medical/accessibility notes and loyalty adjustment fields.
- Added a one-click Compose email action from a customer profile.
- Added D1 migration `0008_customer_crm.sql`.
- Updated HQ and service-worker caches to V93.2.0.

# v93.1.1 — Email Templates & SumUp Approval Guard

- Added reusable templates for booking follow-ups, cancellation updates, refund confirmations, waiting-list places, birthdays, re-engagement, newsletters, new dances, instructor announcements, holiday closures and weather cancellations.
- Prevents accidental SumUp reconnection attempts while the OAuth `payments` scope is still awaiting manual activation.
- Replaces the reconnect action with a disabled **Waiting for SumUp approval** state.
- Keeps a protected **Reconnect now** action for use only after SumUp support confirms activation.
- Updates HQ and service-worker cache versions to v93.1.1.
- Keeps the root folder below the GitHub browser-upload limit.

# v93.1.0 — Booking Management & Email Centre

- Added a new HQ **Emails & Mailing List** area.
- Added subscriber register based on recorded marketing consent.
- Added reusable email templates with editable placeholders.
- Added audiences for subscribers, class bookings, class attendees and selected recipients.
- Added audience preview, test-send, send-now and campaign scheduling.
- Added campaign history, cancellation and due-campaign processing.
- Added a Cloudflare scheduled handler for Cron Trigger delivery.
- Added signed marketing unsubscribe links and consent withdrawal records.
- Added mobile-responsive Email Centre styling.
- Kept setup and report files under `docs/` to protect the GitHub root-file limit.

# Boot Scootin’ Platform v93.0.3

- Forces every new SumUp OAuth request to include `payments`, `transactions.history`, and `user.profile_readonly`, even if an older Cloudflare scope variable omits one.
- Adds a fresh reconnect flow that removes the locally stored grant before requesting a new authorisation code.
- Shows the exact permissions SumUp granted inside HQ.
- Keeps automatic refund buttons disabled until the granted token actually contains `payments`.
- Explains when the SumUp application still needs manual Payments-scope activation.
- Updates HQ and service-worker caches to v93.0.3.

# Boot Scootin’ Platform v93.0.2

- Background refund execution prevents Cloudflare 520/timeout pages.
- Refund requests immediately enter REFUND_PROCESSING and complete safely in the Worker background.
- Failed refunds become REFUND_FAILED with a trace ID and detailed audit-log entry.
- OAuth now requests the SumUp payments scope in addition to transaction history. Reconnect SumUp after deploying to grant the updated scope.

- Repairs the HQ **Connect SumUp refunds** control so it renders as a full-width red action button on mobile and desktop.
- Replaces obsolete `ranch91-button` classes with the platform’s existing `.button` styles.
- Styles reconnect and disconnect controls consistently.
- Updates the HQ release label, JavaScript cache key and service-worker cache.

# V93.0.0 — Automatic SumUp Refunds OAuth

- Adds a real **Connect SumUp refunds** action in HQ.
- Adds the OAuth start route at `/api/admin/sumup-oauth/connect`.
- Adds the public SumUp callback route at `/api/sumup/callback`.
- Exchanges the SumUp authorisation code for access and refresh tokens.
- Encrypts OAuth tokens before storing them in D1. A separate `SUMUP_OAUTH_ENCRYPTION_KEY` may be used, but the existing OAuth Client Secret is used securely as the encryption source when no separate key is configured.
- Automatically refreshes expired SumUp access tokens.
- Adds connected, reconnect and disconnect states in HQ.
- Enables **Refund payment** only after the merchant has completed the SumUp authorisation flow.
- Refunds the exact SumUp transaction UUID attached to the selected booking.
- Shows customer name, email, phone, places, amount paid, booking reference, checkout ID, transaction code, transaction UUID and paid date.
- Keeps the manual refund-recording option clearly separate; it never moves money.
- Moves historical setup and test reports into `docs/` so the root remains below the GitHub web-upload limit.
- Rotates HQ and service-worker caches to V93.0.0.

## Cloudflare values required

- `SUMUP_OAUTH_CLIENT_ID` — Secret
- `SUMUP_OAUTH_CLIENT_SECRET` — Secret
- `SUMUP_OAUTH_REDIRECT_URI` — Text, value `https://bootscootinlinedancing.co.uk/api/sumup/callback`
- Optional: `SUMUP_OAUTH_ENCRYPTION_KEY` — Secret, for an independently rotated token-encryption key

After deployment, open HQ → Bookings and press **Connect SumUp refunds**.

---

# V92.7.2 — SumUp OAuth Connect & Booking Details

- Adds **Connect SumUp refunds** directly inside HQ.
- Adds the registered callback route: `https://bootscootinlinedancing.co.uk/api/sumup/callback`.
- Implements SumUp authorization-code OAuth with state validation.
- Stores access and refresh tokens encrypted in D1.
- Refreshes expired access tokens automatically before a refund.
- Adds reconnect and disconnect controls in HQ.
- Enables **Refund payment** only when the merchant OAuth connection is active.
- Shows customer name, email and phone prominently on each booking.
- Shows amount paid, payment status, booking reference, checkout ID and transaction identifiers.
- Consolidates setup and historical test reports into `docs/` so the top-level GitHub folder remains below 100 files.
- Rotates HQ and service-worker caches to V92.7.2.

# V92.7.1 — Customer Identification & Refund Connection Status

- Shows the customer name prominently and labels it clearly on every HQ booking card.
- Shows email and phone beside the customer name for safer cancellation and refund decisions.
- Requires first name and surname on all new public bookings so future records are identifiable.
- Adds an explicit SumUp refund-connection panel in HQ.
- Disables the automatic refund action until a user-authorised `SUMUP_REFUND_ACCESS_TOKEN` is configured, preventing it from looking like a broken button.
- Clarifies that the manual refund action records a refund only after money has already been returned through SumUp.
- Automatic refunds remain tied to the exact checkout and transaction UUID stored against that booking.
- Rotates HQ and service-worker caches to V92.7.1.

# V92.7.0 — Transaction Details & OAuth Refunds

- Adds customer-linked SumUp payment details to every HQ booking.
- Shows booking reference, checkout ID, transaction code, transaction UUID and paid timestamp.
- Adds copy buttons and a protected “Refresh SumUp details” action.
- Keeps automatic refunds tied to the exact transaction stored against that booking.
- Makes the manual-refund wording explicit that it records a refund only after money was returned in SumUp.
- Shows whether automatic OAuth refunds are connected in the bookings API response.
- Rotates HQ and service-worker caches to V92.7.0.

# V92.6.9 — SumUp Refund OAuth Safe Flow

- Stops HQ from attempting transaction refunds with the checkout API key.
- Adds support for a dedicated user-authorised OAuth token through `SUMUP_REFUND_ACCESS_TOKEN` (or `SUMUP_OAUTH_ACCESS_TOKEN`).
- Returns a controlled HQ message when automatic refund authorisation is not configured, instead of calling SumUp and risking an incomplete Cloudflare response.
- Keeps bookings as `CANCELLED / REFUND_DUE` unless SumUp accepts the refund.
- Adds **Record manual refund** for refunds completed directly in the SumUp dashboard/app.
- Manual refund recording updates HQ revenue/status, preserves the audit trail and triggers the refund customer notification workflow.
- Rotates HQ and service-worker caches to V92.6.9.

# V92.6.8 — SumUp Refund Timeout Guard

- Adds a hard 10-second timeout to every SumUp API request so the Cloudflare Worker always returns a valid response.
- Prevents stalled SumUp sandbox requests from producing Cloudflare invalid/incomplete origin responses.
- Keeps a booking at REFUND DUE unless SumUp confirms the refund.
- Adds a clear message when the configured SumUp credential cannot authorise refunds.
- Rotates HQ and service-worker caches to V92.6.8.

# V92.6.7 — SumUp Refund Execution Hardening

- Rebuilds the refund action as an isolated, early-return workflow so it cannot fall through into unrelated HQ actions.
- Requires the official SumUp transaction UUID before a refund request is sent.
- Separates transaction lookup, SumUp submission, D1 recording and customer notification into individually guarded stages.
- Returns controlled JSON for missing transaction IDs, SumUp rejection, network failure and D1 recording failure.
- Extends the HQ refund request timeout to 30 seconds for slower sandbox responses.
- Rotates the HQ bootstrap and service-worker caches to V92.6.7.

# V92.6.6 — SumUp Refund Route Hotfix

- Re-resolves the official SumUp transaction UUID from the original checkout before sending a refund.
- Prevents transaction codes or stale identifiers from being sent to the refund endpoint.
- Catches SumUp network, API and D1 errors and returns a readable HQ message instead of an unhandled Cloudflare Worker exception.
- Records failed refund attempts in the audit log without changing the booking from REFUND_DUE.
- Updates the booking to REFUNDED only after SumUp accepts the refund.
- Keeps notification failures separate so an email/SMS issue cannot undo a successful refund.
- Rotates the service-worker cache to V92.6.6.

# V92.6.2 — SumUp Payment Confirmation Sync

- Added the official SumUp checkout-status webhook through `return_url` so successful hosted payments update D1 automatically.
- Added server-side reconciliation when the confirmation page, HQ dashboard or HQ bookings list checks a pending SumUp payment.
- Made payment confirmation idempotent so repeated redirects, refreshes and webhooks cannot add class capacity twice.
- Rebuilt the booking confirmation script with safe URL construction, clear fallback messaging and short automatic polling while SumUp finalises the checkout.
- Fixed public availability double-counting the same pending booking and its active booking hold.
- Updated all release and cache versions to V92.6.2.

# v92.6.1 — HQ Add Class hotfix

- Removed the premature bootstrap-mode gate that could make **Add a class** appear unresponsive while HQ bootstrap was still loading or cached.
- The class editor now opens immediately on mobile and desktop; Cloudflare Access remains enforced by the protected save API.
- Added resilient direct and delegated click handling for the Add a class control.
- Bumped the HQ script query and service-worker cache version to prevent stale v92.6.0 JavaScript being reused.

# V92.6.0 — HQ Action Button Repair

- Repaired all previously unwired HQ buttons on mobile and desktop.
- Added a complete class editor for creating and updating classes through the existing D1 admin API.
- Added class refresh, filtering, summary totals, duplicate, open/close and protected delete actions.
- Added working CSV exports for bookings and customers.
- Connected the R2 media status check and media upload form.
- Added mobile modal and class-action styling, loading states, error handling and refreshed cache-version references.
- Kept Cloudflare Access, D1, R2 and SumUp connection names and backend configuration unchanged.

# V92.5.0 — SumUp Sandbox Hosted Checkout

- Added server-side SumUp Hosted Checkout creation for class bookings.
- Added `valid_until` so each payment checkout expires with its 15-minute booking hold.
- Added live server-side SumUp credential verification through `/v0.1/me`.
- System Health now reports Payments READY only after SumUp accepts the configured API key.
- Added safe checkout failure cleanup so a failed payment-page launch does not leave a booking or hold behind.
- Kept API keys out of the archive and GitHub; Cloudflare secrets are required.
- Added `SUMUP_SANDBOX_SETUP.md` with the exact Cloudflare variable names.

## [V92.4.8 ADMIN PROTECTION HEALTH CHECK] — 2026-08-05

- Fixed the System Health panel incorrectly reporting **Admin protection — SETUP** after a successful Cloudflare Access login.
- The health endpoint now marks Cloudflare Access as **READY** whenever the protected administrator request has passed the Access and authorised-email checks.
- Added a clear verified-session detail to the Admin protection health card.
- Updated Ranch asset and bootstrap cache versions to prevent stale health results.

## [V92.4.7 CLOUDFLARE ACCESS COOKIE DETECTION] — 2026-08-05

- Fixed HQ falsely showing “Public pilot mode” after a successful Cloudflare Access one-time-code login.
- Added detection of the signed `CF_Authorization` session cookie when Cloudflare does not forward the authenticated-email or JWT assertion headers to Pages/Workers.
- HQ now correctly reports Protected HQ mode, Cloudflare Access Connected, and removes the Protect HQ task after login.
- Updated Ranch asset and bootstrap cache versions to prevent stale V92.4.5/V92.4.6 status data.
- Kept both secure logout buttons and verified logout still returns to the Cloudflare Access login screen.

## [V92.4.6 ACCESS SESSION DETECTION FIX] — 2026-08-05

- Detects the authenticated administrator from either Cloudflare's email header or the signed Access JWT assertion.
- Corrects the HQ protection banner and Cloudflare Access connection card after a successful one-time-code login.
- Treats the Access allow policy as the active administrator restriction when the optional ADMIN_EMAIL variable is not present.
- Keeps both secure logout buttons from V92.4.5.

## [V92.4.6 SECURE HQ LOGOUT & ACCESS STATUS] — 2026-08-05

### Added
- Added a quick **Log Out** button in the HQ header.
- Added a second **Log Out Securely** button at the bottom of the HQ menu.
- Added a visible **Welcome, Nora** administrator greeting in both locations.

### Fixed
- Moved every HQ admin API request beneath `/ranch/api/admin/*` so the requests are covered by the same Cloudflare Access policy as HQ.
- Added Worker route aliases so existing admin handlers continue to work without duplication.
- Replaced the permanent public-access warning with a live warning that disappears only after the protected bootstrap verifies the signed-in Access identity.
- Updated the menu status to show **Protected by Cloudflare Access** after verification.
- Cleared the cached HQ bootstrap state when logging out.

# Changelog

## [V92.4.4 MENU & CLEANUP REPAIR] — 2026-08-04

### Fixed
- Inserted the standalone menu function that V92.4.3 referenced but did not contain.
- Added an iOS touch fallback to the Menu button.
- Prevented the Menu icon and label from intercepting taps.
- Fixed the test-cleanup foreign-key error.
- Test bookings are now deleted before their referenced booking holds.
- Cleanup database errors now return readable details instead of a generic Worker exception.
- Retains booking-derived availability, including 47 spaces while the three tests remain.


## [V92.4.3 MENU, CAPACITY & TEST CLEANUP] — 2026-08-04

### Fixed
- Added an independent iPhone-safe Ranch menu controller.
- The menu button now opens the drawer without depending on the main Ranch script.
- Added stronger touch and pointer handling for the menu.
- Class availability now derives from actual `PENDING` and `PAID` booking quantities.
- The three pending bookings for 26 August now reduce availability from 50 to 47.
- Public class listings and HQ use the same booking-based capacity calculation.

### Test cleanup
- Added a temporary one-purpose cleanup control.
- It targets only exactly three unpaid manual bookings:
  - class `low-2026-08-26`
  - created on 3 August 2026
  - status `PENDING`
- Cleanup refuses to run unless exactly three matching records are found.
- Deletion restores dashboard totals and class capacity.
- No other bookings can be deleted through this temporary endpoint.


## [V92.4.2 HTML REPAIR] — 2026-08-04

### Root-cause fix
- Repaired the malformed Ranch stylesheet and body line.
- Restored valid closing `head` and opening `body` elements.
- Repaired the malformed `ranch.js` script tag.
- Ranch JavaScript now loads normally.
- Restores the menu, backend rendering, diagnostics and dashboard figures.
- Updated the Ranch asset cache version to V92.4.2.


## [V92.4.1 RECOVERY] — 2026-08-04

### Critical fix
- Initialised the diagnostic state fields that were missing from V92.4.
- Prevented diagnostics from ever stopping the main HQ script.
- Fixed request ID generation.
- Added null-safe menu controls.
- Added an independent emergency menu fallback.
- Preserved the V92.4 request monitor after correcting the startup failure.


## [V92.4 DIAGNOSTIC] — 2026-08-04

### Added
- Dedicated Diagnostics section.
- Request IDs, endpoint names, HTTP status codes and response times.
- JavaScript error and unhandled-promise logging.
- Online/offline event logging.
- Run tests, Copy report and Clear controls.
- Live Connected, Saved data or Unavailable indicator.
- Session-persistent diagnostic history.

### Stability
- Existing dashboard data remains visible during refreshes.
- Loading banners appear only when no saved data exists.
- Overlapping bootstrap calls reuse the active request.


## [V92.3 VERIFIED FROM V92.2] — 2026-08-04

### Added
- Detailed protected booking cards.
- Automatic test-booking candidate detection.
- Individual Delete test booking control.
- Bulk Delete all test bookings control with typed confirmation.
- Class-capacity restoration after deletion.
- TEST_BOOKING_DELETED audit records.
- Booking list preservation during slow refreshes.
- Health-result preservation during refreshes.

### Safety
- Only unpaid manual PENDING bookings with no provider transaction, payment or refund status are eligible.
- Paid, refunded, cancelled or provider-backed bookings are not eligible.
- Cleanup controls remain unavailable until Cloudflare Access protects HQ.


## [V92.2 BACKEND PERFORMANCE] — 2026-08-03

### Fixed
- Prevented repeated backend configuration requests when switching HQ sections.
- Added one shared in-flight bootstrap request so duplicate requests are merged.
- Added a 30-second in-memory freshness window.
- Added local browser caching of the last successful backend result.
- Cached data appears immediately while a quiet live refresh runs in the background.
- Slow refreshes no longer erase working class, booking or connection information.
- Reduced the backend timeout to six seconds.
- Added a final seven-second safeguard for any remaining loading placeholder.
- Added a visible last-updated time.
- Refresh buttons now force a new check without resetting the interface first.
- Operations navigation now uses already-loaded data instead of starting another request.


## [V92 BACKEND INTEGRATION] — 2026-08-03

### Added
- Added `/api/admin/bootstrap`, a safe configuration-aware backend endpoint.
- Connected HQ summary cards to D1 and R2 when bindings are available.
- Added backend connection status for Access, ADMIN_EMAIL, D1, R2 and SumUp.
- Added exact setup steps inside HQ Settings.
- Added safe non-sensitive class, activity and operations summaries in public pilot mode.
- Added protected-state screens for bookings, customers, private events and media.
- Added final success, empty, setup or locked states to every HQ section.
- Removed indefinite “Loading…” states.
- Added ten-second request timeouts throughout Ranch.
- Added V92 cache busting.

### Privacy
- Customer names, emails, event addresses, booking records and media management remain locked until Cloudflare Access is enabled.
- Public pilot mode only exposes non-sensitive aggregate and class information.


## [V91 RANCH REBUILD] — 2026-08-03

### Rebuilt
- Replaced the previous Ranch shell with a clean HQ application layout.
- Replaced the old mobile sidebar with one independently scrollable drawer.
- Added reliable open, close, backdrop, Escape-key and Safari pageshow handling.
- Replaced competing health scripts with one controller and one endpoint.
- Added a ten-second timeout and guaranteed final health rendering.
- Added a simplified overview, command centre, live health summary and recent activity.
- Preserved the existing Classes, Bookings, Customers, Operations, Private Events, Media, Health and Settings panels.
- Added a visible public-access warning until Cloudflare Access is configured.
- Added V91 cache busting.


## [V90.2.1 RANCH HOTFIX] — 2026-08-03

### Fixed
- Replaced the obsolete `/api/admin/health?version=73` request with `/api/admin/system-health`.
- Added a ten-second timeout and guaranteed final status rendering.
- Added a mobile menu close button.
- Added an outside-click backdrop.
- Added Escape-key support.
- Added body-scroll locking while the menu is open.
- Made the sidebar independently scrollable on mobile.
- Menu closes after selecting an HQ section and after Safari back/forward navigation.
- Added an explicit warning that Ranch is publicly accessible until Cloudflare Access is configured.


All notable changes to Boot Scootin’ Platform are recorded here.

## [V90.2 VERIFIED] — 2026-08-03

### Changed
- Built directly from the clean V90.1 HQ Stability archive.
- Added a visible `V90.2 VERIFIED` badge to Boot Scootin’ HQ.
- Added **Customers** to the HQ sidebar.
- Added **Operations** to the HQ sidebar.
- Added stable IDs to the overview counters.
- Added a dedicated Daily Operations Centre.
- Added a customer register with search and CSV export.
- Added an admin operations API endpoint.
- Added daily summary cards for classes, guests, paid revenue, pending payments, waiting-list guests and refund/credit review.
- Added an operational action queue.
- Added recent audit activity.
- Added a printable class register.
- Added a Ranch toast notification container.
- Added cache-busting for V90.2 verified assets.

### Verification
- `ranch.html` contains Customers and Operations navigation.
- `ranch.html` contains the Daily Operations Centre.
- `ranch.js` contains `loadOperations()` and `loadCustomers()`.
- `_worker.js` contains `/api/admin/operations`.
- `styles.css` contains the V90.2 verified operations styling.
- The release archive opens successfully and includes this changelog and verification manifest.

## [V90.1]
- Previous HQ stability release used as the clean master for this build.


## V92.1 Stability
- Improved health check states.
- Added console diagnostics.
- Reduced indefinite loading placeholders.


## V92.6.6 — Remaining places, cancellation and live SumUp refunds

- Replaced booked/capacity wording on HQ class cards with a remaining-place countdown.
- Full classes now display `FULL` and `Waiting list open`.
- Added protected HQ `Cancel booking` actions that release the place and retain the booking audit record.
- Added protected HQ full-refund actions for SumUp payments.
- SumUp refunds use the stored provider transaction ID and only update D1 after SumUp accepts the refund.
- Refunded bookings no longer count towards class occupancy or paid revenue.
- Added cancellation and refund email/SMS notification triggers, using the existing communications provider setup.
- Added typed confirmation before irreversible refunds.

## V92.6.4 — Booking statistics, occupancy and customer communications
- Class cards now calculate booked places directly from active D1 booking records, removing stale `classes.sold` display discrepancies.
- Bookings HQ statistics now populate active guests, paid revenue, refund/credit reviews and waiting-list guests.
- Added a durable notification log with duplicate-send protection.
- Added automatic paid-booking confirmation email and optional SMS.
- Added automatic class-cancellation email and optional SMS to every affected active booking.
- Added automatic refund-confirmation email and optional SMS after a refund is recorded.
- Added Resend-compatible transactional email delivery using `RESEND_API_KEY` (or legacy `EMAIL_API_KEY`) and `EMAIL_FROM`.
- Added Twilio SMS delivery using `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and either `TWILIO_FROM_NUMBER` or `TWILIO_MESSAGING_SERVICE_SID`.
- Notification delivery failures are logged and never block payment reconciliation, class management or booking updates.

## v96.1.0 – Authentic Honky Tonk Homepage Rebuild

- Rebuilt the homepage composition rather than applying another colour overlay.
- Introduced a true split hero layout inspired by the supplied reference: bold vintage type, real dance-floor photography and a Birmingham country-night neon sign.
- Removed the opening poster splash so visitors arrive directly on the website.
- Replaced homepage emoji tiles with a purpose-built Western line-icon set.
- Added a four-column Classes, Events, Country Life and Community feature strip.
- Added a cinematic real-photo welcome section and real community photo gallery.
- Added a neon closing statement and simplified footer.
- Rebuilt mobile navigation as contained drill-down sections: only the selected section remains visible until the user goes back.
- Preserved the original Boot Scootin’ silhouette logo throughout.
