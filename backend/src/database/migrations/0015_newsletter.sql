-- up:
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id BIGSERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  source TEXT,
  confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  subscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  unsubscribed_at TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);

-- down:
DROP INDEX IF EXISTS idx_newsletter_email;
DROP TABLE IF EXISTS newsletter_subscribers;
