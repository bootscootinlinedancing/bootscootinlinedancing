# Version 71 — R2 Media Pilot

This release connects the HQ Media Manager directly to the Cloudflare R2 binding named `MEDIA_BUCKET`.

## Important security requirement
Uploads remain disabled unless Cloudflare Access supplies an authenticated email header. Protect these paths before testing:

- `/ranch*`
- `/api/admin/*`

The media pilot no longer requires D1. Media metadata is stored in a private JSON index inside the R2 bucket. D1 will still be used later for classes, bookings and members.

## After deployment
1. Redeploy after the R2 binding is saved.
2. Configure Cloudflare Access for the HQ and admin API paths.
3. Open HQ → Media Manager → Check connection.
4. When Access and R2 both show connected, upload the Summer Stomp video.
