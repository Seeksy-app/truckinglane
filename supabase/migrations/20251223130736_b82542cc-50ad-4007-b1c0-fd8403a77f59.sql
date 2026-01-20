-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create agencies table
CREATE TABLE public.agencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create agency_members table (links users to agencies)
CREATE TABLE public.agency_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(agency_id, user_id)
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agency_members ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Agencies policies
CREATE POLICY "Users can view agencies they belong to"
  ON public.agencies FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_members
      WHERE agency_members.agency_id = agencies.id
      AND agency_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Agency owners can update their agency"
  ON public.agencies FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_members
      WHERE agency_members.agency_id = agencies.id
      AND agency_members.user_id = auth.uid()
      AND agency_members.role = 'owner'
    )
  );

CREATE POLICY "Authenticated users can create agencies"
  ON public.agencies FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Agency members policies
CREATE POLICY "Users can view members of their agencies"
  ON public.agency_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_members am
      WHERE am.agency_id = agency_members.agency_id
      AND am.user_id = auth.uid()
    )
  );

CREATE POLICY "Agency owners can manage members"
  ON public.agency_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_members am
      WHERE am.agency_id = agency_members.agency_id
      AND am.user_id = auth.uid()
      AND am.role = 'owner'
    )
  );

CREATE POLICY "Users can add themselves to agencies"
  ON public.agency_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agencies_updated_at
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_agency_members_updated_at
  BEFORE UPDATE ON public.agency_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'full_name'
  );
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();