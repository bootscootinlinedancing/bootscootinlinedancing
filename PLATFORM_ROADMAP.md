# Platform roadmap

## Current foundation

- Static public website preserved
- Reusable global styling and navigation scripts
- Cloudflare Pages Functions for booking APIs
- D1 schema for classes, seat holds and bookings
- Protected admin register endpoint scaffold
- GitHub validation on every update

## Next build order

1. Configure Cloudflare D1 and load test classes.
2. Connect SumUp hosted checkout in sandbox/test mode.
3. Add verified payment callback handling.
4. Add transactional booking-confirmation email.
5. Protect the admin area with Cloudflare Access and MFA.
6. Run security, capacity and refund tests.
7. Enable live payments only after all tests pass.
8. Add member accounts after the booking engine is stable.
