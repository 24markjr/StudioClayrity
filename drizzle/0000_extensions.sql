-- Extensions required by later migrations.
-- pg_trgm: fuzzy product-name search (typo tolerance).
-- pgcrypto: gen_random_uuid() on older Postgres versions (built in from 13+, harmless otherwise).
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;
