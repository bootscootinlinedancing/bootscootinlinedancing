# V92.6.3 HQ Stability Test Report

## Fault addressed

The Classes route called SumUp reconciliation before reading D1. Any provider/network exception escaped the route and produced a Cloudflare Worker unhandled-exception page. The bootstrap endpoint also grouped all D1 reads into one Promise.all block, so one failed query left every summary value at its default.

## Repairs

- Wrapped pending-payment reconciliation independently from class retrieval.
- Added a protected D1 class-list read with structured JSON failure output.
- Split bootstrap class, booking totals, waiting list, private events and activity queries into independent guarded operations.
- Preserved successfully loaded totals even if another optional HQ panel fails.
- Added warnings to the bootstrap payload for diagnostics without breaking the dashboard.

## Static checks

- `_worker.js`: Node syntax check passed.
- `ranch.js`: Node syntax check passed.
- `booking-confirmation.js`: Node syntax check passed.
- `service-worker.js`: Node syntax check passed.
- Release/cache references updated to V92.6.3.
- ZIP integrity checked after packaging.

## Deployment verification

After deployment, refresh HQ and confirm Classes loads and the paid £1 test booking appears in revenue. Live D1, Access and SumUp behaviour can only be confirmed in the deployed Cloudflare environment.
