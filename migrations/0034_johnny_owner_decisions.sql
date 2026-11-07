-- Owner decisions confirmed on 6 November 2026.
-- Johnny remains Draft. Publication and checkout remain disabled.
UPDATE special_events
SET saturday_evening_capacity=75,
    saturday_evening_capacity_confirmed=1,
    age_terms='Under-18 attendees must leave the venue by 8:30 pm on Saturday and may not attend the late-night social. A responsible adult must remain contactable. The owner has confirmed this arrangement with the venue.',
    age_terms_confirmed=1,
    refund_policy='Tickets are generally non-refundable. However, we understand that unexpected circumstances can arise. Refund requests will be considered individually and may require appropriate supporting evidence, such as medical documentation where relevant. Providing evidence does not automatically guarantee a refund. Requests without sufficient supporting information may be declined, except where a refund is required by law. Ticket transfers may be considered at the organiser''s discretion and must be approved in advance. If Boot Scootin'' cancels, reschedules or materially changes the event, customers will be offered the legally appropriate remedy, including a full refund of the ticket price and any mandatory booking fee where required. Nothing in this policy limits statutory rights.',
    refund_policy_confirmed=0,
    updated_at=CURRENT_TIMESTAMP,
    version=version+1
WHERE id='special-event-johnny-rossato-2027';

UPDATE special_event_programme_items
SET title='Under-18 departure — 8:30 pm',
    description='Owner-confirmed departure time, confirmed with the venue.',
    starts_at='2027-02-20T20:30:00',
    ends_at=NULL,
    timing_confirmed=1,
    programme_status='CONFIRMED'
WHERE id='johnny-sat-under18'
  AND event_id='special-event-johnny-rossato-2027';

UPDATE special_event_ticket_products
SET description=CASE code
  WHEN 'JUNIOR_WEEKEND' THEN 'Under 18 · Saturday and Sunday workshops and free dancing · Responsible adult details required · Saturday departure by 8:30 pm · Late-night social not included.'
  WHEN 'JUNIOR_SATURDAY' THEN 'Under 18 · Saturday workshops and free dancing · Responsible adult details required · Departure by 8:30 pm · Late-night social not included.'
  ELSE description
END,
updated_at=CURRENT_TIMESTAMP
WHERE event_id='special-event-johnny-rossato-2027'
  AND code IN ('JUNIOR_WEEKEND','JUNIOR_SATURDAY');

INSERT OR IGNORE INTO special_event_activity(
  id,event_id,action,target_type,target_id,actor,reason,metadata_json,idempotency_key
) VALUES(
  'johnny-owner-decisions-2026-11-06',
  'special-event-johnny-rossato-2027',
  'OWNER_DECISIONS_RECORDED',
  'SPECIAL_EVENT',
  'special-event-johnny-rossato-2027',
  'MIGRATION',
  'Recorded owner-confirmed evening capacity, venue-confirmed under-18 departure and revised draft refund/transfer wording. Legal review gate remains closed.',
  '{"saturday_evening_capacity":75,"under_18_departure":"20:30","venue_confirmation_outstanding":false,"legal_review_outstanding":true}',
  'johnny-owner-decisions-2026-11-06'
);
