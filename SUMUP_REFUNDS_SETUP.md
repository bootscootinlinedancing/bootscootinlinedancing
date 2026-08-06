# SumUp Refund Setup — V92.6.9

## Why a separate refund token is required

Creating and retrieving hosted checkouts can use the existing `SUMUP_API_KEY`. SumUp transaction refunds act on a merchant user account and require a user-authorised OAuth access token obtained through the authorisation-code flow. A client-credentials token or ordinary checkout API key must not be used for this action.

## Automatic refund option

Add the following encrypted Cloudflare Worker secret:

- `SUMUP_REFUND_ACCESS_TOKEN`

The Worker also accepts `SUMUP_OAUTH_ACCESS_TOKEN` as an alternate name.

The token must be issued by SumUp through the authorisation-code OAuth flow and include the transaction permissions required by SumUp. Do not place the token in website JavaScript, HTML or the ZIP.

After adding the secret, redeploy the Worker and use **Refund £x.xx** in HQ.

## Safe manual option

Until OAuth refund access is configured:

1. Refund the payment in the SumUp dashboard or SumUp app.
2. Return to the cancelled booking in Boot Scootin HQ.
3. Press **Record manual refund**.
4. Type `REFUNDED` exactly.

HQ will then mark the booking refunded, remove it from paid revenue, retain the audit trail and trigger the configured refund email/SMS notification.

Never press **Record manual refund** before the refund has actually been completed in SumUp.
