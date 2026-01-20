-- Fix process_post_call_transcript_trigger function to set search_path
CREATE OR REPLACE FUNCTION public.process_post_call_transcript_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  -- only act on transcription events
  if new.event_type in ('post_call_transcription', 'transcription.completed') then
    perform
      net.http_post(
        url := 'https://vjgakkomhphvdbwjjwiv.supabase.co/functions/v1/process_post_call_transcript',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || current_setting('request.jwt.claim.role', true)
        ),
        body := jsonb_build_object(
          'webhook_log_id', new.id
        )
      );
  end if;

  return new;
end;
$$;