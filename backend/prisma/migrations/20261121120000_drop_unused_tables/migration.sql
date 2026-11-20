-- Drops three tables that nothing writes to any more (all empty on production when this was written):
--   api_request_logs  superseded by merchant_api_request_logs
--   api_keys          the old per-user API keys, superseded by merchant_api_keys
--   supported_tokens  never used by any code
-- api_request_logs has a foreign key to api_keys, so it goes first.

-- DropTable
DROP TABLE IF EXISTS "api_request_logs";

-- DropTable
DROP TABLE IF EXISTS "api_keys";

-- DropTable
DROP TABLE IF EXISTS "supported_tokens";
