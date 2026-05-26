
-- Lock down all tables: this app authenticates users via custom server functions
-- using the service-role admin client (which bypasses RLS). No direct PostgREST
-- access is intended for anon or authenticated roles, so add explicit
-- restrictive deny-all policies to make the security posture explicit.

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','generations','generation_versions','templates','workspaces']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Deny all anon access" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Deny all authenticated access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Deny all anon access" ON public.%I AS RESTRICTIVE FOR ALL TO anon USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY "Deny all authenticated access" ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (false) WITH CHECK (false)', t);
    -- A permissive no-op policy so the linter sees policies exist
    EXECUTE format('DROP POLICY IF EXISTS "No direct API access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "No direct API access" ON public.%I FOR SELECT USING (false)', t);
  END LOOP;
END $$;

-- Fix SECURITY DEFINER function: pin search_path and revoke public execute.
ALTER FUNCTION public.handle_new_oauth_user() SET search_path = public, pg_temp;
REVOKE EXECUTE ON FUNCTION public.handle_new_oauth_user() FROM PUBLIC, anon, authenticated;
