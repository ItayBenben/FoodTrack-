-- Runs once on first container start (docker-entrypoint-initdb.d), as the bootstrap superuser.
-- Creates the two roles the app uses. Passwords come from the environment via 00-roles.sh.
\set ON_ERROR_STOP on
SELECT format('CREATE ROLE foodtrack LOGIN PASSWORD %L NOSUPERUSER NOCREATEROLE NOBYPASSRLS', :'owner_pw') \gexec
SELECT format('CREATE ROLE foodtrack_app LOGIN PASSWORD %L NOSUPERUSER NOCREATEROLE NOBYPASSRLS', :'app_pw') \gexec
CREATE DATABASE foodtrack OWNER foodtrack;
\connect foodtrack
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
ALTER SCHEMA public OWNER TO foodtrack;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO foodtrack_app;
ALTER DEFAULT PRIVILEGES FOR ROLE foodtrack IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO foodtrack_app;
ALTER DEFAULT PRIVILEGES FOR ROLE foodtrack IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO foodtrack_app;
