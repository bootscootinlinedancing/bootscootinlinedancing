-- Owner-confirmed Johnny Rossato timetable correction.
-- This changes only programme presentation metadata; event, tickets, capacities,
-- bookings, credentials and publication state are deliberately untouched.
UPDATE special_event_programme_items
SET timing_confirmed=1,
    title=CASE id
      WHEN 'johnny-sat-kingdom-workshop' THEN 'Kingdom of Fear workshop/refresher — format TBC'
      WHEN 'johnny-sat-competition' THEN 'Kingdom of Fear Mini Competition'
      WHEN 'johnny-sat-under18' THEN 'Under-18 departure — venue conditions pending'
      WHEN 'johnny-sat-social' THEN 'Evening social'
      WHEN 'johnny-sun-finish' THEN 'Finish'
      ELSE title
    END,
    description=CASE id
      WHEN 'johnny-sat-comp-registration' THEN 'Confirmed schedule.'
      WHEN 'johnny-sat-competition' THEN 'Confirmed schedule.'
      WHEN 'johnny-sat-social' THEN 'Confirmed schedule.'
      WHEN 'johnny-sun-workshop-1' THEN 'Dance selection remains to be confirmed.'
      WHEN 'johnny-sun-workshop-2' THEN 'Dance selection remains to be confirmed.'
      WHEN 'johnny-sun-workshop-3' THEN 'Dance selection remains to be confirmed.'
      WHEN 'johnny-sun-recap' THEN 'Optional activity.'
      WHEN 'johnny-sun-finish' THEN 'Confirmed schedule.'
      ELSE description
    END
WHERE event_id='special-event-johnny-rossato-2027';

UPDATE special_event_programme_items
SET programme_status='CONFIRMED'
WHERE event_id='special-event-johnny-rossato-2027'
  AND id IN ('johnny-sat-comp-registration','johnny-sat-competition','johnny-sat-social','johnny-sun-finish');
