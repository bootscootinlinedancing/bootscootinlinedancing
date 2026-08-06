# SumUp automatic refunds — V92.7.1

## Why the HQ refund button is disabled

Taking Hosted Checkout payments and refunding transactions use different authorisation. The existing `SUMUP_API_KEY` can create and inspect checkouts, but HQ will not attempt to move refund money until a user-authorised OAuth access token is available.

## Required Cloudflare secret

Save the user-authorised OAuth access token as:

```
SUMUP_REFUND_ACCESS_TOKEN
```

The token must belong to the same SumUp merchant account as `SUMUP_MERCHANT_CODE` and must have the permissions required by SumUp for transaction refunds. Access tokens expire, so a production connection should use the OAuth authorization-code flow and securely refresh tokens.

## Current safe fallback

1. Open the exact booking in HQ and expand **View payment details**.
2. Use the stored transaction code/UUID to identify the transaction in SumUp.
3. Refund the money in SumUp.
4. Only after SumUp confirms it, press **Record refund already completed in SumUp**.

That record button does not move money.
