# Version 72 — R2 Diagnostics Fix

This release fixes the HQ System Health screen remaining on UNKNOWN after the R2 bucket was correctly bound.

Changes:
- health checks no longer fail behind a single administrator-authorisation response
- R2 binding and read access are tested independently
- Media Manager now reports “R2 connected; Cloudflare Access still required” when appropriate
- upload remains securely locked until Cloudflare Access protects HQ
- Ranch JavaScript cache-busted to version 72
- service-worker cache version refreshed
- no-cache headers added for HQ and API diagnostics

Expected result after deployment:
- Website: ONLINE
- Media storage: READY when MEDIA_BUCKET is bound
- Admin protection: SETUP until Cloudflare Access is configured
- Database, Payments and Email: SETUP until connected later
