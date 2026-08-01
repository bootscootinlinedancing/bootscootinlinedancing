BOOT SCOOTIN' WEBSITE — VERSION 10 STABLE

THIS IS THE SAFE RESTORE VERSION

- Restores the approved realistic landing page exactly as one clean image.
- Removes the broken walking animation completely.
- Removes all fragments, black blocks and duplicated elements.
- Keeps the ENTER THE DANCE FLOOR button clickable.
- Pressing the button makes the whole scene lift and stomp, with dust and vibration.
- The website opens only after the stomp finishes.

UPLOAD
1. Download and unzip.
2. Upload every file to the same GitHub repository.
3. Replace existing files.
4. Commit directly to main.
5. Wait for Cloudflare Pages to redeploy.
6. Test in a Private Safari tab.

This version is deliberately stable. We can rebuild the walking animation later from a proper transparent boot asset without risking the live page again.


VERSION 11 UPDATE
- Replaced nora.webp with the newly cropped portrait supplied by Nora.
- The filename stayed the same, so no HTML or CSS changes were needed.
- Uploading this version will automatically replace the old portrait on the About section.


VERSION 12 UPDATE
- Added a separate About page: about.html.
- The About menu link now opens that page instead of jumping within the homepage.
- Kept the homepage Nora section short.
- Added Nora's full story and information about Boot Scootin' on the About page.
- Fixed Low Places and Edgbaston booking links so they open Eventbrite instead of Linktree.
- General booking buttons now open the Eventbrite organiser page.


VERSION 13 FIX
- Fixed the blank About page.
- The shared JavaScript was trying to control the homepage intro on about.html, where that intro does not exist.
- Added safe checks so the homepage intro code only runs on the homepage.
- About-page content and reveal animations now load normally.
