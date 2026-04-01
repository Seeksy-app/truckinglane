-- Enrich load_activity_logs.meta with full email_import_logs.raw_headers (new/updated/dupes/source).
-- Fix: do not skip dat-csv-export@ (was incorrectly matched by LIKE 'dat-%').

CREATE OR REPLACE FUNCTION public.emit_load_activity_from_email_import()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF NEW.agency_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS NULL OR NEW.status NOT IN ('success', 'partial') THEN
    RETURN NEW;
  END IF;
  IF lower(NEW.sender_email) LIKE '%daily-archive%' THEN
    RETURN NEW;
  END IF;
  -- Legacy automated DAT API push only (CSV manual export uses dat-csv-export@)
  IF lower(NEW.sender_email) LIKE 'dat-export@%' THEN
    RETURN NEW;
  END IF;

  IF lower(NEW.sender_email) LIKE 'dat-csv-export@%' THEN
    v_action := 'export';
  ELSE
    v_action := 'import';
  END IF;

  INSERT INTO public.load_activity_logs (agency_id, action, created_at, meta)
  VALUES (
    NEW.agency_id,
    v_action,
    NEW.created_at,
    jsonb_build_object(
      'email_import_log_id', NEW.id,
      'sender_email', NEW.sender_email,
      'subject', NEW.subject,
      'status', NEW.status,
      'imported_count', NEW.imported_count,
      'error_message', NEW.error_message
    ) || COALESCE(NEW.raw_headers, '{}'::jsonb)
  );
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.emit_load_activity_from_email_import() IS
  'Mirrors each qualifying email_import_logs row into load_activity_logs; meta = audit columns merged with raw_headers (breakdown, source, template_type).';
