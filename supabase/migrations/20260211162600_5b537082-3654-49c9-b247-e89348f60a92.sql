
-- Restore accidentally closed booked load back to booked status
UPDATE loads
SET status = 'booked', closed_at = NULL, close_reason = NULL
WHERE id = '869e2630-10d9-4213-af17-928c8785458a';

-- The second lead (1e39cd82) was incorrectly attached to this load - detach it
UPDATE leads
SET load_id = NULL, status = 'pending', booked_at = NULL, booked_by = NULL
WHERE id = '1e39cd82-43b0-4562-bd98-1e6ff08ba5b2'
  AND load_id = '869e2630-10d9-4213-af17-928c8785458a';
