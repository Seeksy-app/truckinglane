-- Insert test pending leads from AI calls
INSERT INTO leads (agency_id, caller_phone, caller_name, status, notes, created_at)
VALUES 
  ('e15abb7c-e759-40ae-ac86-4a38fd0e6567', '+12157014060', 'Transfer to Dispatch', 'pending', 'AI Call - Transfer to Dispatch requested', now()),
  ('e15abb7c-e759-40ae-ac86-4a38fd0e6567', '+12249551180', 'Load transfer to dispatch', 'pending', 'AI Call - Load transfer to dispatch', now()),
  ('e15abb7c-e759-40ae-ac86-4a38fd0e6567', '+16514618991', 'Load lookup and callback', 'pending', 'AI Call - Load lookup and callback requested', now()),
  ('e15abb7c-e759-40ae-ac86-4a38fd0e6567', '+12245322493', 'Load Inquiry & Callback', 'pending', 'AI Call - Load Inquiry & Callback', now()),
  ('e15abb7c-e759-40ae-ac86-4a38fd0e6567', '+13464970370', 'Load lookup: Arizona', 'pending', 'AI Call - Load lookup Arizona to...', now()),
  ('e15abb7c-e759-40ae-ac86-4a38fd0e6567', '+18323010569', 'Booking Arizona Load', 'pending', 'AI Call - Booking Arizona Load', now()),
  ('e15abb7c-e759-40ae-ac86-4a38fd0e6567', '+12546245558', 'Load lookup and callback', 'pending', 'AI Call - Load lookup and callback', now()),
  ('e15abb7c-e759-40ae-ac86-4a38fd0e6567', '+17143604254', 'Load lookup and clarification', 'pending', 'AI Call - Load lookup and clarification', now()),
  ('e15abb7c-e759-40ae-ac86-4a38fd0e6567', '+13059060305', 'Transfer to dispatch', 'pending', 'AI Call - Transfer to dispatch requested', now()),
  ('e15abb7c-e759-40ae-ac86-4a38fd0e6567', '+18007856400', 'Load Booking Request', 'pending', 'AI Call - Load Booking Request Callback', now())
ON CONFLICT DO NOTHING;