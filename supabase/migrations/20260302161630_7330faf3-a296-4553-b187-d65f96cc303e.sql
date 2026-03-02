-- Clear foreign key references in loads
UPDATE loads SET booked_lead_id = NULL WHERE booked_lead_id IS NOT NULL;

-- Clear foreign key references in keyword_match_events  
DELETE FROM keyword_match_events WHERE lead_id IS NOT NULL;

-- Delete lead events
DELETE FROM lead_events;

-- Delete all leads
DELETE FROM leads;