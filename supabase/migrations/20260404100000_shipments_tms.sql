-- TMS: customers, carriers, shipments, shipment_stops (broker / agency scoped)

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  company_name text NOT NULL,
  address text,
  city text,
  state text,
  zip text,
  contact_name text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_agency ON public.customers(agency_id);
CREATE INDEX idx_customers_agency_company_lower ON public.customers(agency_id, lower(company_name));

CREATE TABLE public.carriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  dba_name text,
  mc_number text,
  dot_number text,
  phone text,
  address text,
  city text,
  state text,
  zip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_carriers_agency ON public.carriers(agency_id);
CREATE INDEX idx_carriers_agency_mc ON public.carriers(agency_id, mc_number);
CREATE INDEX idx_carriers_agency_name_lower ON public.carriers(agency_id, lower(legal_name));

CREATE TABLE public.shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  pro_number text NOT NULL,
  status text NOT NULL DEFAULT 'new',
  equipment_type text,
  equipment_footage numeric,
  weight_lbs numeric,
  commodity text,
  pieces integer,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_ref text,
  bill_to_same_as_customer boolean NOT NULL DEFAULT true,
  bill_to_company text,
  bill_to_address text,
  bill_to_city text,
  bill_to_state text,
  bill_to_zip text,
  customer_rate_type text NOT NULL DEFAULT 'flat',
  customer_lh_rate numeric,
  customer_fsc_pct numeric,
  customer_fsc_per_mile numeric,
  carrier_rate_type text NOT NULL DEFAULT 'flat',
  carrier_lh_rate numeric,
  carrier_max_rate numeric,
  carrier_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL,
  carrier_mc text,
  carrier_dot text,
  dispatcher_name text,
  dispatcher_phone text,
  driver_name text,
  driver_phone text,
  driver_cell text,
  truck_number text,
  trailer_number text,
  scac text,
  note_rate_conf text,
  note_bol text,
  note_special_instructions text,
  note_updates text,
  conf_sent_at timestamptz,
  dispatched_at timestamptz,
  loaded_at timestamptz,
  arrived_pickup_at timestamptz,
  in_transit_at timestamptz,
  arrived_consignee_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipments_status_check CHECK (
    status IN ('new', 'dispatched', 'in_transit', 'delivered', 'covered')
  ),
  CONSTRAINT shipments_customer_rate_type_check CHECK (
    customer_rate_type IN ('flat', 'per_mile', 'per_ton')
  ),
  CONSTRAINT shipments_carrier_rate_type_check CHECK (
    carrier_rate_type IN ('flat', 'per_mile', 'per_ton')
  ),
  CONSTRAINT shipments_agency_pro_unique UNIQUE (agency_id, pro_number)
);

CREATE INDEX idx_shipments_agency ON public.shipments(agency_id);
CREATE INDEX idx_shipments_agency_status ON public.shipments(agency_id, status);
CREATE INDEX idx_shipments_agency_created ON public.shipments(agency_id, created_at DESC);

CREATE TABLE public.shipment_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  stop_type text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  facility_name text,
  address text,
  city text,
  state text,
  zip text,
  contact_name text,
  contact_phone text,
  ready_at timestamptz,
  appointment_at timestamptz,
  appointment_note text,
  must_deliver_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shipment_stops_type_check CHECK (stop_type IN ('pickup', 'delivery'))
);

CREATE INDEX idx_shipment_stops_shipment ON public.shipment_stops(shipment_id, stop_type);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY customers_select ON public.customers FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = customers.agency_id)
  OR EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.role = 'super_admin')
);

CREATE POLICY customers_insert ON public.customers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = customers.agency_id)
);

CREATE POLICY customers_update ON public.customers FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = customers.agency_id)
);

CREATE POLICY customers_delete ON public.customers FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = customers.agency_id)
);

CREATE POLICY carriers_select ON public.carriers FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = carriers.agency_id)
  OR EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.role = 'super_admin')
);

CREATE POLICY carriers_insert ON public.carriers FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = carriers.agency_id)
);

CREATE POLICY carriers_update ON public.carriers FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = carriers.agency_id)
);

CREATE POLICY carriers_delete ON public.carriers FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = carriers.agency_id)
);

CREATE POLICY shipments_select ON public.shipments FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = shipments.agency_id)
  OR EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.role = 'super_admin')
);

CREATE POLICY shipments_insert ON public.shipments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = shipments.agency_id)
);

CREATE POLICY shipments_update ON public.shipments FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = shipments.agency_id)
);

CREATE POLICY shipments_delete ON public.shipments FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.agency_id = shipments.agency_id)
);

CREATE POLICY shipment_stops_select ON public.shipment_stops FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.shipments s
    INNER JOIN public.agency_members m ON m.agency_id = s.agency_id AND m.user_id = auth.uid()
    WHERE s.id = shipment_stops.shipment_id
  )
  OR EXISTS (SELECT 1 FROM public.agency_members m WHERE m.user_id = auth.uid() AND m.role = 'super_admin')
);

CREATE POLICY shipment_stops_insert ON public.shipment_stops FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.shipments s
    INNER JOIN public.agency_members m ON m.agency_id = s.agency_id AND m.user_id = auth.uid()
    WHERE s.id = shipment_stops.shipment_id
  )
);

CREATE POLICY shipment_stops_update ON public.shipment_stops FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.shipments s
    INNER JOIN public.agency_members m ON m.agency_id = s.agency_id AND m.user_id = auth.uid()
    WHERE s.id = shipment_stops.shipment_id
  )
);

CREATE POLICY shipment_stops_delete ON public.shipment_stops FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.shipments s
    INNER JOIN public.agency_members m ON m.agency_id = s.agency_id AND m.user_id = auth.uid()
    WHERE s.id = shipment_stops.shipment_id
  )
);

COMMENT ON TABLE public.shipments IS 'TMS shipment / load record (TruckingLanes replacement path for Aljex).';
COMMENT ON TABLE public.shipment_stops IS 'Pickup and delivery stops for a shipment.';
