# Protect the Boot Scootin’ Ranch

The Ranch must be protected in Cloudflare Zero Trust before real customer data is used. Do not add a password to HTML or JavaScript.

## Recommended login
Use Cloudflare Access with your own email address and a one-time PIN. This gives a secure login screen before `/ranch` loads.

1. Open Cloudflare Dashboard → Zero Trust.
2. Go to Access → Applications → Add an application → Self-hosted.
3. Name: `Boot Scootin Ranch`.
4. Domain: `bootscootinlinedancing.co.uk`.
5. Path: `/ranch*`.
6. Add an Allow policy containing only Nora’s administrator email address.
7. Choose One-time PIN as the identity provider, or connect Google if preferred.
8. Set a short session duration such as 4–8 hours.
9. Save and test in a private browser window.

Repeat protection for `/admin-bookings*` and `/api/admin/*`.

The public site now includes a subtle `Admin Login` link. When Cloudflare Access is configured, selecting it opens the secure Cloudflare login screen and then the Ranch.

## Video
The Summer Stomp page contains an inline player that appears only when a real file named `summer-stomp.mp4` is uploaded at the project root. The iCloud share page is deliberately not embedded.
