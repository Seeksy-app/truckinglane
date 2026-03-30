-- Per-agent "last time I opened the NEW loads card" — drives NEW count + pulse (not shared across agents).
CREATE TABLE public.agent_new_loads_view (
  agent_id uuid PRIMARY KEY REFERENCES public.profiles (id) ON DELETE CASCADE,
  last_viewed_new_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.agent_new_loads_view IS 'Per-agent timestamp: open loads with created_at after this (or after local today start if unset) count as NEW.';

ALTER TABLE public.agent_new_loads_view ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_new_loads_view_select_own"
  ON public.agent_new_loads_view
  FOR SELECT
  TO authenticated
  USING (agent_id = auth.uid());

CREATE POLICY "agent_new_loads_view_insert_own"
  ON public.agent_new_loads_view
  FOR INSERT
  TO authenticated
  WITH CHECK (agent_id = auth.uid());

CREATE POLICY "agent_new_loads_view_update_own"
  ON public.agent_new_loads_view
  FOR UPDATE
  TO authenticated
  USING (agent_id = auth.uid())
  WITH CHECK (agent_id = auth.uid());

CREATE POLICY "agent_new_loads_view_delete_own"
  ON public.agent_new_loads_view
  FOR DELETE
  TO authenticated
  USING (agent_id = auth.uid());
