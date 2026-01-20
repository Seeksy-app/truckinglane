-- Add match_type, case_sensitive, and weight columns to high_intent_keywords
ALTER TABLE public.high_intent_keywords 
ADD COLUMN IF NOT EXISTS match_type text NOT NULL DEFAULT 'contains',
ADD COLUMN IF NOT EXISTS case_sensitive boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 0.85;

-- Add constraint to validate match_type values
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'high_intent_keywords_match_type_check'
  ) THEN
    ALTER TABLE public.high_intent_keywords 
    ADD CONSTRAINT high_intent_keywords_match_type_check 
    CHECK (match_type IN ('contains', 'exact', 'regex'));
  END IF;
END $$;

-- Add index on expires_at for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_high_intent_keywords_expires_at 
ON public.high_intent_keywords(expires_at);

-- Comment for documentation
COMMENT ON COLUMN public.high_intent_keywords.match_type IS 'Matching strategy: contains (substring), exact (word boundary), regex (pattern)';
COMMENT ON COLUMN public.high_intent_keywords.case_sensitive IS 'Whether matching should be case-sensitive';
COMMENT ON COLUMN public.high_intent_keywords.weight IS 'Score weight applied when matched (default 0.85 = 85%)';