-- Destination only. PostgREST validates the pool's JWKS and client audience.
-- Its role selector is .token_use. Cognito ID tokens use database role "id".
BEGIN;
CREATE ROLE id NOLOGIN NOBYPASSRLS;
GRANT authenticated TO id;
GRANT id TO authenticator;
CREATE SCHEMA cognito_bridge;
CREATE FUNCTION cognito_bridge.bind_cognito_owner() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  identity jsonb := claims->'identities'->0;
  owner_id uuid;
BEGIN
  IF current_setting('role') = 'anon' THEN
    IF claims ? 'sub' THEN RAISE EXCEPTION 'Unexpected anonymous identity' USING ERRCODE = '42501'; END IF;
    RETURN;
  END IF;
  IF current_setting('role') <> 'id'
     OR claims->>'iss' IS DISTINCT FROM current_setting('bartsite.cognito_issuer')
     OR claims->>'aud' IS DISTINCT FROM current_setting('bartsite.cognito_client')
     OR claims->>'token_use' IS DISTINCT FROM 'id'
     OR claims->'email_verified' IS DISTINCT FROM 'true'::jsonb
     OR jsonb_array_length(claims->'identities') IS DISTINCT FROM 1
     OR identity->>'providerName' IS DISTINCT FROM 'Google'
     OR identity->>'providerType' IS DISTINCT FROM 'Google'
     OR nullif(identity->>'userId', '') IS NULL THEN
    RAISE EXCEPTION 'Unverified identity' USING ERRCODE = '42501';
  END IF;
  SELECT u.id INTO STRICT owner_id
    FROM auth.users u JOIN auth.identities i ON i.user_id = u.id
    WHERE i.provider = 'google' AND i.provider_id = identity->>'userId'
      AND i.identity_data->>'sub' = i.provider_id AND i.identity_data->'email_verified' = 'true'::jsonb
      AND lower(u.email) = lower(claims->>'email') AND lower(i.identity_data->>'email') = lower(u.email)
      AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS NOT TRUE
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now());
  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM set_config('request.jwt.claims', (claims || jsonb_build_object('sub', owner_id, 'role', 'authenticated', 'session_id', claims->>'origin_jti'))::text, true);
EXCEPTION WHEN no_data_found OR too_many_rows THEN
  RAISE EXCEPTION 'Workspace owner unavailable' USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION cognito_bridge.bind_cognito_owner() FROM PUBLIC;
GRANT USAGE ON SCHEMA cognito_bridge TO id, anon;
GRANT EXECUTE ON FUNCTION cognito_bridge.bind_cognito_owner() TO id, anon;
CREATE FUNCTION public.cognito_workspace_owner() RETURNS uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog AS $$ SELECT auth.uid() $$;
REVOKE ALL ON FUNCTION public.cognito_workspace_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cognito_workspace_owner() TO id;
COMMIT;
