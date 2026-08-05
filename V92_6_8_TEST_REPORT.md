# V92.6.8 Test Report

- Worker JavaScript syntax checked with Node.
- SumUp requests now have a 10-second AbortController timeout.
- Refund failures return structured JSON and leave the booking at REFUND DUE.
- HQ and service-worker cache identifiers are V92.6.8.
- Release ZIP integrity verified.

Live SumUp refund acceptance must be verified after deployment because credentials and sandbox transactions exist only in Cloudflare/SumUp.
