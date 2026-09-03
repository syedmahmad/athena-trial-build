# Athena POV — Agents Service

Python backend providing AI agents, content generation pipelines, and a streaming HTTP/SSE API. Runs on FastAPI at port 8080 and serves the Next.js frontend.

---

## Table of Contents

- [Stack](#stack)
- [Directory Structure](#directory-structure)
- [Setup](#setup)
- [Running the Server](#running-the-server)
- [API Endpoints](#api-endpoints)
- [CLI Commands](#cli-commands)
- [Pre-Generation Pipeline](#pre-generation-pipeline)
- [Runtime Agents](#runtime-agents)
- [Database Layer](#database-layer)
- [Streaming Protocol](#streaming-protocol)
- [Key Conventions](#key-conventions)

---

## Stack

| Package | Purpose |
|---------|---------|
| `fastapi` + `uvicorn` | HTTP/SSE server |
| `agno` | Agent framework (wraps OpenAI/Anthropic) |
| `anthropic` | Claude models (Sonnet 4, Sonnet 4-6) |
| `openai` | GPT-4o-mini (lesson follow-up Q&A) |
| `supabase` | Database client |
| `pydantic` | Schema validation |

Python 3.11+ required.

---

## Directory Structure

```
agents/
├── main.py                          # FastAPI server — all HTTP endpoints
├── pyproject.toml                   # Dependencies (Hatchling build)
├── Dockerfile
├── .env.example
│
├── cli/
│   └── main.py                      # Admin CLI (health, seed, generate)
│
└── app/
    ├── utils/
    │   └── db.py                    # Supabase ORM layer
    │
    ├── pre_generation/              # Offline content generation pipeline
    │   ├── content_workflow.py      # Orchestrates topic → subtopic → problems
    │   ├── generate_content.py      # CLI entry point for content_workflow
    │   ├── topic_generator.py       # Agent: topic metadata
    │   ├── subtopic_generator.py    # Agent: subtopic metadata
    │   ├── problem_generator.py     # Agent: SAT problems (batches of 10)
    │   ├── lesson_generator.py      # Legacy: lesson JSONB generation (unused)
    │   ├── practice_problem_seeder.py  # Agent: practice problems (parallel batches)
    │   ├── seed_practice_problems.py   # CLI: seed one topic/subtopic
    │   └── seed_all_practice_problems.py  # CLI: seed all topics/subtopics
    │
    └── run_time/
        ├── sat/                     # SAT-specific streaming agents
        │   ├── whiteboard_agent.py          # Shared whiteboard format spec
        │   ├── tutoring_agent.py            # Follow-up Q&A on lessons (GPT-4o-mini)
        │   ├── quiz_tutor_agent.py          # Socratic quiz guide (Claude Sonnet 4-6)
        │   └── micro_lesson_agent.py        # Structured lesson generation (Claude Sonnet 4-6)
        │
        └── dynamic/                 # Free-form agents for any subject
            ├── my_learning_generator.py          # Topic content + questions
            ├── my_learning_lesson_agent.py        # General lesson + follow-up Q&A
            └── my_learning_quiz_tutor_agent.py    # General Socratic quiz guide
```

---

## Setup

1. **Install dependencies**
   ```bash
   pip install -e .
   # or
   uv sync
   ```

2. **Configure environment** — copy `.env.example` to `.env` and fill in:
   ```
   SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   OPENAI_API_KEY=...
   ANTHROPIC_API_KEY=...
   ```

---

## Running the Server

```bash
python main.py
# Listens on http://0.0.0.0:8080
```

CORS is configured to allow `localhost:3000` (the Next.js dev server).

---

## API Endpoints

All streaming endpoints use **Server-Sent Events (SSE)**. See [Streaming Protocol](#streaming-protocol) for event format.

### SAT — Lessons

| Method | Endpoint | Agent | Description |
|--------|----------|-------|-------------|
| `POST` | `/micro-lesson/stream` | `micro_lesson_agent` | Generate a structured SAT micro-lesson |
| `POST` | `/micro-lesson/chat/stream` | `micro_lesson_chat_agent` | Follow-up Q&A on a lesson |
| `POST` | `/chat/stream` | `tutoring_agent` | General follow-up Q&A on lesson content |

### SAT — Quiz

| Method | Endpoint | Agent | Description |
|--------|----------|-------|-------------|
| `POST` | `/quiz-chat/stream` | `quiz_tutor_agent` | Socratic guidance for a quiz problem |

### SAT — Problems

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/practice-problems` | Generate on-demand practice problems |

### My Learning (Free-form)

| Method | Endpoint | Agent | Description |
|--------|----------|-------|-------------|
| `POST` | `/my-learning/generate` | `my_learning_generator` | Generate content for any topic |
| `POST` | `/my-learning/lesson/stream` | `my_learning_lesson_agent` | Lesson for any subject |
| `POST` | `/my-learning/lesson/chat/stream` | `my_learning_chat_agent` | Follow-up on a My Learning lesson |
| `POST` | `/my-learning/quiz-chat/stream` | `my_learning_quiz_tutor_agent` | Socratic guide for a My Learning quiz |

---

## CLI Commands

```bash
# Health check
python -m cli.main health

# Seed practice problems for a single topic/subtopic
python -m cli.main seed-practice-problems \
  --topic "Algebra" \
  --subtopic "Linear Equations (One Variable)" \
  --subject math \
  --count 60 \
  --subtopic-id <uuid>

# Run the full SAT content generation workflow
python -m cli.main generate-content [math|reading-writing|all]
```

### Standalone scripts

```bash
# Generate SAT content (topics, subtopics, problems)
python app/pre_generation/generate_content.py math
python app/pre_generation/generate_content.py reading-writing
python app/pre_generation/generate_content.py all

# Seed all practice problems
python app/pre_generation/seed_all_practice_problems.py \
  --subject all \          # math | reading-writing | all
  --count 60 \             # problems per subtopic (split evenly across difficulties)
  --parallelism 3 \        # concurrent subtopics
  --force                  # re-seed even if problems already exist
```

---

## Pre-Generation Pipeline

Runs offline to populate the database before users interact with the app. All operations are **idempotent** — existing records are skipped (upsert by natural keys).

### Content scope

**Math** (4 topics, 23 subtopics):
- Algebra — 5 subtopics
- Advanced Math — 5 subtopics
- Problem Solving and Data Analysis — 7 subtopics
- Geometry and Trigonometry — 6 subtopics

**Reading & Writing** (4 topics, 13 subtopics):
- Information and Ideas — 4 subtopics
- Craft and Structure — 3 subtopics
- Expression of Ideas — 2 subtopics
- Standard English Conventions — 4 subtopics

**Total:** ~2,920 SAT problems (40 per subtopic across 3 difficulty levels).

### Pipeline steps

```
content_workflow.py
  └─ Step 1: topic_generator.py
       Generates topic metadata (overview, objectives, SAT relevance, difficulty distribution, etc.)
       Model: claude-sonnet-4-20250514

  └─ Step 2: subtopic_generator.py
       Generates subtopic metadata (learning objectives, formulas, common mistakes, tips, etc.)
       Model: claude-sonnet-4-20250514

  └─ Step 3: problem_generator.py
       Generates 40 SAT problems per subtopic in batches of 10
       Rotates problem types (word problems, algebraic, data interpretation, multi-step, error traps)
       Retry logic: 3 attempts; JSON repair on malformed responses
       Model: claude-sonnet-4-6
```

### Practice problems

Separate from SAT problems. Seeded via `practice_problem_seeder.py`:
- Splits target count evenly across easy / medium / hard
- Up to 6 concurrent LLM batch calls per subtopic
- Tagged with `topic_slug` + `subtopic_slug` for querying

---

## Runtime Agents

Invoked per-request, stream responses back to the frontend.

### SAT Agents

#### `whiteboard_agent.py` — Shared format spec
Defines `WHITEBOARD_INSTRUCTIONS`: a system-prompt fragment appended to all SAT tutors. Specifies 9 whiteboard templates (algebra, geometry, cylinder, parabola, linear, inequality, table, circle, rectangle) and allowed actions:

- **Visual:** `write_math`, `write_text`, `highlight`, `coordinate_plane`, `geometry`, `number_line`, `table`
- **Interactive:** `predict` (2-3 option picker), `fill_blank` (typed input)

Elements stack vertically (no explicit coordinates). Supports `indentLevel` and `align` for layout. Includes a color-coded math system with `\textcolor{#hex}{...}` for variable highlighting (blue for unknowns, purple for coefficients, green for results, red for constants, amber for operations).

Whiteboard content is delimited in agent output by `<<<WHITEBOARD>>>`. The server parses this into separate SSE events.

#### `tutoring_agent.py` — Lesson follow-up Q&A
- **Model:** GPT-4o-mini
- **Role:** Answers follow-up questions about a completed lesson
- **Tone:** Focused, Socratic, respectful
- **Input:** `question`, `lesson_title`, `lesson_content`

#### `quiz_tutor_agent.py` — SAT quiz Socratic guide
- **Model:** Claude Sonnet 4-6
- **Role:** Guides a student through a quiz problem without revealing the answer
- **Rules:**
  - Never disclose the correct answer or option letter
  - Never reproduce solution steps verbatim
  - Ask 1-3 guiding sentences per turn
  - After 2-3 failed exchanges, surface the hint
  - After the hint, walk through only the first step conceptually
  - Whiteboard: highlight only the part the student should focus on, never the solution
- **Input:** `question`, `topic`, `subtopic`, `question_text`, `options`, `hint`, `solution_steps`, `correct_option`, `student_answer`, `history`

#### `micro_lesson_agent.py` — Interactive SAT micro-lesson
- **Model:** Claude Sonnet 4-6
- **Two agents:** lesson generator + follow-up chat
- **Generation pipeline (c2-ir, Phase G):** the model produces a structured IR via tool-use schema (`LessonOutputSchema` of `TripletUnit`s) rather than authoring LaTeX directly. Code (`_render_substitute_latex`, `_render_collapse_latex`, `_render_state_latex`, `_algebra_to_latex`) generates the LaTeX with deterministic `\htmlClass{op-target|op-new|op-result|op-cancel|dist-src}{...}` role tagging. `_flatten_units_to_steps` flattens the IR back into the streaming JSON Lines step format. **Default to extending the IR + renderer rather than asking the model to write LaTeX.**
- **Production stack — required env vars:** `MICROLESSON_PROMPT_VARIANT=c2-ir`, `MICROLESSON_TOOL_USE=1`, `MICROLESSON_SELF_CRITIQUE=1`. The c2-ir prompt is authored for the structured-output schema, so tool-use must be on; without it the model falls back to prose emission and produces malformed steps. See `.env.example`.
- **Mentor solve path (`MENTOR_TOOL_USE=1`):** the `/mentor` chat reuses this same IR machinery. A per-turn intent gate (Haiku, `mentor-intent`) routes "solve/simplify/factor this equation" turns through `MentorSolveOutput` (a `reply_text` + a `units` list of `TripletUnit`/`StepUnit`/`InteractionUnit`) → `_flatten_units_to_steps`, so they render as triplet morphs. All other turns (motivation, progress, concepts, refusals, image-first confirm) and any structured failure fall back to the unchanged prose stream. Flag off → mentor stays prose-only. See `mentor_agent.py` (`ask_mentor_stream`, `_classify_solve_intent`, `_render_mentor_solve`).
- **Self-critique pass (Phase E.5):** gated behind `MICROLESSON_SELF_CRITIQUE=1`. The model reviews its own draft before render and rewrites violating steps in place. Roughly time-neutral on average — trades latency for adherence quality.
- **Near-duplicate collapse:** runs deterministically after critique inside the IR path (no flag). Adjacent `write_math` steps whose normalized LaTeX matches (after stripping `\htmlClass{...}` / `\textcolor{...}` / whitespace) are merged into one; the kept step's narration absorbs the dropped step's narration in order. Pairs sharing an `operationGroupId` are exempt (those are intentional triplet phase morphs). Mirrors the eval's `nearDuplicateSteps` metric in `src/lib/evals/adherence.ts`.
- **Output:** No markdown — outputs ONLY `<<<WHITEBOARD>>>` followed by JSON Lines whiteboard steps
- **Structure:** 3 sections, 20-25 total steps. Each section follows a strict 3-phase pattern:
  1. **TEACH** (4-6 teaching steps) — Rich visuals: `write_math`, `coordinate_plane`, `geometry`, `highlight`, `number_line`, `table`. Auto-advances with narration.
  2. **VERIFY** (1 `predict` or `fill_blank`) — Easy question; answer is visible on the board
  3. **ASSESS** (1 `check_in`) — Harder 4-option MCQ with a NEW visual the student hasn't seen
- **Step types:**
  - `teaching` — Auto-advancing visual step (~75% of lesson)
  - `predict` — Student picks from 2-3 options (wrong options are disabled, hint shown)
  - `fill_blank` — Student types a value (3 attempts: hint → detailedHint → answer revealed)
  - `check_in` — 4-option MCQ with progressive scaffolding (hint → detailedHint → answer)
- **Dual text fields:** Every step has `narration` (plain English for TTS) and `displayText` (KaTeX-formatted for screen)
- **Core pillars:** Socratic (guide discovery, don't declare), Visuals (every concept drawn), Gradient (progressive scaffolding on wrong answers)
- **Tone:** Professional, direct, no cheerleading
- **Math:** Color-coded LaTeX with `\textcolor{}` (blue unknowns, purple coefficients, green results)

### Dynamic Agents (My Learning)

#### `my_learning_generator.py` — Free-form topic content
- **Model:** Claude Sonnet 4-6
- **Purpose:** Generates a complete learning package for any topic (not SAT-specific)
- **Output schema:**
  - `description`
  - `learningObjectives` (4+)
  - `tipsAndTricks` (3+)
  - `commonMistakes` (2+ with mistake / correction / why)
  - `questions` (exactly 10; 3 easy, 4 medium, 3 hard)
- **Retry:** 3 attempts with JSON extraction + repair

#### `my_learning_lesson_agent.py` — General lesson
- **Model:** Claude Sonnet 4-6
- **Two agents:** lesson generator + follow-up chat
- **Subjects:** History, science, literature, math, economics, etc.
- **Structure (mandatory `##` markdown):**
  - Overview → Core Concepts → Example → Common Misconceptions → Key Takeaway
- **Whiteboard:** Selective — only when genuinely clearer than text
- **Duration:** Readable in under 3 minutes

#### `my_learning_quiz_tutor_agent.py` — General Socratic guide
- **Model:** Claude Sonnet 4-6
- **Same Socratic rules as `quiz_tutor_agent.py`** but subject-agnostic (history, science, literature, etc.)

---

## Database Layer

`app/utils/db.py` wraps the Supabase client with typed helper functions.

### Tables

| Table | Key | Description |
|-------|-----|-------------|
| `topics` | `slug` | Topic metadata |
| `subtopics` | `(topic_id, slug)` | Subtopic metadata |
| `sat_problems` | `(subtopic_id, order_index)` | SAT quiz problems |
| `practice_problems` | `(topic_slug, subtopic_slug, order_index)` | Practice-only problems |

### Key functions

```python
# Reads
get_topic_by_slug(slug)
get_subtopic(topic_id, slug)
get_problem_count(subtopic_id)
get_practice_problem_count(topic_slug, subtopic_slug)

# Writes (all idempotent)
save_topic(data)
save_subtopic(data)
save_problems(subtopic_id, problems)
save_practice_problems(topic_slug, subtopic_slug, problems)
```

---

## Streaming Protocol

Streaming endpoints emit **Server-Sent Events**. Each event is a JSON object on a `data:` line.

### Event types

| Field | Description |
|-------|-------------|
| `token` | Plain text chunk to append to the lesson/response |
| `wb_step` | Parsed whiteboard step object (from after `<<<WHITEBOARD>>>`) |
| `[DONE]` | Stream complete marker |

### Whiteboard delimiter

Agents that support the whiteboard embed their visual content after `<<<WHITEBOARD>>>` in their response. `main.py` splits on this delimiter and emits each line as a separate `wb_step` event, keeping text and visuals as separate SSE streams.

---

## Key Conventions

### Slug generation

```python
def _make_slug(name: str) -> str:
    return name.lower().replace(" ", "-").replace("(", "").replace(")", "").replace(",", "")
```

Used everywhere slugs are derived from display names. Never use raw `.replace(" ", "-")`.

### Models in use

| Model | Used for |
|-------|---------|
| `claude-sonnet-4-20250514` | Topic and subtopic generation (pre-generation) |
| `claude-sonnet-4-6` | Problems, lessons, quiz tutors, dynamic agents |
| `gpt-4o-mini` | SAT lesson follow-up Q&A (`tutoring_agent.py`) |

### Writing style enforced in prompts

- No em-dashes (`—`) — use hyphens or rephrase
- LaTeX for all math expressions
- No exclamation marks or patronizing language
- Professional, direct tone

### JSON repair

`problem_generator.py` and `my_learning_generator.py` include fallback logic to extract and repair truncated JSON from LLM responses before retrying.
