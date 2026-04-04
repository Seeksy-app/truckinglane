-- Driver GPS tracking: sessions (per share link) and pings (coordinates).

CREATE TABLE public.tracking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  load_id uuid NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  driver_phone text,
  status text NOT NULL DEFAULT 'pending',
  last_ping_at timestamptz,
  started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tracking_sessions_status_check CHECK (status IN ('pending', 'active', 'ended'))
);

CREATE INDEX idx_tracking_sessions_agency ON public.tracking_sessions(agency_id);
CREATE INDEX idx_tracking_sessions_load ON public.tracking_sessions(load_id);
CREATE INDEX idx_tracking_sessions_agency_status ON public.tracking_sessions(agency_id, status);

CREATE TABLE public.tracking_pings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.tracking_sessions(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  heading double precision,
  speed double precision,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_tracking_pings_session_created ON public.tracking_pings(session_id, created_at DESC);

ALTER TABLE public.tracking_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tracking_pings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tracking_sessions_select_agency"
ON public.tracking_sessions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.agency_id = tracking_sessions.agency_id
  )
  OR EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);

CREATE POLICY "tracking_pings_select_agency"
ON public.tracking_pings FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tracking_sessions ts
    INNER JOIN public.agency_members m ON m.agency_id = ts.agency_id AND m.user_id = auth.uid()
    WHERE ts.id = tracking_pings.session_id
  )
  OR EXISTS (
    SELECT 1 FROM public.agency_members m
    WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
  )
);

COMMENT ON TABLE public.tracking_sessions IS 'Shareable driver tracking links per load; token matches tracking-ping edge function.';
COMMENT ON TABLE public.tracking_pings IS 'GPS samples from driver tracking page / tracking-ping.';

-- Map data: latest ping per session for broker Live Map (agency-scoped, RLS inside function).
CREATE OR REPLACE FUNCTION public.get_active_tracking_for_map(p_agency_id uuid)
RETURNS TABLE (
  session_id uuid,
  token text,
  driver_phone text,
  last_ping_at timestamptz,
  session_status text,
  load_number text,
  pickup_city text,
  pickup_state text,
  dest_city text,
  dest_state text,
  ping_lat double precision,
  ping_lng double precision,
  ping_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.agency_members m
      WHERE m.user_id = auth.uid() AND m.agency_id = p_agency_id
    )
    OR EXISTS (
      SELECT 1 FROM public.agency_members m
      WHERE m.user_id = auth.uid() AND m.role = 'super_admin'
    )
  ) THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    ts.id,
    ts.token,
    ts.driver_phone,
    ts.last_ping_at,
    ts.status,
    l.load_number,
    l.pickup_city,
    l.pickup_state,
    l.dest_city,
    l.dest_state,
    lp.lat,
    lp.lng,
    lp.created_at
  FROM public.tracking_sessions ts
  INNER JOIN public.loads l ON l.id = ts.load_id
  LEFT JOIN LATERAL (
    SELECT p.lat, p.lng, p.created_at
    FROM public.tracking_pings p
    WHERE p.session_id = ts.id
    ORDER BY p.created_at DESC
    LIMIT 1
  ) lp ON true
  WHERE ts.agency_id = p_agency_id
    AND ts.status IN ('pending', 'active');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_tracking_for_map(uuid) TO authenticated;
