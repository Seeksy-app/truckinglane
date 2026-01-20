-- Table to store trust page access settings (super admin controls)
CREATE TABLE public.trust_page_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  is_enabled boolean NOT NULL DEFAULT true,
  allowed_domains text[] DEFAULT NULL,
  allowed_emails text[] DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert default settings
INSERT INTO public.trust_page_settings (is_enabled) VALUES (true);

-- Table to store trust page sessions
CREATE TABLE public.trust_page_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  code text NOT NULL,
  code_expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  session_expires_at timestamptz,
  ip_address text,
  user_agent text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table to store access logs
CREATE TABLE public.trust_page_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.trust_page_sessions(id) ON DELETE SET NULL,
  email text NOT NULL,
  action text NOT NULL,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.trust_page_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_page_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trust_page_access_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for trust_page_settings (super_admin only)
CREATE POLICY "Super admins can view settings"
  ON public.trust_page_settings FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update settings"
  ON public.trust_page_settings FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

-- RLS policies for trust_page_sessions (super_admin can view all, public can insert for verification)
CREATE POLICY "Super admins can view all sessions"
  ON public.trust_page_sessions FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update sessions"
  ON public.trust_page_sessions FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Anyone can insert sessions"
  ON public.trust_page_sessions FOR INSERT
  WITH CHECK (true);

-- RLS policies for access logs
CREATE POLICY "Super admins can view access logs"
  ON public.trust_page_access_logs FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Anyone can insert access logs"
  ON public.trust_page_access_logs FOR INSERT
  WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_trust_page_settings_updated_at
  BEFORE UPDATE ON public.trust_page_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();