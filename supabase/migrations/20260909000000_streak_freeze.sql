-- Streak freeze: one-time recovery token so missing a single day doesn't
-- break a student's streak outright (a well-known churn moment). The
-- streak itself is never stored — it's derived fresh from daily_quests
-- completion history (see getDashboardData) by walking backward for
-- consecutive calendar days. Freezing it means the gap-detection walk
-- needs to know "this specific missed date doesn't count" — hence a
-- date, not just a boolean, so recalculating the streak on every load
-- stays a pure function of stored state rather than needing its own
-- write.
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_freeze_available boolean DEFAULT true NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_freeze_used_date date;
