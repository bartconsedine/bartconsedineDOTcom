-- Destination only. PostgREST validates the pool's JWKS and client audience.
-- Its role selector is .token_use. Cognito ID tokens use database role "id".
BEGIN;
CREATE ROLE id NOLOGIN NOBYPASSRLS;
GRANT authenticated TO id;
GRANT id TO authenticator;
CREATE SCHEMA cognito_bridge;
CREATE TABLE cognito_bridge.pool (
  singleton boolean PRIMARY KEY CHECK (singleton),
  issuer text NOT NULL,
  client_id text NOT NULL
);
REVOKE ALL ON cognito_bridge.pool FROM PUBLIC, anon, authenticated, id;
CREATE FUNCTION cognito_bridge.bind_cognito_owner() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  claims jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  identity jsonb := claims->'identities'->0;
  owner_id uuid;
  pool cognito_bridge.pool%ROWTYPE;
BEGIN
  IF current_setting('role') = 'anon' THEN
    IF claims ? 'sub' THEN RAISE EXCEPTION 'Unexpected anonymous identity' USING ERRCODE = '42501'; END IF;
    RETURN;
  END IF;
  SELECT * INTO STRICT pool FROM cognito_bridge.pool WHERE singleton;
  IF current_setting('role') <> 'id'
     OR claims->>'iss' IS DISTINCT FROM pool.issuer
     OR claims->>'aud' IS DISTINCT FROM pool.client_id
     OR claims->>'token_use' IS DISTINCT FROM 'id'
     OR claims->'email_verified' IS DISTINCT FROM 'true'::jsonb
     OR jsonb_array_length(claims->'identities') IS DISTINCT FROM 1
     OR identity->>'providerName' IS DISTINCT FROM 'Google'
     OR identity->>'providerType' IS DISTINCT FROM 'Google'
     OR nullif(identity->>'userId', '') IS NULL THEN
    RAISE EXCEPTION 'Unverified identity' USING ERRCODE = '42501';
  END IF;
  BEGIN
    SELECT u.id INTO STRICT owner_id
    FROM auth.users u JOIN auth.identities i ON i.user_id = u.id
    WHERE i.provider = 'google' AND i.provider_id = identity->>'userId'
      AND i.identity_data->>'sub' = i.provider_id AND i.identity_data->'email_verified' = 'true'::jsonb
      AND lower(u.email) = lower(claims->>'email') AND lower(i.identity_data->>'email') = lower(u.email)
      AND u.email_confirmed_at IS NOT NULL AND u.is_anonymous IS NOT TRUE
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until <= now());
  EXCEPTION WHEN no_data_found THEN
    -- Only the sign-in RPC may create a fresh owner for an existing invitation.
    -- Existing email/subject records must pass the original identity match.
    IF current_setting('request.method', true) IS DISTINCT FROM 'POST'
       OR current_setting('request.path', true) IS DISTINCT FROM '/rpc/cognito_workspace_owner'
       OR nullif(claims->>'email','') IS NULL THEN RAISE; END IF;
    PERFORM pg_advisory_xact_lock(hashtextextended(lower(claims->>'email'), 0));
    IF NOT EXISTS (SELECT 1 FROM public.app_access_grants WHERE invited_email = lower(claims->>'email'))
       OR EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(claims->>'email'))
       OR EXISTS (SELECT 1 FROM auth.identities WHERE provider = 'google' AND provider_id = identity->>'userId')
       OR EXISTS (SELECT 1 FROM private.site_admin WHERE email = lower(claims->>'email')) THEN RAISE; END IF;
    owner_id := gen_random_uuid();
    INSERT INTO auth.users(id,email,email_confirmed_at,is_anonymous)
      VALUES(owner_id,lower(claims->>'email'),now(),false);
    INSERT INTO auth.identities(user_id,provider,provider_id,identity_data) VALUES(owner_id,'google',identity->>'userId',
      jsonb_build_object('sub',identity->>'userId','email',lower(claims->>'email'),'email_verified',true));
  END;
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
LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = pg_catalog AS $$ SELECT auth.uid() $$;
REVOKE ALL ON FUNCTION public.cognito_workspace_owner() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cognito_workspace_owner() TO id;
COMMIT;
