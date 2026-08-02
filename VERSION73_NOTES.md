# Version 73 — Pages Worker diagnostics fix

- Adds a root `_worker.js` so Cloudflare Pages runs the HQ diagnostics and R2 media routes reliably.
- Keeps all normal website files served through `env.ASSETS`.
- `/api/admin/health` now returns JSON instead of falling back to the homepage.
- `/api/admin/media-status` detects `MEDIA_BUCKET`.
- Uploads remain locked until Cloudflare Access supplies an authenticated email.
- The screenshot of an unstyled homepage at `/api/health` was caused by that non-existent test URL falling back to `index.html`; the public homepage itself was not broken.
