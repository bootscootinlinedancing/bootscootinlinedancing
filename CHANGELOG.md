# Changelog

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
