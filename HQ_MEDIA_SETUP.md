# Boot Scootin' HQ — Media Manager setup

The Media Manager stores photos, videos and PDFs in Cloudflare R2. Files do not go into GitHub.

## 1. Create the R2 bucket

In Cloudflare, open **R2 Object Storage**, create a bucket named `boot-scootin-media`, then open your Pages project and add an R2 binding:

- Variable name: `MEDIA_BUCKET`
- R2 bucket: `boot-scootin-media`

## 2. Apply the database migration

Run `migrations/0003_media_manager.sql` against the same D1 database already bound as `BOOKINGS_DB`.

## 3. Keep HQ private

Cloudflare Access must protect `/ranch`, `/api/admin/*` and `/admin-bookings`. Only Nora's email should be allowed.

## 4. Upload the Summer Stomp video

Open `/ranch`, choose **Media**, select the MP4, name it, and set **Use on the website** to `Summer Stomp story video`. After upload, the video appears and plays directly on Nora's Adventures.

## Limits and security

- Accepted: JPG, PNG, WebP, MP4, WebM and PDF.
- Maximum: 80 MB per file in this first build. Compress larger videos before upload.
- The public media route validates generated storage keys and serves video byte ranges for in-page playback.
- R2 and D1 bindings are server-side; no secret is stored in GitHub or browser JavaScript.
