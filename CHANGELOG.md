# Changelog

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
