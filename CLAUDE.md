# Athena POV — Dev Guidelines

## Stack
- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Database:** Supabase (PostgreSQL) — direct client in `src/lib/supabase/client.ts`, queries in `src/lib/db/queries/`
- **Auth:** Clerk (`@clerk/nextjs`) + webhook sync via Svix
- **Data fetching:** `@tanstack/react-query` for all client reads/writes
- **AI:** Anthropic SDK
- **Rendering:** Framer Motion (animations), Recharts (charts), KaTeX + remark-math (math), react-markdown
- **Toasts:** Sonner
- **Agents backend:** Python FastAPI + Agno framework in `agents/` (port 8080)

## Data Layer

No Drizzle ORM — all DB access goes through Supabase client. Migrations use Supabase CLI (not Drizzle Kit).

### Key tables (17 total)
`users`, `sessions`, `schedules`, `user_preferences`, `topics`, `subtopics`, `lessons`, `problems`, `quiz_sessions`, `quiz_answers`, `micro_lessons`, `tutor_lesson_plans`, `custom_topics`, `custom_tutor_lesson_plans`, `learning_queue`, `onboarding_progress`, `friendships`

### Query modules (`src/lib/db/queries/`)
`users`, `dashboard`, `progress`, `profile`, `lessons`, `learning-queue`, `schedules`, `quiz`, `sat-quiz`, `sessions`, `custom-learning`, `preferences`, `onboarding`

## Data Fetching — React Query

**All client-side API calls must use `useQuery` (reads) or `useMutation` (writes).** No raw `useState`/`useEffect`/`fetch` for API data.

### Patterns
```tsx
// Read
const { data, isLoading, isError } = useQuery({
  queryKey: ["key"],
  queryFn: () => fetch("/api/endpoint").then(r => { if (!r.ok) throw new Error("Failed"); return r.json(); }),
  staleTime: 60_000,
});
useEffect(() => { if (isError) toast.error("Failed to load ..."); }, [isError]);

// Conditional (auth-gated)
const { data: userData, loading: userLoading } = useCurrentUser();
const enabled = !userLoading && !!userData && userData.user.onboardingCompleted;
const { data } = useQuery({ queryKey: ["key"], queryFn: ..., enabled });
```

### Query keys
| Key | Endpoint | staleTime |
|---|---|---|
| `['user']` | `/api/user/me` | 5 min |
| `['dashboard']` | `/api/dashboard` | 1 min |
| `['learning']` | `/api/learning` | 10 min |
| `['progress']` | `/api/progress` | 1 min |
| `['profile']` | `/api/profile` | 2 min |

### QueryProvider
`src/components/providers/query-provider.tsx` — wraps app inside `<ThemeProvider>`. Defaults: `staleTime: 60_000`, `retry: 1`. DevTools included (dev only).

### SSE / streaming hooks — do NOT migrate to React Query
`use-athena-conversation.ts`, `use-micro-lesson.ts`, `use-generative-lesson.ts` — all use SSE, keep as-is.

## Research Convention

When working with a framework, library, or technology not already in this project's stack, first check https://directory.llmstxt.cloud/ for its `llms.txt` summary. Fetch and read the relevant entry to understand current APIs, patterns, and best practices before writing code. This avoids hallucinating outdated or incorrect usage.

## Conventions

- Hooks in `src/hooks/` (15+ hooks + `tangent/` subdir)
- Pages under `src/app/(protected)/`
- Components organized by feature: `dashboard/`, `learn/`, `learning/`, `lessons/`, `my-learning/`, `onboarding/`, `quiz/`, `tangent/`, `tutor/`, `whiteboard/`, `ui/`
- Providers: `theme-provider`, `query-provider`, `clarity-provider`
- Onboarding redirect: check `userData.user.onboardingCompleted` in `useEffect`, separate from query `enabled` flag
- Error handling: `useEffect` watching `isError` -> `toast.error(...)`
- Math rendering: use KaTeX via `remark-math` + `rehype-katex`
- **Whiteboard HTML content: never use `<foreignObject>`.** All HTML in whiteboard elements (math, callouts, tables, section headings — anything text-shaped) renders through the HTML overlay layer that sits as a sibling of the `<svg>` in `src/components/whiteboard/whiteboard-canvas.tsx` — positioned absolutely in viewport-pixel space and CSS-scaled via `canvasScale`. Safari/WebKit paints `foreignObject` HTML at a y position that diverges from its `getBoundingClientRect` under SVG transforms, causing rows to overlap; KaTeX-laden content inside `foreignObject` also produces per-frame rect jitter that can feed measurement effects (e.g. the `setDistributionArrows` loop) into a "Maximum update depth" cycle during scrubber drags. wb-math is the canonical example (commit `ff4aebc`); wb-callout, wb-section-heading, and wb-table follow the same pattern. The SVG-side step `switch` in whiteboard-canvas returns `null` for these action types; a sibling overlay block does the rendering.

## Micro-lesson UX rules

These are the working rules of the micro-lesson interaction surface. Behavior here is opinionated — re-deriving from code can lose the intent.

- **Hints surface via TTS + orb caption, never as canvas callouts.** First-wrong inline hints (in-lesson `check_in` / `predict` / `fill_blank` AND practice problems) play through `playNarration()` and display under the floating orb via the `transientCaption` pill. The synthesized callout-step arrays (`hintCalloutSteps`, `practiceHintCalloutSteps` in `micro-lesson.tsx`) are intentionally empty; downstream wiring still references them as no-ops.
- **Tutor takeover fires on the 2nd wrong** (or sooner if force-reveal would already have triggered — e.g. a 2-option predict). Gating: `wrongCount >= 2 || willForceReveal` for check_in / predict, `newAttempts >= 2` for fill_blank. The 1st wrong shows the inline hint and keeps the wrong-selection state visible. There is no longer a "hint" mode of takeover — `TakeoverContext.mode` was removed. **"Got it" always advances** the lesson + marks not-correct. The **SAT quiz per-problem page** (`src/components/learning/quiz/quiz-problem-page.tsx`) uses the same in-place takeover pattern on its 2nd wrong — replacing the old StuckModal-then-route-to-`/quiz/[N]/tutor` escalation — wired to `/api/agent/quiz-chat/stream` via `useLessonChat({ variant: "quiz" })`.
- **Substitute morph dynamic padding.** In `wb-math.tsx`, the `applySubPadding` helper pads val spans **only when var would overflow past a same-line neighbor**: `overshoot = (varW - valW) - existingGap`, pad if `overshoot > 3px`, by `overshoot + 4px buffer`. `findNextVisualNeighbor` walks up to 4 ancestors looking for a same-line non-empty sibling — same-line guard (mid-y within 60% of line-height) prevents grabbing a neighbor on a different equation row. Skip cases: no same-line neighbor (val is last on line, harmless overflow), delta below threshold, native math-spacing absorbs the delta. Runs from both the render effect (atomic with `katex.render`) and the setup effect (idempotent via strip-before-measure). Padding holds through the morph; after the LAST pair arrives + 500ms dwell, it animates to 0 over 450ms — once per step, never per-pair. Triggered via `settledSteps` state in whiteboard-canvas (flyIn) or a setTimeout in the setup effect (legacy substitutionAnimation).

## Lesson generation pipeline (agents)

- **c2-ir architecture (Phase G).** The model produces structured intent via tool-use schema; code in `agents/app/run_time/sat/micro_lesson_agent.py` generates the LaTeX with deterministic `\htmlClass{op-target|op-new|op-result|op-cancel}{...}` role tagging. Default to extending the IR + renderer rather than asking the model to author more LaTeX.
- **Production env vars on the agents service:** `MICROLESSON_PROMPT_VARIANT=c2-ir`, `MICROLESSON_TOOL_USE=1`, `MICROLESSON_SELF_CRITIQUE=1`. All three are required as a set — the c2-ir prompt is authored for the structured-output schema, so tool-use must be on or the model falls back to prose emission and emits malformed steps. The collapse pass runs automatically inside the IR path (no flag). See `agents/.env.example`.
- **Self-critique pass (Phase E.5)** is gated behind `MICROLESSON_SELF_CRITIQUE=1`. The model reviews its own draft before render and rewrites violating steps in place; the deterministic collapse pass runs immediately after.
- **Near-duplicate collapse** runs deterministically after critique in the IR path (`_collapse_near_duplicate_steps` in `agents/app/run_time/sat/micro_lesson_agent.py`). Adjacent `write_math` steps whose normalized LaTeX matches (after stripping `\htmlClass{...}{...}`, `\textcolor{...}{...}`, and whitespace) are collapsed into one — the kept step's narration absorbs the dropped step's narration in order, so no pedagogical content is lost. Pairs sharing the same `operationGroupId` are exempt (those are intentional triplet morphs). The eval's `nearDuplicateSteps` metric in `src/lib/evals/adherence.ts` flags any duplicates that survive; the accept gate fails on strong duplicates or 2+ weak (bigram-Jaccard ≥ 0.92) pairs.
- **Evaluator** (`src/lib/evals/`) scores generated lessons against an ideal lesson reference (`src/lib/evals/ideal-lessons/`) using adherence + sympy-based math fidelity / equivalence checks. The flagged-issue sidebar in `/dev/lessons` triages eval rejects.

---

## Route Structure

### Public
- `/` — Landing page
- `/sign-in`, `/sign-up` — Clerk auth

### Protected (`src/app/(protected)/`)
- `/dashboard` — Mode picker (Lesson / Practice / Chat) → topic/subtopic selection; subject filter; subtopic rows expose Podcast / Infographic / Flashcards CTAs. This is the post-auth landing (the old gamified quest/streak/leaderboard dashboard was removed; `/play` was folded in here).
- `/profile` — Hero profile, quest stats, tier progression, schedule editor
- `/queue`, `/queue/[lessonId]` — Learning queue / progress
- `/mentor` — AI mentor interface (open chat, whiteboard answers, voice, image attach)

> **No onboarding flow in the main app.** `/onboarding/*` and `/tangent/*` were removed — new users land on `/dashboard`. The positioning flow lives on again under the SAT brand surface at `/sat/onboarding` (see "SAT brand surface" below).

**Learning hub:**
- `/learning` — Browse topics
- `/learning/[topicSlug]` — Topic overview
- `/learning/[topicSlug]/[subtopicSlug]` — Subtopic overview
- `/learning/[topicSlug]/[subtopicSlug]/micro-lesson` — AI whiteboard lesson
- `/learning/[topicSlug]/[subtopicSlug]/micro-lesson/post-learning` — Post-lesson practice

**Quiz** (`quiz/layout.tsx` provides `QuizRouteContext`):
- `/learning/[topicSlug]/[subtopicSlug]/quiz/[problemNumber]` — Full-screen SAT problem
- `/learning/[topicSlug]/[subtopicSlug]/quiz/[problemNumber]/tutor` — AI tutor + practice loop

**Full SAT practice test:**
- `/full-sat`, `/full-sat/[attemptId]` (+ `/[questionNumber]`, `/break`, `/results`) — timed multi-section full test, 400–1600 scoring, resume + attempt history

**Daily Quest** (present, not in primary nav):
- `/quest/[problemNumber]` (+ `/tutor`) — single daily problem with streak/XP/tier

**My Learning:**
- `/my-learning` — Free-form topic search/creation
- `/my-learning/[topicId]` — Generated content
- `/my-learning/[topicId]/micro-lesson` + `/post-learning` — AI whiteboard + practice
- `/my-learning/[topicId]/quiz/[problemNumber]` + `/tutor` — Custom quiz flow

**Personalized / specialized practice:**
- `/personalized`, `/personalized/quiz/[problemNumber]` — paste a lesson plan → classifier → existing SAT problems in the quiz UI (ephemeral, no DB writes); also the target of the post-lesson "Practice weak areas" CTA

**Alternative content modes** (entry from `/dashboard` subtopic rows):
- `/flashcards/[topicSlug]/[subtopicSlug]` — streamed SAT cards, Avery 8-up PDF
- `/podcast/[subtopicId]` — 2-host AI dialogue, per-line ElevenLabs
- `/infographic/[subtopicId]` — AI poster (Claude brief → image model)

**Dev / internal (not student-facing; gated/404 in prod):**
- `/dev/*` (lessons, stories, compare, fly, lesson-intros) — eval + lesson dev surfaces
- `/studio/*` — agent configuration/admin (agents, prompts, deployments, archetypes, sessions, student admin)

### API Routes (~47 endpoints)
- **Auth/User:** `/api/user/{me,sync}`, `/api/webhooks/clerk`
- **Core data:** `/api/dashboard`, `/api/profile`, `/api/progress`, `/api/schedule`, `/api/learning-queue`
- **Learning:** `/api/learning`, `/api/learning/[topicSlug]/[subtopicSlug]/{route,practice-problems,micro-lesson,tutor-lesson-plan}`
- **My Learning:** `/api/my-learning/topics/[topicId]/{route,practice-problems,tutor-lesson-plan}`, `/api/my-learning/lesson/{stream,chat/stream}`, `/api/my-learning/quiz/{submit,quiz-chat/stream}`
- **Quiz:** `/api/quiz/{questions,attempt,complete}`, `/api/sat-quiz/submit`
- **AI Agents:** `/api/agent/{chat/stream,quiz-chat/stream,micro-lesson/stream,practice-problems,text-to-speech,speech-to-text}`
- **Tutor:** `/api/tutor/{plan,scene,beat,evaluate,tts-with-timestamps}`
- **Educators:** `/api/educators/{assignments,assignments/[id],assignments/[id]/submit,students,students/[id],submissions,grade,simulate,reports,practice-problems,homework/stream,chat/stream}` — `GET assignments/[id]` and `POST assignments/[id]/submit` are public (student share link); everything else Clerk-gated
- **Other:** `/api/health`, `/api/friends/invite`, `/api/reports/*` (student PDF report), full-SAT + quest endpoints

### Educators surface (`/educators`)

Teacher-facing port of the Lovable "Athena for Teachers" prototype — same product, more serious tone. Brand may split later, so it is deliberately self-contained:

- Routes: `/educators` (public landing) → `(teacher)` group `/educators/{homework,grading,students}` (Clerk-gated shell with HUD pill nav) + `/educators/a/[id]` (public student view + submit via unguessable share link) + `/educators/print/[id]` (Clerk-gated light print/PDF worksheet; Name/Date lines render at print time; answer-key page toggleable). `/educators/calendar` and `/educators/reports` are redirects — calendar is now a view toggle inside Homework (day-click creates with due date prefilled), reports renamed to Students.
- Theme is scoped, never global: `.edu-theme` in `src/app/educators/educators.css` overrides `--background`/`--foreground`/etc. for the subtree (near-black HUD, JetBrains Mono micro-labels via `.font-mono-hud`, Instrument Serif wordmark via `.edu-serif`, `color-scheme: dark` for native date inputs). Long-form content (instructions, feedback, responses, chat) is sans; mono is HUD labels only. Overlay panels share `EduDrawer` (Escape-to-close, `role="dialog"`).
- Data: `educator_{students,assignments,submissions,parent_reports,classes}` tables (FK `teacher_id` → `users.id`, default-deny RLS). Assignments carry `answer_key` (teacher-only; the public endpoint never selects it) and optional `questions` jsonb (practice sets pulled from the `problems` bank via `/api/educators/practice-problems`; the public projection strips `correctIndex`/`explanation`). Submissions carry `simulated`, `answers`, and `images` jsonb. Queries in `src/lib/db/queries/educators.ts`, hooks in `src/hooks/use-educators.ts` (keys `['educator', ...]`), shared helpers in `src/lib/educators.ts`.
- **Classes/sections are live.** `educator_classes` + nullable `class_id` FKs on students/assignments (`ON DELETE SET NULL` — deleting a class unassigns its work, never deletes it). A header `ClassSwitcher` (portaled to body so it clears the page stacking context; drawers still cover the header) filters Homework / Grading / Students by the selected class via `EduClassProvider` context (`src/components/educators/class-context.tsx`, persists across nav + localStorage, "All classes" default). Filtering is client-side (`inSelectedClass`) — small datasets, stable query keys. Zero classes = switcher hidden, surface behaves exactly as before. New homework/students default to the selected class; the editor + Students→Settings move items between classes. The switcher only renders class-dependent UI after the React Query class list loads, which is why lazy-init-from-localStorage doesn't cause a hydration mismatch.
- **Students do homework in a free Athena account.** The share view (`GET`) is public, but **submitting requires Clerk sign-in** — identity is the signed-in account's email matched against the assignment-teacher's roster (never a posted email; `POST submit` is now Clerk-gated). First submit links `educator_students.user_id` and calls `gateAccountAsHomeworkOnly` → sets `users.learning_access=false` **only when it was NULL** (brand-new accounts). **The homework/learning paywall boundary:** `learning_access` (TRUE/NULL = full access — all existing + consumer users are grandfathered TRUE; FALSE = homework-only). The `(protected)` layout is the single chokepoint: `learning_access===false` renders `LearningUpsell` instead of the app, so homework-funnel students can do homework (public share link) but the rich learning experience (lessons/tutor/full-SAT/etc.) is gated. Doing homework is always free; paying flips FALSE→TRUE (billing slice). Migration `20260615120000` (educator_students.user_id, educator_submissions.user_id, users.learning_access) — pending Studio apply.
- **The submit loop is real.** Students turn in work from the share link, identified by roster `student_email` (case-insensitive; unknown email → friendly "ask your teacher" 404). Submissions are typed text and/or up to 3 photos of handwritten work (client-side downscale to ≤1600px JPEG → base64 → private `educator-work` storage bucket, paths in `submissions.images`; teacher views via server-minted 1h signed URLs; resubmission deletes the old photo folder). Text homework → AI-graded only on explicit teacher action (no auto-grade on open; "Grade ungraded (N)" runs 4-wide; grading updates grade/feedback only — the student's response is never rewritten; photos ride along as base64 vision blocks; **the teacher's `answer_key` is passed as authoritative grading context** — without it the model grades neat-but-wrong work as correct). Practice sets → objective auto-grade at submit, no LLM. Resubmitting replaces work and clears the grade. "Simulate (demo)" is the only path that invents a response: explicit, amber SIMULATED badge, excluded from all stats/reports, refuses to overwrite real work (agent `/grade` requires `simulate=true` when there's no text/photo — 422 otherwise).
- Homework generation (`agents/app/educator/router.py` `homework/stream`, SSE `{token}` frames): output contract is title line → student content → `=== ANSWER KEY ===` → teacher-only key, split into separate columns at save (missing marker = no key, never a leak). Print-era headers ("Name: ___") are banned from generated content — the print route adds them.
- Editor: "Write with AI" + "From Athena's problem bank" modes; Edit (PATCH) and Reuse (prefilled copy) from homework rows; a class picker (when classes exist) sits next to the due date; generation is abortable (Stop / Start over / close all abort the stream).
- Parent "reports" are AI-written (agent `/educator/parent-report`: warm 3-5 sentence note grounded in the student's real period work; template fallback when the agent is down) and only log a row to `educator_parent_reports` (no email delivery yet) — UI copy says "logged", keep it honest. History is readable in the student detail drawer (`GET /api/educators/reports?studentId=`). Summaries count real (non-simulated) work within the month-to-date period only. The Students page shows real data exclusively — the mock sample roster is gone.

### SAT brand surface (`/sat`)

Standalone SAT positioning + progress-tracking brand (the April-2026 era experience resurrected, per the founder). Working brand name **"Ascent"** — one constant in `src/lib/sat/brand.ts`, swap there when the real name lands. Self-contained like `/educators` (scoped `.sat-theme` in `src/app/sat/sat.css` — keeps the app's light/dark base tokens, adds an indigo accent + serif wordmark), so it can split to its own domain later via a host rewrite.

- Routes: `/sat` (public landing) → `(app)` group `/sat/{dashboard,learn,progress}` (brand nav shell) + `/sat/onboarding/{,plan,quiz,schedule,complete}` (positioning flow, own minimal layout). All gated via `PROTECTED_PREFIXES` in `src/proxy.ts`; sign-in/up reuse the main auth pages with `?redirect_url=`.
- **Positioning flow** (restored from beb9d70ba, adapted Clerk → `getAuthIdentity`/`getAppUser`): plan intake wizard (writes `user_preferences`) → diagnostic quiz (`/api/quiz/{questions,attempt,complete}` over `problems` `source="onboarding"`, resumable via `onboarding_progress`, difficulty-weighted `users.skill_score`) → schedule (`/api/schedule` then `/api/onboarding/complete`, which flips `users.onboarding_completed`; the shared schedule route no longer does onboarding writes itself). `/api/user/me` again returns `{ user, onboarding }`; `useCurrentUser` types `onboardingCompleted`/`targetScore`/`onboarding`. Components in `src/components/sat/onboarding/`.
- **Dashboard** (`/sat/dashboard`): the old gamified dashboard page restored verbatim over the still-intact `/api/dashboard` + `src/components/dashboard/*` (rank card, daily quest, full-SAT card, streak, battle zones, companion, stats, friends leaderboard).
- **Progress** (`/sat/progress`): renders `ProgressView` (extracted from the `/queue` page — same component, `satOnly` filters skills/topic-mastery to math + reading-writing). `/queue` behavior unchanged.
- **Lessons/practice**: `/sat/learn` lists SAT-subject topics and launches the existing `/learning/.../micro-lesson` + `/quiz/1` routes with `?sat=1`.
- **`sat_focused` prompt flag**: `?sat=1` threads `satFocused` through `use-micro-lesson` / `use-lesson-chat` (quiz layout captures it once — per-problem navs drop the param but the layout persists) → `/api/agent/{micro-lesson/stream,micro-lesson/chat/stream,quiz-chat/stream}` forward `sat_focused` → agents request models. When set AND subject ∈ {math, reading-writing}, the agents restore the pre-generalization SAT personas ("seasoned SAT Math instructor", "Socratic SAT Math tutor", SAT-strategy lines) and the "SAT context:" prompt label; flag-off output is byte-identical to before, and general subjects never get SAT framing. Caveat: stored micro-lessons are shared per subtopic — a lesson generated from either surface serves both; only live generation + chat honor the flag.
- E2E: `e2e/sat-surface.spec.ts` (resets the test user's onboarding state, walks the whole positioning loop via API + UI).

---

## User Flows

### Learning & Quiz (primary path)
```
/dashboard -> /learning -> /learning/[topic]/[subtopic]
  -> (optional) micro-lesson -> post-learning practice -> back
  -> quiz -> /quiz/1
    Correct -> auto-advance (1.2s)
    Wrong -> feedback + retry; wrong twice -> "tutor" phase
      -> StuckModal -> /quiz/[N]/tutor (AI chat)
        Correct in tutor -> "practice" phase
          -> PracticeEntryModal -> QuizPracticeLoop (2 problems)
            Correct -> advance
            Wrong twice -> /micro-lesson
    All done -> submit -> ResultsScreen -> optional PostLessonPractice -> close
```

### Quiz state phases (per problem)
`question` -> `hint` (1 wrong) -> `tutor` (2 wrong) -> `practice` (correct in tutor)

### Slug convention
`_make_slug()` in `agents/content_workflow.py` strips spaces, parens, commas. Use it everywhere — never raw `.replace(" ", "-")`.

### Practice problems
Seeded via `agents/seed_all_practice_problems.py` into `practice_problems` table. API: `GET /api/learning/[topicSlug]/[subtopicSlug]/practice-problems?difficulty=...`

---

## Key Layouts & Context

| Layout | Provides |
|--------|----------|
| `src/app/layout.tsx` | ClerkProvider, ThemeProvider, QueryProvider, ClarityProvider, Toaster |
| `src/app/(protected)/layout.tsx` | TopNavWrapper |
| `quiz/layout.tsx` | `QuizRouteContext`: problems, state machine, timer, feedbackMap, lockedIds, modals, save-on-submit |

## Agents Backend (`agents/`)

Python FastAPI service (port 8080) using Agno framework + Claude Sonnet + GPT-4o-mini. Provides SSE streaming endpoints for tutoring, micro-lessons, quiz chat, practice problems, and custom learning. Uses Supabase. See `agents/README.md` for details.

## Utility Modules (`src/lib/`)
- `utils.ts` — General utilities
- `scoring.ts` — SAT/quiz scoring
- `schedule-utils.ts` — Schedule helpers
- `topic-icons.tsx` — Topic icon mapping
- `ranks.ts` — Ranking/progression
- `lesson-types.ts` — Lesson type definitions
- `supabase/client.ts` — Supabase initialization
- `tutor/generate-beats.ts`, `tutor/generate-lesson-plan.ts` — AI tutor generation
