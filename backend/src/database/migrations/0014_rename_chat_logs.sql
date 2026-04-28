-- up:
ALTER TABLE chat_logs RENAME TO agent_chat_logs;
CREATE OR REPLACE VIEW chat_logs AS SELECT * FROM agent_chat_logs;

-- down:
DROP VIEW IF EXISTS chat_logs;
ALTER TABLE agent_chat_logs RENAME TO chat_logs;
