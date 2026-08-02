# Boot Scootin' Platform — V64

This repository is the maintainable source for the Boot Scootin' website and its secure booking foundation.

## Why this version is different

- Old release-note files and redundant assets were removed, leaving fewer than 100 repository files.
- GitHub can upload the complete project in one web upload.
- Shared Cloudflare Pages Functions hold all private booking logic.
- Card details are never collected or stored by the website.
- A validation workflow checks every update before deployment.

## Upload to GitHub from iPhone

1. Unzip this package in the Files app.
2. In the repository, choose **Add file → Upload files**.
3. Select every item inside the unzipped folder, not the outer folder itself.
4. Commit directly to `main`.
5. Confirm the **Actions** tab shows “Validate website” passing.

This package contains fewer than 100 files, so GitHub's mobile web uploader should accept it in one upload.

## Cloudflare Pages

Use the existing GitHub repository as the Pages source.

- Framework preset: **None**
- Build command: leave blank
- Build output directory: `/`

Pages Functions are in `functions/`.

## Booking setup

The booking pages are safe to deploy as a foundation, but live payment remains disabled until the following are configured privately in Cloudflare:

- D1 binding: `BOOKINGS_DB`
- secret: `SUMUP_ACCESS_TOKEN`
- variable/secret: `SUMUP_MERCHANT_CODE`
- variable: `ADMIN_EMAIL`

Run `migrations/0001_booking_schema.sql` against the D1 database before enabling bookings.

Never place SumUp credentials, D1 credentials, customer exports, or `.dev.vars` in GitHub.

See `BOOKING_SYSTEM_SETUP.md` for the detailed launch checklist.

## Version 65 — Boot Scootin' Ranch
Open `ranch.html` after protecting it with Cloudflare Access. The Ranch manages classes, capacities, statuses and paid registers through D1. It remains safe in setup mode until D1 and SumUp Sandbox are connected.


## V66
- Added a subtle Admin Login link throughout the public website.
- Prepared `/ranch` for Cloudflare Access protection.
- Restored the Nora, Troy and Elise photo.
- Added a safe self-hosted Summer Stomp video player that stays hidden until `summer-stomp.mp4` exists.
- See `CLOUDFLARE_ACCESS_SETUP.md`.


## V67 — Boot Scootin' HQ
- Renamed the private dashboard to Boot Scootin' HQ.
- ECC capacity defaults to 20.
- Low Places capacity defaults to 50.
- Added an R2-backed Media Manager for images, videos and PDFs.
- Added dynamic Summer Stomp video placement.
