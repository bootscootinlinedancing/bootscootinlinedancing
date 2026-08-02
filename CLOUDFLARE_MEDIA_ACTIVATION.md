# Activate working HQ media uploads (V70)

The code is complete, but Cloudflare must be connected once before the upload button can store files.

## 1. Create the R2 bucket
Cloudflare dashboard → **R2 Object Storage** → **Create bucket**.

Bucket name suggestion: `boot-scootin-media`

## 2. Add the R2 binding to the Pages project
Cloudflare dashboard → **Workers & Pages** → your Boot Scootin' Pages project → **Settings** → **Bindings** → **Add** → **R2 bucket**.

- Variable name: `MEDIA_BUCKET`
- R2 bucket: `boot-scootin-media`

The variable name must be exactly `MEDIA_BUCKET`.

## 3. Create or select the D1 database
Cloudflare dashboard → **D1 SQL Database** → create/select the Boot Scootin' database.

In the Pages project add a D1 binding:

- Variable name: `BOOKINGS_DB`
- Database: your Boot Scootin' database

## 4. Install the database tables
Open the D1 database console and run these files in order:

1. `migrations/0001_booking_schema.sql`
2. `migrations/0002_ranch_class_management.sql`
3. `migrations/0003_media_manager.sql`

## 5. Add your owner email
Pages project → **Settings** → **Variables and Secrets**.

Add:

- Name: `ADMIN_EMAIL`
- Value: the exact email allowed into HQ

Do not put this in public JavaScript.

## 6. Protect HQ with Cloudflare Access
Create an Access application for:

- `/ranch*`
- `/api/admin/*`

Allow only the same email used for `ADMIN_EMAIL`.

## 7. Redeploy
Trigger a fresh Pages deployment after adding bindings and variables.

Then open `/ranch`, choose **Media**, and press **Check connection**. All four checks must show ✓ before uploading.

## Video note
An iPhone `.mov` file can be stored, but MP4 plays more consistently across Android, Windows and older browsers. Cloudflare Workers do not convert video formats in this free build. Exporting the clip as MP4 before upload is recommended.
