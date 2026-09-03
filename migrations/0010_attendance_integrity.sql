-- Attendance integrity preflight.
-- Run this query first. If it returns any rows, stop and reconcile them before
-- applying the unique index. This migration never deletes attendance records.
SELECT booking_id, COUNT(*) AS attendance_rows,
       MIN(checked_in_at) AS first_checked_in_at,
       MAX(checked_in_at) AS last_checked_in_at
FROM attendance
GROUP BY booking_id
HAVING COUNT(*) > 1;

-- One booking can have only one attendance/check-in record. If duplicate rows
-- exist, D1 will reject this statement without silently removing any history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_booking_unique
ON attendance(booking_id);
