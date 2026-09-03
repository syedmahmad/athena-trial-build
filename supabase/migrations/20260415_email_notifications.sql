-- Timezone on users for computing reminder windows
ALTER TABLE users ADD COLUMN timezone text NOT NULL DEFAULT 'America/New_York';

-- Track whether a session reminder was already sent
ALTER TABLE sessions ADD COLUMN reminder_sent_at timestamptz;

-- Index for cron: find today's unsent reminders efficiently
CREATE INDEX idx_sessions_reminder_pending
  ON sessions (scheduled_date, status)
  WHERE reminder_sent_at IS NULL;
