-- Delete all related data for the three agencies first, then delete the agencies

-- Agency IDs to delete
-- BMC: 2718c26f-c1ee-4e95-952e-0dbeab324826
-- Seeksy Trucking: e15abb7c-e759-40ae-ac86-4a38fd0e6567
-- Demo Agency: 2c32c7bb-7bf8-4375-a56d-f05cb65b56d1

-- Delete AI call summaries
DELETE FROM ai_call_summaries WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete elevenlabs post calls
DELETE FROM elevenlabs_post_calls WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete leads
DELETE FROM leads WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete loads
DELETE FROM loads WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete demo loads
DELETE FROM demo_loads WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete high intent keywords
DELETE FROM high_intent_keywords WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete keyword match events
DELETE FROM keyword_match_events WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete keyword suggestions
DELETE FROM keyword_suggestions WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete carrier intelligence
DELETE FROM carrier_intelligence WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete accounts
DELETE FROM accounts WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete chat channels and related
DELETE FROM chat_channel_members WHERE channel_id IN (
  SELECT id FROM chat_channels WHERE agency_id IN (
    '2718c26f-c1ee-4e95-952e-0dbeab324826',
    'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
    '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
  )
);

DELETE FROM chat_messages WHERE channel_id IN (
  SELECT id FROM chat_channels WHERE agency_id IN (
    '2718c26f-c1ee-4e95-952e-0dbeab324826',
    'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
    '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
  )
);

DELETE FROM chat_reads WHERE channel_id IN (
  SELECT id FROM chat_channels WHERE agency_id IN (
    '2718c26f-c1ee-4e95-952e-0dbeab324826',
    'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
    '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
  )
);

DELETE FROM chat_channels WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete agent daily state
DELETE FROM agent_daily_state WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete agent daily stats
DELETE FROM agent_daily_stats WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete agent invites
DELETE FROM agent_invites WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete agency phone numbers
DELETE FROM agency_phone_numbers WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete load import runs
DELETE FROM load_import_runs WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete email import logs
DELETE FROM email_import_logs WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Delete agency members
DELETE FROM agency_members WHERE agency_id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);

-- Finally delete the agencies
DELETE FROM agencies WHERE id IN (
  '2718c26f-c1ee-4e95-952e-0dbeab324826',
  'e15abb7c-e759-40ae-ac86-4a38fd0e6567',
  '2c32c7bb-7bf8-4375-a56d-f05cb65b56d1'
);