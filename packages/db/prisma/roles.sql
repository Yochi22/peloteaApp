-- ─────────────────────────────────────────────────────────────────────────
-- Roles de Postgres de privilegio mínimo para Pelotea.
-- Correr UNA VEZ como superusuario al aprovisionar la base, luego usar
-- `pelotea_app` en el DATABASE_URL de la app y `pelotea_migrator` solo en CI
-- / despliegue para `prisma migrate deploy`. Nunca uses el superusuario en
-- runtime (SECURITY.md §2.1).
-- ─────────────────────────────────────────────────────────────────────────

-- Rol de la aplicación en runtime: lee/escribe filas, NO puede crear ni
-- borrar tablas, NO puede crear otros roles.
CREATE ROLE pelotea_app LOGIN PASSWORD 'CAMBIA_ESTA_CONTRASEÑA' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE pelotea TO pelotea_app;
GRANT USAGE ON SCHEMA public TO pelotea_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO pelotea_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO pelotea_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pelotea_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO pelotea_app;

-- Límite de conexiones simultáneas del rol de app: una fuga de conexiones o
-- un pico de tráfico no puede agotar TODO Postgres.
ALTER ROLE pelotea_app CONNECTION LIMIT 20;

-- Rol para migraciones (solo en el pipeline de despliegue, nunca en runtime
-- de la app web/worker): puede crear/alterar tablas.
CREATE ROLE pelotea_migrator LOGIN PASSWORD 'CAMBIA_ESTA_OTRA_CONTRASEÑA' NOSUPERUSER CREATEDB NOCREATEROLE;
GRANT ALL PRIVILEGES ON DATABASE pelotea TO pelotea_migrator;
GRANT ALL PRIVILEGES ON SCHEMA public TO pelotea_migrator;

-- Statement timeout por defecto para el rol de app: una query colgada no
-- bloquea conexiones para siempre (defensa adicional contra DoS de capa DB).
ALTER ROLE pelotea_app SET statement_timeout = '15s';
ALTER ROLE pelotea_app SET idle_in_transaction_session_timeout = '30s';
