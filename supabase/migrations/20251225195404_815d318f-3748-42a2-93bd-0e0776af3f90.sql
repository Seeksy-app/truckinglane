-- Create status_checks table for health check history
CREATE TABLE IF NOT EXISTS public.status_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok', 'warn', 'fail', 'disabled')),
  message text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms integer,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS status_checks_service_checked_at_idx ON public.status_checks(service, checked_at DESC);

-- Create status_incidents table for incident tracking
CREATE TABLE IF NOT EXISTS public.status_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('minor', 'major', 'critical')),
  status text NOT NULL CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  title text NOT NULL,
  description text,
  started_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS status_incidents_service_started_at_idx ON public.status_incidents(service, started_at DESC);

-- Create legal_pages table for Terms, Privacy, Trust content
CREATE TABLE IF NOT EXISTS public.legal_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  content text NOT NULL,
  last_updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create view for latest status per service (public-safe fields only)
CREATE OR REPLACE VIEW public.public_status_latest AS
SELECT DISTINCT ON (service)
  service,
  status,
  message,
  latency_ms,
  checked_at
FROM public.status_checks
ORDER BY service, checked_at DESC;

-- Enable RLS on all tables
ALTER TABLE public.status_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_pages ENABLE ROW LEVEL SECURITY;

-- Status checks: public read, super admin write
CREATE POLICY "Anyone can view status checks"
ON public.status_checks FOR SELECT
USING (true);

CREATE POLICY "Super admins can insert status checks"
ON public.status_checks FOR INSERT
WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Service role can insert status checks"
ON public.status_checks FOR INSERT
WITH CHECK (true);

-- Status incidents: public read, super admin manage
CREATE POLICY "Anyone can view status incidents"
ON public.status_incidents FOR SELECT
USING (true);

CREATE POLICY "Super admins can manage incidents"
ON public.status_incidents FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Legal pages: public read, super admin manage
CREATE POLICY "Anyone can view legal pages"
ON public.legal_pages FOR SELECT
USING (true);

CREATE POLICY "Super admins can manage legal pages"
ON public.legal_pages FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at on legal_pages
CREATE TRIGGER update_legal_pages_updated_at
BEFORE UPDATE ON public.legal_pages
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default legal page content
INSERT INTO public.legal_pages (slug, title, content) VALUES
('terms', 'Terms of Service', E'# Terms of Service\n\n**Last Updated: December 25, 2025**\n\n## 1. Acceptance of Terms\n\nBy accessing or using TruckingLane.com (the "Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.\n\n## 2. Description of Service\n\nTruckingLane provides an AI-powered dispatch intelligence platform for the trucking and freight industry. Our services include automated call handling, carrier verification, lead scoring, and analytics.\n\n## 3. User Accounts\n\n- You must provide accurate and complete information when creating an account\n- You are responsible for maintaining the security of your account credentials\n- You must notify us immediately of any unauthorized use of your account\n- You must be at least 18 years old to use this Service\n\n## 4. Acceptable Use\n\nYou agree not to:\n- Use the Service for any illegal purpose\n- Attempt to gain unauthorized access to any part of the Service\n- Interfere with or disrupt the Service\n- Upload malicious code or content\n- Impersonate any person or entity\n\n## 5. Data and Privacy\n\nYour use of the Service is also governed by our Privacy Policy. By using the Service, you consent to the collection and use of your data as described therein.\n\n## 6. Intellectual Property\n\nThe Service and its original content, features, and functionality are owned by TruckingLane and are protected by copyright, trademark, and other intellectual property laws.\n\n## 7. Disclaimer of Warranties\n\nTHE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED.\n\n## 8. Limitation of Liability\n\nIN NO EVENT SHALL TRUCKINGLANE BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.\n\n## 9. Changes to Terms\n\nWe reserve the right to modify these terms at any time. We will notify users of any material changes.\n\n## 10. Contact\n\nFor questions about these Terms, contact us at legal@truckinglane.com'),

('privacy', 'Privacy Policy', E'# Privacy Policy\n\n**Last Updated: December 25, 2025**\n\n## 1. Introduction\n\nTruckingLane.com ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information.\n\n## 2. Information We Collect\n\n### Information You Provide\n- Account information (name, email, company name)\n- Payment information (processed securely by third-party providers)\n- Communications you send to us\n\n### Information Collected Automatically\n- Log data (IP address, browser type, pages visited)\n- Device information\n- Cookies and similar technologies\n\n### Call and Communication Data\n- Phone call recordings and transcripts (for AI processing)\n- Caller information and carrier details\n- Call metadata (duration, timestamps)\n\n## 3. How We Use Your Information\n\nWe use collected information to:\n- Provide and maintain our Service\n- Process AI-powered call handling and lead scoring\n- Verify carrier credentials with FMCSA\n- Improve and personalize user experience\n- Communicate with you about updates and support\n- Ensure security and prevent fraud\n- Comply with legal obligations\n\n## 4. Data Sharing\n\nWe may share your information with:\n- Service providers who assist in our operations\n- Regulatory bodies (e.g., FMCSA for carrier verification)\n- Law enforcement when required by law\n- Business partners with your consent\n\nWe do NOT sell your personal information to third parties.\n\n## 5. Data Security\n\nWe implement industry-standard security measures including:\n- Encryption in transit and at rest\n- Access controls and authentication\n- Regular security audits\n- Secure data centers\n\n## 6. Data Retention\n\nWe retain your data for as long as your account is active or as needed to provide services. You may request deletion of your data at any time.\n\n## 7. Your Rights\n\nDepending on your location, you may have rights to:\n- Access your personal data\n- Correct inaccurate data\n- Delete your data\n- Export your data\n- Opt out of certain processing\n\n## 8. Cookies\n\nWe use cookies to improve user experience. You can control cookies through your browser settings.\n\n## 9. Children''s Privacy\n\nOur Service is not intended for children under 18. We do not knowingly collect data from children.\n\n## 10. Changes to This Policy\n\nWe may update this Privacy Policy periodically. We will notify you of material changes.\n\n## 11. Contact Us\n\nFor privacy inquiries, contact us at privacy@truckinglane.com'),

('trust', 'Trust & Security', E'# Trust & Security\n\n**Last Updated: December 25, 2025**\n\n## Our Commitment to Security\n\nAt TruckingLane, security is not an afterthought—it''s fundamental to everything we build. We understand that you trust us with sensitive business data, and we take that responsibility seriously.\n\n## Security Measures\n\n### Infrastructure Security\n- **Hosting**: Enterprise-grade cloud infrastructure with SOC 2 compliance\n- **Encryption**: All data encrypted in transit (TLS 1.3) and at rest (AES-256)\n- **Network Security**: DDoS protection, WAF, and intrusion detection systems\n- **Backups**: Automated daily backups with point-in-time recovery\n\n### Application Security\n- **Authentication**: Multi-factor authentication support\n- **Authorization**: Role-based access control (RBAC)\n- **API Security**: Rate limiting, API key management, and audit logging\n- **Code Security**: Regular security audits and penetration testing\n\n### Data Protection\n- **Access Controls**: Strict principle of least privilege\n- **Audit Logging**: Comprehensive activity logs for compliance\n- **Data Isolation**: Multi-tenant architecture with logical data separation\n- **PII Handling**: Sensitive data masked in logs and error reports\n\n## Compliance\n\n- FMCSA Regulations Compliance\n- CCPA/CPRA Ready\n- GDPR Ready (for applicable users)\n- SOC 2 Type II (in progress)\n\n## Carrier Verification\n\nWe integrate directly with FMCSA systems to provide real-time carrier verification:\n- Authority status validation\n- Insurance coverage verification\n- Safety rating checks\n- Out-of-service monitoring\n\n## Incident Response\n\nOur security team maintains a 24/7 incident response capability:\n- Immediate threat assessment and containment\n- Customer notification within 72 hours of confirmed breach\n- Post-incident analysis and prevention measures\n\n## Responsible Disclosure\n\nWe welcome security researchers to report vulnerabilities responsibly. Contact security@truckinglane.com for our bug bounty program details.\n\n## Uptime Commitment\n\nWe target 99.9% uptime for our core services. Check our [Status Page](/status) for real-time system health.\n\n## Contact Security Team\n\nFor security concerns or questions:\n- Email: security@truckinglane.com\n- Response time: Within 24 hours for security matters')
ON CONFLICT (slug) DO NOTHING;