-- Friend challenges: async 1v1 quiz competition. Two friends each attempt the
-- same locked problem set independently (own account, own device, no earlier
-- than scheduled_at), then see a head-to-head result once both submit.
--
-- problem_ids is locked at creation time (a fixed array of `problems.id`
-- values, source='sat', scoped to one subtopic) so both sides get identical
-- questions without depending on the AI-generation pipeline.
--
-- RLS is enabled with no policies, matching the existing friendships/users
-- convention (see 20260514_enable_rls_all_tables.sql) — access control is
-- enforced entirely in API route handlers via the service-role client, not
-- via auth.uid()-scoped policies.

CREATE TYPE challenge_status AS ENUM ('pending', 'declined', 'scheduled', 'expired', 'completed');

CREATE TABLE quiz_challenges (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opponent_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subtopic_id    uuid NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  question_count integer NOT NULL CHECK (question_count IN (5, 10, 15)),
  problem_ids    jsonb NOT NULL,
  scheduled_at   timestamptz NOT NULL,
  status         challenge_status NOT NULL DEFAULT 'pending',
  winner_id      uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE quiz_challenge_attempts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id         uuid NOT NULL REFERENCES quiz_challenges(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  answers              jsonb,
  score                integer,
  time_elapsed_seconds integer,
  submitted_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (challenge_id, user_id)
);

CREATE INDEX quiz_challenges_opponent_status_idx ON quiz_challenges (opponent_id, status);
CREATE INDEX quiz_challenges_challenger_status_idx ON quiz_challenges (challenger_id, status);
CREATE INDEX quiz_challenge_attempts_challenge_idx ON quiz_challenge_attempts (challenge_id);

ALTER TABLE quiz_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_challenge_attempts ENABLE ROW LEVEL SECURITY;
