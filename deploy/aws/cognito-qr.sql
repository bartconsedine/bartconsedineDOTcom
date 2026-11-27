-- Destination only. Install after the existing site QR migration and owner bridge.
BEGIN;
CREATE FUNCTION public.cognito_complete_qr(p_secret text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  sid uuid := (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
BEGIN
  IF sid IS NULL OR NOT private.is_site_admin() THEN
    RAISE EXCEPTION 'Device authorization denied' USING ERRCODE='42501';
  END IF;
  -- Both writes share a transaction. The existing function enforces claim,
  -- expiry, original owner and target-device secret, and rolls back on denial.
  INSERT INTO auth.sessions(id,user_id) VALUES (sid,auth.uid());
  RETURN private.admin_qr('complete',p_secret,'{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.cognito_complete_qr(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cognito_complete_qr(text) TO id;
COMMIT;
