-- PostgreSQL runs this only when initializing an empty data volume.
\getenv rest_password REST_DB_PASSWORD
\getenv auth_password AUTH_DB_PASSWORD
ALTER ROLE authenticator PASSWORD :'rest_password';
ALTER ROLE supabase_auth_admin PASSWORD :'auth_password';
-- This site uses only anonymous and signed-in PostgREST requests.
REVOKE service_role, supabase_admin FROM authenticator;
