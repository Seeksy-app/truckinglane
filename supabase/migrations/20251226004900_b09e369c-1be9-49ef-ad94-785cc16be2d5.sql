-- GO-LIVE RESET: Complete data wipe (preserves schema, users, config)
-- Run date: 2025-12-26

-- Disable triggers temporarily for clean truncation
SET session_replication_role = 'replica';

-- TRUNCATE all data tables (CASCADE handles foreign key relationships)
-- Order matters due to foreign key constraints

-- Clear CRM & Prospecting
TRUNCATE TABLE public.account_events RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.prospecting_queue RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.accounts RESTART IDENTITY CASCADE;

-- Clear Leads & Events
TRUNCATE TABLE public.lead_events RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.leads RESTART IDENTITY CASCADE;

-- Clear Calls & Conversations
TRUNCATE TABLE public.conversations RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.phone_calls RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.ai_call_summaries RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.elevenlabs_post_calls RESTART IDENTITY CASCADE;

-- Clear Loads (soft-delete model, but user wants full wipe)
TRUNCATE TABLE public.loads RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.load_import_runs RESTART IDENTITY CASCADE;

-- Clear Carrier Intelligence
TRUNCATE TABLE public.carrier_intelligence RESTART IDENTITY CASCADE;

-- Clear Analytics & Stats
TRUNCATE TABLE public.agent_daily_stats RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.keyword_match_events RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.keyword_suggestions RESTART IDENTITY CASCADE;

-- Clear Chat (messages only, keep channels/members)
TRUNCATE TABLE public.chat_messages RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.chat_reads RESTART IDENTITY CASCADE;

-- Clear Notifications
TRUNCATE TABLE public.notifications RESTART IDENTITY CASCADE;

-- Clear System Health Logs (keep schema)
TRUNCATE TABLE public.system_health_events RESTART IDENTITY CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Log the reset event
INSERT INTO public.system_health_events (service_name, status, metadata)
VALUES ('system_reset', 'ok', '{"reason": "go_live_reset", "reset_at": "2025-12-26", "tables_cleared": 18}'::jsonb);