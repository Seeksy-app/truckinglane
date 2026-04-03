-- Atomic DAT export completion: stamp dat_posted_at and append session_logs (brokers are not INSERT-eligible on session_logs via RLS).

CREATE OR REPLACE FUNCTION public.tl_stamp_dat_export_and_log(
  p_agency_id uuid,
  p_load_ids uuid[],
  p_user_display_name text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean;
  v_expected int;
  v_updated int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  IF p_agency_id IS NULL THEN
    RAISE EXCEPTION 'agency required';
  END IF;

  IF p_load_ids IS NULL OR cardinality(p_load_ids) = 0 THEN
    RAISE EXCEPTION 'no load ids';
  END IF;

  SELECT count(*)::int
  INTO v_expected
  FROM (SELECT DISTINCT unnest(p_load_ids) AS id) s;

  SELECT EXISTS (
    SELECT 1
    FROM public.agency_members am
    WHERE am.user_id = v_uid AND am.agency_id = p_agency_id
  )
  OR public.has_role(v_uid, 'super_admin'::public.app_role)
  INTO v_ok;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.loads l
  SET dat_posted_at = now()
  FROM (SELECT DISTINCT unnest(p_load_ids) AS id) u
  WHERE l.id = u.id AND l.agency_id = p_agency_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'stamp count mismatch: expected %, updated %', v_expected, v_updated;
  END IF;

  INSERT INTO public.session_logs (agency_id, user_id, user_display_name, action, note)
  VALUES (
    p_agency_id,
    v_uid,
    NULLIF(trim(p_user_display_name), ''),
    'DAT Export',
    format('%s loads exported', v_updated)
  );

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.tl_stamp_dat_export_and_log(uuid, uuid[], text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tl_stamp_dat_export_and_log(uuid, uuid[], text) TO authenticated;

COMMENT ON FUNCTION public.tl_stamp_dat_export_and_log(uuid, uuid[], text) IS
  'Sets dat_posted_at for exported loads and records a session_logs row; caller must be agency member or super_admin.';
