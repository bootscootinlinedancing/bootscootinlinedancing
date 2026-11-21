# Christmas Hoedown controlled release checklist

Prepared 21 November 2026. This file is preparation, not production approval.

## Verified configuration

Friday18December2026, Low Places Bar, Digbeth, Birmingham. £8 admission,50 shared places. Arrivals19:15; tuition19:30–20:30 with Christmas song swaps; Santa’s Naughty List20:30; social/requests20:50; Bradley Rivers21:00; finish01:00 Saturday19December. Calendar date remains Friday. Only Christmas Hoedown admission; no £6/£4, promo or class-pass option. Original supplied flyer SHA256 d52ed7b5732f228fef367007e9486f6379ed58dce3937b6ef9a83c1e59581056, unchanged.

Existing evidence covers calendar, full programme/flyer, synthetic two-person £16 checkout, verified mock payment, two attendees, one confirmation job, standard confirmation and next-day Google/ICS finish. Actual HQ frontend/backend tests at1440px and390px cover the class list, one booking/two sold/48remaining, named register, admission label and editor start/end/price/capacity/programme/flyer. All data synthetic, provider requests mocked. Christmas is managed through Classes, not the separate Johnny Special Events screen.

Compatibility rehearsal uses current PR80 1d97ee70572318de3bea1b6152195259eba8d65e and corrected PR81. The combined19-suite regression passes, including full Johnny loader, regular and special-event payment/check-in tests, scheduler and Christmas flow. PR81 now explicitly passes the Johnny data snapshot into form wiring, rejects failed individual results, retains response-time scroll and refreshes filters; its physical Safari retest remains a separate device gate. Do not publish an old complete Worker that removes PR80/81 changes.

## Before any future authorised production release

1. Obtain explicit approval for merge, production deployment, migration0042 and eventual event publication. Approval to prepare/test is insufficient.
2. Re-read actual production main/deployment SHA and migration ledger. Save the preceding deployment/configuration. Preserve PR80 if already landed; integrate PR81 only after its release gates pass. No unrelated draft PR is included.
3. **Immediately before applying0042**, execute this read-only duplicate check across every status, and manually inspect any result. Do not auto-delete or overwrite a match:

```sql
SELECT id,title,venue,starts_at,ends_at,status,price_pence,capacity
FROM classes
WHERE substr(starts_at,1,10)='2026-12-18'
   OR lower(title) LIKE '%christmas%'
   OR lower(public_notes) LIKE '%bradley rivers%';
```

4. Review missing migrations explicitly. Production's21November read-only ledger ends0035. PR80 owns0038/0039; pending event management owns0040/0041;0042 depends only on existing classes and class_pass_class_eligibility tables. Current production table DDL matched the schema-only rehearsal. Both0038→0039→0040→0041→0042 and0042-first replay passed FK/integrity checks. These facts do not authorise applying unapproved files. Never run blanket migration apply from a checkout containing unrelated pending migrations, or replay policy seeds. Apply each approved file exactly once with migration-ledger evidence; do not double-apply overlapping PR77/80 migration0038.
5. Apply only the authorised missing0042 to create a **draft** entry. Its duplicate/configuration guards must abort for manual review on a conflict. Check50capacity,800pence,19:15Friday/01:00Saturday and original poster. Matching reruns do not reopen or overwrite the event.
6. Deploy compatible Worker, booking/confirmation JS, HTML, scoped CSS and original flyer together. Verify assets/version references and inspect the draft in HQ: price/capacity/times/full notes, counts/register and one admission product. No production test booking/payment/email is implied.
7. Open/publish this one draft only when separately explicitly authorised. Re-read the row and duplicate query immediately before publication if time has elapsed. Verify the public calendar, single£8 option, one-hour tuition wording, flyer and next-day finish using reads. Do not change other events or allocations.

## Rollback

- PR81 alone: restore the immediately preceding compatible Pages artifact that retains any deployed PR80 payment/email changes. No DB migration or cron change belongs to PR81. Keep attendance, loyalty and immutable audit history; never replay check-ins.
- Christmas before bookings: leave the new class draft and restore the prior compatible code/assets after approval. Keep the additive migration and ledger; no destructive down migration.
- Christmas once holds/bookings/payments exist: obtain approval to close this event to new sales; keep compatible handling for outstanding payments/confirmations and existing snapshots. Restore only a reviewed compatible artifact. Preserve class, customers, attendees, payments and outbox history. No row deletion, broad restore, refund, cancellation or customer email is implied.

Recommended order when all releases are separately approved: PR80 staged payment rollout; corrected PR81 after its device gate; PR85 migration/draft/code verification; explicit Christmas publication last. PR85 can release independently if PR81's gate is outstanding, without deploying the blocked/unapproved check-in build.
