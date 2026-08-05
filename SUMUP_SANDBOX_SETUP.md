# SumUp Sandbox setup — V92.5.0

This release contains the SumUp Hosted Checkout integration. No API key is stored in this ZIP or in GitHub.

In Cloudflare Pages, open **Settings → Variables and secrets → Add** for the **Production** environment.

Add:

1. **Secret** `SUMUP_API_KEY`
   - Paste the secret API key created while the **Boot Scootin' HQ Sandbox** account is selected.
   - Never put this value into GitHub or browser code.

2. **Text variable** `SUMUP_MERCHANT_CODE`
   - Value: `MD2DCQYX`
   - This is the eight-character code shown beneath the sandbox account name.

Save both values and trigger a new deployment. Then sign in to HQ and run **System Health → Run checks**. Payments should show **READY** only after the server successfully verifies the API key with SumUp.

The integration uses SumUp Hosted Checkout. Card details remain on SumUp's payment page and are never collected by this website.
