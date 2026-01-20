-- Create agency_requests table for pending agency signups
CREATE TABLE public.agency_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  agency_name text NOT NULL,
  owner_name text NOT NULL,
  owner_email text NOT NULL,
  owner_phone text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamp with time zone,
  rejection_reason text,
  approval_token text UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  token_expires_at timestamp with time zone DEFAULT (now() + interval '7 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_agency_requests_status ON public.agency_requests(status);
CREATE INDEX idx_agency_requests_email ON public.agency_requests(owner_email);
CREATE INDEX idx_agency_requests_token ON public.agency_requests(approval_token);

-- Enable RLS
ALTER TABLE public.agency_requests ENABLE ROW LEVEL SECURITY;

-- Super admins can view all requests
CREATE POLICY "Super admins can view all agency requests"
ON public.agency_requests
FOR SELECT
USING (has_role(auth.uid(), 'super_admin'));

-- Super admins can update requests (approve/reject)
CREATE POLICY "Super admins can update agency requests"
ON public.agency_requests
FOR UPDATE
USING (has_role(auth.uid(), 'super_admin'));

-- Anyone can insert a request (public signup)
CREATE POLICY "Anyone can submit agency request"
ON public.agency_requests
FOR INSERT
WITH CHECK (true);

-- Super admins can delete requests
CREATE POLICY "Super admins can delete agency requests"
ON public.agency_requests
FOR DELETE
USING (has_role(auth.uid(), 'super_admin'));

-- Add trigger for updated_at
CREATE TRIGGER update_agency_requests_updated_at
  BEFORE UPDATE ON public.agency_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();