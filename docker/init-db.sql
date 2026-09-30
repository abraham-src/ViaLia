-- Runs once, on the first start of an empty Postgres volume.
-- The postgis/postgis image already enables PostGIS in POSTGRES_DB; this makes it
-- explicit and idempotent. Schema objects are created by Prisma migrations, not here.
CREATE EXTENSION IF NOT EXISTS postgis;
