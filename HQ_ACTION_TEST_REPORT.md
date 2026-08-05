# V92.6.0 HQ Action Test Report

## Automated checks passed

- `ranch.js` JavaScript syntax validation passed with Node.
- `_worker.js` Worker syntax validation passed with Node.
- `RELEASE_MANIFEST.json` validation passed.
- Every visible HQ button or form action in `ranch.html` has a matching front-end handler.
- Every front-end HQ API path used by the repaired actions has a matching Worker route.
- Class create/edit uses the existing protected `/ranch/api/admin/classes` POST/PATCH route.
- Class duplicate/status/delete use the existing protected class route and D1 safeguards.
- Bookings and customers CSV exports generate local UTF-8 CSV downloads without exposing payment-card data.
- Media status and upload use the existing protected R2 routes.
- Mobile class editor and action controls have responsive CSS rules.

## Deployment-connected checks

Cloudflare Access identity, production D1 data, R2 writes and SumUp Sandbox credentials remain deployment-side. This release does not change their binding names or secrets. After deployment, use HQ System Health and the repaired action buttons for the final live connected smoke test.
