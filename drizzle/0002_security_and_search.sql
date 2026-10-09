-- Row Level Security as defence in depth.
--
-- The app talks to Postgres only from server code, as the table owner, which bypasses RLS.
-- Enabling RLS with no policies means Supabase's public Data API roles (anon, authenticated)
-- can read or write nothing, even if an API key leaks. Any new table must also enable RLS —
-- tests/integration/schema.test.ts fails otherwise.
DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;--> statement-breakpoint

-- On Supabase, also remove the default grants to the API roles. Skipped on plain Postgres.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  END IF;
END $$;
