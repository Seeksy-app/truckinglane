-- Create agent_invites table for token-based invitations
CREATE TABLE public.agent_invites (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('agent', 'agency_admin')),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for token lookup
CREATE INDEX idx_agent_invites_token ON public.agent_invites(token);
CREATE INDEX idx_agent_invites_email ON public.agent_invites(email);
CREATE INDEX idx_agent_invites_agency ON public.agent_invites(agency_id);

-- Enable RLS
ALTER TABLE public.agent_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Admins can view invites for their agency
CREATE POLICY "Admins can view agency invites"
ON public.agent_invites
FOR SELECT
USING (
  agency_id = get_user_agency_id(auth.uid()) 
  AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin'))
);

-- Admins can create invites for their agency
CREATE POLICY "Admins can create invites"
ON public.agent_invites
FOR INSERT
WITH CHECK (
  agency_id = get_user_agency_id(auth.uid())
  AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin'))
);

-- Admins can update invites (e.g., mark as accepted)
CREATE POLICY "Admins can update invites"
ON public.agent_invites
FOR UPDATE
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin'))
);

-- Admins can delete invites
CREATE POLICY "Admins can delete invites"
ON public.agent_invites
FOR DELETE
USING (
  agency_id = get_user_agency_id(auth.uid())
  AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin'))
);

-- Public can view invite by token (for accepting invites - unauthenticated)
CREATE POLICY "Anyone can view invite by token"
ON public.agent_invites
FOR SELECT
USING (true);

-- Add 'owner' to the app_role enum if not exists (for agency owners)
DO $$
BEGIN
  ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'owner';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;