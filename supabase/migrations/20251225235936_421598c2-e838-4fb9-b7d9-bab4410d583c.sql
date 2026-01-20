-- Add scope and agent_id columns to high_intent_keywords table
ALTER TABLE public.high_intent_keywords 
ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'global',
ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

-- Add constraint: agent scope requires agent_id, global scope requires null agent_id
ALTER TABLE public.high_intent_keywords 
ADD CONSTRAINT high_intent_keywords_scope_check 
CHECK (
  (scope = 'agent' AND agent_id IS NOT NULL) OR 
  (scope = 'global' AND agent_id IS NULL)
);

-- Create index for agent lookups
CREATE INDEX IF NOT EXISTS idx_high_intent_keywords_agent_id ON public.high_intent_keywords(agent_id);
CREATE INDEX IF NOT EXISTS idx_high_intent_keywords_scope ON public.high_intent_keywords(scope);

-- Drop existing policies
DROP POLICY IF EXISTS "Agency members can delete their keywords" ON public.high_intent_keywords;
DROP POLICY IF EXISTS "Agency members can insert keywords" ON public.high_intent_keywords;
DROP POLICY IF EXISTS "Agency members can view their keywords" ON public.high_intent_keywords;

-- New RLS policies for scoped keywords

-- Agents can view their own keywords + global keywords in their agency
CREATE POLICY "View own and global keywords"
ON public.high_intent_keywords
FOR SELECT
USING (
  agency_id = get_user_agency_id(auth.uid()) 
  AND (
    scope = 'global' 
    OR agent_id = auth.uid()
  )
);

-- Agents can insert their own keywords
CREATE POLICY "Insert own agent keywords"
ON public.high_intent_keywords
FOR INSERT
WITH CHECK (
  agency_id = get_user_agency_id(auth.uid())
  AND scope = 'agent'
  AND agent_id = auth.uid()
);

-- Admins can insert global keywords
CREATE POLICY "Admins insert global keywords"
ON public.high_intent_keywords
FOR INSERT
WITH CHECK (
  agency_id = get_user_agency_id(auth.uid())
  AND scope = 'global'
  AND agent_id IS NULL
  AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin'))
);

-- Agents can delete their own keywords
CREATE POLICY "Delete own agent keywords"
ON public.high_intent_keywords
FOR DELETE
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND scope = 'agent'
  AND agent_id = auth.uid()
);

-- Admins can delete global keywords
CREATE POLICY "Admins delete global keywords"
ON public.high_intent_keywords
FOR DELETE
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND scope = 'global'
  AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin'))
);

-- Agents can update their own keywords
CREATE POLICY "Update own agent keywords"
ON public.high_intent_keywords
FOR UPDATE
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND scope = 'agent'
  AND agent_id = auth.uid()
);

-- Admins can update global keywords
CREATE POLICY "Admins update global keywords"
ON public.high_intent_keywords
FOR UPDATE
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND scope = 'global'
  AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin'))
);