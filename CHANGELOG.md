# Changelog

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
