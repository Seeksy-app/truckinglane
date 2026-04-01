-- Dedupe inbound email-import payloads (attachment bytes or VMS body hash) within a 1h window.
CREATE TABLE public.email_import_attachment_dedupe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_import_attachment_dedupe_payload_created
  ON public.email_import_attachment_dedupe (payload_hash, created_at DESC);

ALTER TABLE public.email_import_attachment_dedupe ENABLE ROW LEVEL SECURITY;
