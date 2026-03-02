-- Allow agency members to delete leads in their agency
CREATE POLICY "Agency members can delete their leads"
ON public.leads
FOR DELETE
USING (EXISTS (
  SELECT 1 FROM agency_members am
  WHERE am.user_id = auth.uid() AND am.agency_id = leads.agency_id
));