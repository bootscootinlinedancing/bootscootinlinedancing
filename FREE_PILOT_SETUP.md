# Boot Scootin’ HQ — Free Pilot Setup

This release is designed to stay within free allowances while the idea is tested.

## Pilot scope

Collect only: customer name, email, class, ticket quantity and payment status. Do not collect medical details or sensitive notes. Keep SumUp in sandbox and keep HQ owner-only.

## Required free services

1. Cloudflare Pages for the website and Functions.
2. Cloudflare Access protecting `/ranch*`, `/admin-login*`, `/admin-bookings*` and `/api/admin/*`.
3. Cloudflare D1 bound as `BOOKINGS_DB`.
4. Cloudflare R2 bound as `MEDIA_BUCKET` only when media uploads are needed.
5. Environment variable `ADMIN_EMAIL` set to Nora’s allowed admin email.

## Optional services

- `SUMUP_API_KEY` and `SUMUP_MERCHANT_CODE`: use sandbox credentials only during the pilot.
- `EMAIL_API_KEY` and `EMAIL_FROM`: add only when confirmation email testing begins.
- `BACKUP_LAST_TESTED`: set to a date after a successful export-and-restore test.

## System Health

Open Boot Scootin’ HQ and choose **System Health**. The checks do not reveal secret values. They only show whether each service is configured and responding.

## Launch restriction

Do not enable public member accounts or live payments until access control, database permissions, payment verification, privacy wording, backup restoration and incident procedures have been reviewed.
