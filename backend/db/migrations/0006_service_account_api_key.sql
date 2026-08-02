-- 0002_service_account_api_key.sql
-- Service-account API-key authentication for service-to-service access
-- (e.g. the Odysseus MCP "FII Factory REST Bridge" reading FII backend REST).
--
-- Adds an optional, indexed api_key_hash column to the users table. When
-- non-null, the user may authenticate via the X-API-Key header (handled by
-- ApiKeyAuthHandler) in addition to JWT/cookie login.
--
-- The stored value is the lowercase SHA-256 hex digest of an opaque API key
-- (see ApiKeySecret). The raw key is never persisted and is returned to the
-- operator only once when a service account is created/rotated via
-- POST api/users/service-account.

ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key_hash VARCHAR(64);

CREATE INDEX IF NOT EXISTS idx_users_api_key_hash
    ON users (api_key_hash)
    WHERE api_key_hash IS NOT NULL;
