# V92.6.7 Test Report

Static checks completed on 6 August 2026.

- `_worker.js` passes `node --check`.
- `ranch.js` passes `node --check`.
- `RELEASE_MANIFEST.json` is valid JSON.
- Refund action uses a 30-second HQ request timeout.
- Full refund request uses the official SumUp refund endpoint with an empty request body.
- Refund submission requires a UUID-format SumUp transaction ID.
- Transaction lookup, provider request, D1 update and notification stages each have controlled error handling.
- Successful refund returns immediately and cannot fall through to the generic booking audit action.
- HQ and service-worker cache identifiers are V92.6.7.
- ZIP integrity verified after packaging.

Live SumUp sandbox confirmation must be completed after Cloudflare deployment.
