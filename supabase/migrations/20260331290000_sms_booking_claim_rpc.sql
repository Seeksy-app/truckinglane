-- Claim / decline / revert SMS booking loads with SECURITY DEFINER so RLS cannot block
-- dashboard users (including super_admin impersonation). Access is still enforced inside each function.

CREATE OR REPLACE FUNCTION public.claim_sms_booking_load(p_load_id uuid, p_load_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_agency uuid;
  v_rows integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT l.agency_id INTO v_agency
  FROM public.loads l
  WHERE l.id = p_load_id AND l.load_number = p_load_number
  LIMIT 1;

  IF v_agency IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'load_not_found');
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.agency_members am
      WHERE am.user_id = v_uid AND am.agency_id = v_agency
    )
    OR public.has_role(v_uid, 'super_admin'::public.app_role)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.loads
  SET
    sms_book_status = 'booked',
    booked_handled_at = now(),
    booked_handled_by = v_uid,
    status = 'booked',
    booked_at = now(),
    booked_by = v_uid,
    updated_at = now()
  WHERE id = p_load_id
    AND load_number = p_load_number
    AND agency_id = v_agency
    AND sms_book_status = 'pending_review'
    AND booked_handled_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_row_updated',
      'detail', 'expected pending_review with null booked_handled_at'
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_sms_booking_load(p_load_id uuid, p_load_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_agency uuid;
  v_rows integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT l.agency_id INTO v_agency
  FROM public.loads l
  WHERE l.id = p_load_id AND l.load_number = p_load_number
  LIMIT 1;

  IF v_agency IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'load_not_found');
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.agency_members am
      WHERE am.user_id = v_uid AND am.agency_id = v_agency
    )
    OR public.has_role(v_uid, 'super_admin'::public.app_role)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.loads
  SET
    sms_book_status = 'declined',
    booked_handled_at = now(),
    updated_at = now()
  WHERE id = p_load_id
    AND load_number = p_load_number
    AND agency_id = v_agency
    AND sms_book_status = 'pending_review'
    AND booked_handled_at IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'no_row_updated',
      'detail', 'expected pending_review with null booked_handled_at'
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.revert_sms_booking_claim(
  p_load_id uuid,
  p_load_number text,
  p_prev_status text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_agency uuid;
  v_rows integer;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT l.agency_id INTO v_agency
  FROM public.loads l
  WHERE l.id = p_load_id AND l.load_number = p_load_number
  LIMIT 1;

  IF v_agency IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'load_not_found');
  END IF;

  IF NOT (
    EXISTS (
      SELECT 1 FROM public.agency_members am
      WHERE am.user_id = v_uid AND am.agency_id = v_agency
    )
    OR public.has_role(v_uid, 'super_admin'::public.app_role)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  UPDATE public.loads
  SET
    sms_book_status = 'pending_review',
    booked_handled_at = null,
    booked_handled_by = null,
    status = CASE
      WHEN trim(COALESCE(p_prev_status, '')) = '' THEN 'open'::text
      ELSE trim(p_prev_status)
    END,
    booked_at = null,
    booked_by = null,
    updated_at = now()
  WHERE id = p_load_id
    AND load_number = p_load_number
    AND agency_id = v_agency;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_row_updated');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_sms_booking_load(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.decline_sms_booking_load(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revert_sms_booking_claim(uuid, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.claim_sms_booking_load(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_sms_booking_load(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revert_sms_booking_claim(uuid, text, text) TO authenticated;
