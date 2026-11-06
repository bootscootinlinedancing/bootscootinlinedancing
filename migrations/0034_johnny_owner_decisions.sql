-- Owner decisions confirmed on 6 November 2026.
-- Johnny remains Draft. Publication and checkout remain disabled.
UPDATE special_events
SET saturday_evening_capacity=75,
    saturday_evening_capacity_confirmed=1,
    age_terms='Under-18 attendees must leave the venue by 8:30 pm on Saturday and may not attend the late-night social. A responsible adult must remain contactable. Final operational confirmation with the venue remains outstanding.',
    age_terms_confirmed=0,
    refund_policy='Tickets are non-refundable except where a refund is required by law. Requests to transfer a ticket to another person may be considered at the organiser''s discretion and must be approved in advance. Tickets must not be resold or transferred without approval. If the event is cancelled or materially changed, any applicable refund rights will be honoured.',
    refund_policy_confirmed=0,
    updated_at=CURRENT_TIMESTAMP,
    version=version+1
WHERE id='special-event-johnny-rossato-2027';

UPDATE special_event_programme_items
SET title='Under-18 departure — 8:30 pm',
    description='Owner-confirmed departure time. Final operational confirmation with the venue remains outstanding.',
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
  'Recorded owner-confirmed evening capacity, under-18 departure and draft refund/transfer wording. Venue and legal review gates remain closed.',
  '{"saturday_evening_capacity":75,"under_18_departure":"20:30","venue_confirmation_outstanding":true,"legal_review_outstanding":true}',
  'johnny-owner-decisions-2026-11-06'
);
