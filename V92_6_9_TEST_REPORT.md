# V92.6.9 Test Report

## Static checks passed

- `_worker.js` JavaScript syntax check.
- `ranch.js` JavaScript syntax check.
- Release manifest JSON validation.
- HQ release and script cache version updated to V92.6.9.
- Service-worker cache identity updated to V92.6.9.
- Automatic refund path refuses to call SumUp without a dedicated OAuth refund token.
- Manual refund action is rendered only for cancelled SumUp bookings marked `REFUND_DUE`.
- Manual refund action maps to the existing protected `MARK_REFUNDED` Worker action.
- ZIP integrity test.

## Deployment checks required

- Without `SUMUP_REFUND_ACCESS_TOKEN`, press Refund and confirm HQ displays the setup message without a Cloudflare error page.
- Complete the £1 refund in SumUp, then use **Record manual refund** and confirm the booking becomes `REFUNDED` and revenue falls by £1.
- When an authorised OAuth token is available, test automatic refund in SumUp sandbox.
