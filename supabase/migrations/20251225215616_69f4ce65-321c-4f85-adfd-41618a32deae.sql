-- Chat channels table
CREATE TABLE public.chat_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID REFERENCES public.agencies(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  is_dm BOOLEAN DEFAULT false,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(agency_id, name)
);

-- Chat channel members
CREATE TABLE public.chat_channel_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role TEXT DEFAULT 'member' NOT NULL,
  joined_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(channel_id, user_id)
);

-- Chat messages
CREATE TABLE public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  sender_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  body TEXT NOT NULL,
  mentions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_chat_messages_channel_time ON public.chat_messages(channel_id, created_at DESC);

-- Chat read receipts
CREATE TABLE public.chat_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID REFERENCES public.chat_channels(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  last_read_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  UNIQUE(channel_id, user_id)
);

-- Notification settings per user
CREATE TABLE public.notification_settings (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  chat_enabled BOOLEAN DEFAULT true,
  chat_sound BOOLEAN DEFAULT false,
  chat_desktop BOOLEAN DEFAULT false,
  chat_badge BOOLEAN DEFAULT true,
  chat_unread_preview BOOLEAN DEFAULT true,
  chat_only_mentions BOOLEAN DEFAULT false,
  quiet_hours_enabled BOOLEAN DEFAULT false,
  quiet_hours_start TEXT DEFAULT '22:00',
  quiet_hours_end TEXT DEFAULT '07:00',
  sms_enabled BOOLEAN DEFAULT false,
  sms_phone TEXT,
  email_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);

-- Enable RLS on all tables
ALTER TABLE public.chat_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_channel_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies for chat_channels
CREATE POLICY "Agency members can view their channels"
ON public.chat_channels FOR SELECT
USING (agency_id = get_user_agency_id(auth.uid()));

CREATE POLICY "Admins can create channels"
ON public.chat_channels FOR INSERT
WITH CHECK (agency_id = get_user_agency_id(auth.uid()) AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin')));

CREATE POLICY "Admins can update channels"
ON public.chat_channels FOR UPDATE
USING (agency_id = get_user_agency_id(auth.uid()) AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin')));

CREATE POLICY "Admins can delete channels"
ON public.chat_channels FOR DELETE
USING (agency_id = get_user_agency_id(auth.uid()) AND (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin')));

-- RLS Policies for chat_channel_members
CREATE POLICY "Users can view their memberships"
ON public.chat_channel_members FOR SELECT
USING (user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM chat_channels c WHERE c.id = channel_id AND c.agency_id = get_user_agency_id(auth.uid())
));

CREATE POLICY "Admins can manage channel members"
ON public.chat_channel_members FOR ALL
USING (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can join channels in their agency"
ON public.chat_channel_members FOR INSERT
WITH CHECK (user_id = auth.uid() AND EXISTS (
  SELECT 1 FROM chat_channels c WHERE c.id = channel_id AND c.agency_id = get_user_agency_id(auth.uid())
));

-- RLS Policies for chat_messages
CREATE POLICY "Members can read messages in their channels"
ON public.chat_messages FOR SELECT
USING (EXISTS (
  SELECT 1 FROM chat_channel_members ccm WHERE ccm.channel_id = chat_messages.channel_id AND ccm.user_id = auth.uid()
));

CREATE POLICY "Members can send messages to their channels"
ON public.chat_messages FOR INSERT
WITH CHECK (sender_id = auth.uid() AND EXISTS (
  SELECT 1 FROM chat_channel_members ccm WHERE ccm.channel_id = chat_messages.channel_id AND ccm.user_id = auth.uid()
));

-- RLS Policies for chat_reads
CREATE POLICY "Users can manage their own read receipts"
ON public.chat_reads FOR ALL
USING (user_id = auth.uid());

-- RLS Policies for notification_settings
CREATE POLICY "Users can manage their own notification settings"
ON public.notification_settings FOR ALL
USING (user_id = auth.uid());

CREATE POLICY "Admins can view all notification settings"
ON public.notification_settings FOR SELECT
USING (has_role(auth.uid(), 'agency_admin') OR has_role(auth.uid(), 'super_admin'));

-- RLS Policies for notifications
CREATE POLICY "Users can manage their own notifications"
ON public.notifications FOR ALL
USING (user_id = auth.uid());

-- Enable realtime for chat_messages and notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Set REPLICA IDENTITY for realtime
ALTER TABLE public.chat_messages REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;