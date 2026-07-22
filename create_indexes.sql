-- Critical Performance Indexes for Zetora
-- Using correct database column names from Drizzle schema

-- 1. MESSAGE USAGE - Most critical (user_id + date range queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_usage_user_date
ON message_usage(user_id, date);

-- 4. USER EMAIL - Critical (auth session lookups)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_email
ON "user"(email);

-- 5. CHAT USER QUERIES - Important (chat history)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_user_created
ON chat("userId", created_at DESC);

-- 6. MESSAGE CHAT QUERIES - Important (message loading)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_chat_created
ON message(chat_id, created_at ASC);

-- 7. SESSION TOKEN - Auth performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_token
ON session(token);

-- 8. SESSION USER - Auth performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_user_id
ON session(user_id);

-- 9. SESSION TOKEN LOOKUP - Critical for auth performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_token_expires
ON session(token, expires_at);

-- 10. SESSION ACTIVE LOOKUP - Fast active session checks
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_session_active
ON session(token, expires_at, user_id);

-- 11. USER ID LOOKUP - Speed up user table access
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_id
ON "user"(id);

-- 12. MESSAGE USAGE TODAY - Optimize daily usage lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_usage_today
ON message_usage(user_id, date DESC, message_count);

-- 16. LOOKOUT USER QUERIES - User's scheduled searches
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lookout_user_status
ON lookout(user_id, status);

-- 17. LOOKOUT SCHEDULING - Next run scheduling
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lookout_next_run
ON lookout(next_run_at, status);

-- 18. CUSTOM INSTRUCTIONS USER - User's custom instructions
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_custom_instructions_user
ON custom_instructions(user_id);

-- 19. ACCOUNT USER LOOKUP - Account linking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_account_user_id
ON account(user_id);

-- 20. ACCOUNT PROVIDER LOOKUP - Provider account lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_account_provider
ON account(provider_id, account_id);

-- 21. VERIFICATION IDENTIFIER - Email verification lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_verification_identifier
ON verification(identifier, expires_at);

-- 22. STREAM CHAT LOOKUP - Stream queries by chat
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_stream_chat_created
ON stream("chatId", "createdAt" DESC);

-- 25. LOOKOUT LAST RUN - Recently run lookouts
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_lookout_last_run
ON lookout(last_run_at DESC) WHERE last_run_at IS NOT NULL;

-- 26. MESSAGE ROLE FILTER - Filter messages by role
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_message_role_created
ON message(role, created_at DESC);

-- Optional: Clean up old usage data to improve performance
-- DELETE FROM message_usage WHERE date < NOW() - INTERVAL '7 days';
