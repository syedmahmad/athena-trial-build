/**
 * Build the `request_metadata` block that the Next.js proxy routes forward
 * to the agents service (`agents/main.py`). The FastAPI side maps it onto
 * `RequestMetadata` (see `agents/main.py`), which the SSE handlers convert
 * into `X-Majordomo-*` headers on the upstream LLM call. Result: each LLM
 * request is tagged in the Majordomo dashboard with the originating user,
 * topic, subtopic, and lesson id.
 *
 * All fields are optional — pass `null` when context isn't available.
 * The gateway drops null/empty entries before emitting headers, so missing
 * context simply doesn't get tagged (rather than getting tagged as "null").
 *
 * Per plan doc §7, `user_id` is the Clerk id (opaque, not PII). Do not
 * pass email, display name, or any other identifying string here.
 */
export type RequestMetadata = {
  user_id: string;
  topic: string | null;
  subtopic: string | null;
  lesson_id: string | null;
};

export function buildRequestMetadata(opts: {
  userId: string;
  topic?: string | null;
  subtopic?: string | null;
  lessonId?: string | null;
}): RequestMetadata {
  return {
    user_id: opts.userId,
    topic: opts.topic ?? null,
    subtopic: opts.subtopic ?? null,
    lesson_id: opts.lessonId ?? null,
  };
}
