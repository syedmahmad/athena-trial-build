"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Sparkles,
  Loader2,
  X,
  ArrowLeft,
  Wand2,
  CalendarRange,
  BookOpen,
  FileText,
  Lightbulb,
  Calculator,
  Gamepad2,
  Hammer,
  Shapes,
  ListOrdered,
  Trophy,
  KeyRound,
  Library,
  RefreshCw,
  CheckCircle2,
  PenLine,
  Paperclip,
  Image as ImageIcon,
  File as FileIcon,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import {
  useCreateAssignment,
  useUpdateAssignment,
  type AssignmentQuestion,
  type EducatorAssignment,
} from "@/hooks/use-educators";
import { useEscapeClose } from "@/components/educators/edu-drawer";
import { useEduClass } from "@/components/educators/class-context";
import {
  addDays,
  ymd,
  OPTION_LETTERS,
  assembleAnswerKey,
  isFreeResponseQuiz,
  type FreeResponseQuestion,
  type QuizQuestion,
} from "@/lib/educators";
import { downscaleImageToJpeg, fileToBase64 } from "@/lib/educators-files";
import { MathContent } from "@/components/quiz/math-content";

const ANSWER_KEY_MARKER = "=== ANSWER KEY ===";

type Example = {
  icon: typeof Calculator;
  label: string;
  kind: string;
  preview: string;
  prompt: string;
};

const EXAMPLES: Example[] = [
  {
    icon: ListOrdered,
    label: "Problem set",
    kind: "Math · classic",
    preview: "10 questions\nshow work\nmixed difficulty",
    prompt:
      "Create homework that is about fractions in a problem set style with 10 problems for grade 5. Mix straightforward practice with a couple of harder challenge problems.",
  },
  {
    icon: Gamepad2,
    label: "Build a game",
    kind: "Math · creative",
    preview: "design rules\nplay & test\nreflect",
    prompt:
      "Create homework that is about multiplication in a build-a-game style with 6 tasks for grade 4. Students design rules for a math card or board game, play it once, and write a short reflection.",
  },
  {
    icon: Hammer,
    label: "Project",
    kind: "Math · multi-day",
    preview: "plan · build\ndeliverable\nrubric",
    prompt:
      "Create homework that is about geometry in a project style with 5 steps for grade 6. Students plan, build a small model using real-world shapes, and submit photos with a written explanation.",
  },
  {
    icon: Calculator,
    label: "Drill",
    kind: "Math · fluency",
    preview: "20 quick Qs\ntimed · 10 min\neasy to hard",
    prompt:
      "Create homework that is about multiplication facts in a timed drill style with 20 problems for grade 3. 10 minute target, working from easy to harder.",
  },
  {
    icon: Trophy,
    label: "Word problems",
    kind: "Math · applied",
    preview: "8 stories\nshow work\nexplain",
    prompt:
      "Create homework that is about ratios in a word problems style with 8 problems for grade 6. Each problem is a short real-life story; students show work and explain their reasoning.",
  },
  {
    icon: Shapes,
    label: "Real-world hunt",
    kind: "Math · hands-on",
    preview: "find 8 things\nat home · photo\n+ 5 questions",
    prompt:
      "Create homework that is about geometry in a real-world scavenger hunt style with 8 finds for grade 4. Students photograph or sketch shapes at home and answer 5 questions about angles and symmetry.",
  },
];

type Topic = {
  slug: string;
  name: string;
  subtopics: { slug: string; name: string }[];
};

/** A free-response quiz question under review in the editor — the teacher can
 *  tweak the stem and the teacher-only answer before saving. */
type EditableQuizQuestion = { id: string; prompt: string; answer: string };

/** A teacher's uploaded source file, normalized for the homework generator.
 *  Ephemeral generation input — not persisted with the assignment. */
type Attachment = {
  id: string;
  kind: "image" | "pdf" | "text";
  name: string;
  mediaType: string;
  /** base64, no data: prefix */
  data: string;
  /** data: URL for an inline thumbnail (images only) */
  previewUrl?: string;
};

const ATTACH_ACCEPT =
  "image/*,application/pdf,.pdf,.docx,.txt,.md,text/plain,text/markdown";
const MAX_ATTACHMENTS = 4;
const MAX_ATTACH_BYTES = 10 * 1024 * 1024; // 10 MB per file

/** Turn one picked file into an Attachment. Images are downscaled; PDFs ride as
 *  raw base64 (Claude reads them natively); .docx/.txt are sent for server-side
 *  text extraction. Unsupported types toast and return null. */
async function processAttachment(file: File): Promise<Attachment | null> {
  if (file.size > MAX_ATTACH_BYTES) {
    toast(`${file.name} is too large (max 10 MB).`);
    return null;
  }
  const name = file.name;
  const lower = name.toLowerCase();
  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf" || lower.endsWith(".pdf");
  const isDocx =
    lower.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const isText =
    file.type.startsWith("text/") || /\.(txt|md|markdown)$/i.test(lower);

  try {
    if (isImage) {
      const enc = await downscaleImageToJpeg(file);
      return {
        id: crypto.randomUUID(),
        kind: "image",
        name,
        mediaType: enc.mediaType,
        data: enc.data,
        previewUrl: enc.previewUrl,
      };
    }
    if (isPdf) {
      return {
        id: crypto.randomUUID(),
        kind: "pdf",
        name,
        mediaType: "application/pdf",
        data: await fileToBase64(file),
      };
    }
    if (isDocx || isText) {
      return {
        id: crypto.randomUUID(),
        kind: "text",
        name,
        mediaType:
          file.type ||
          (isDocx
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : "text/plain"),
        data: await fileToBase64(file),
      };
    }
  } catch {
    toast(`Couldn't read ${name}.`);
    return null;
  }
  toast(`${name}: unsupported type. Use an image, PDF, .docx, or text file.`);
  return null;
}

export const AssignmentEditor = ({
  onClose,
  onSaved,
  editing = null,
  prefill = null,
  initialDue,
  initialClassId,
}: {
  onClose: () => void;
  onSaved: () => void;
  /** Existing assignment — opens in edit mode (PATCH on save). */
  editing?: EducatorAssignment | null;
  /** "Reuse" seed: opens as a new, unsaved copy. */
  prefill?: EducatorAssignment | null;
  /** Due-date seed for new assignments (e.g. calendar day click). */
  initialDue?: string;
  /** Class to assign new homework to (the currently-filtered class). */
  initialClassId?: string | null;
}) => {
  const seed = editing ?? prefill;
  // A free-response quiz seed (generated homework) belongs in the AI tab and
  // its own review UI — not the multiple-choice practice-set state.
  const seedIsFreeQuiz = !!seed?.questions && isFreeResponseQuiz(seed.questions);
  const { classes } = useEduClass();
  const [mode, setMode] = useState<"ai" | "athena">(
    seed?.questions && !seedIsFreeQuiz ? "athena" : "ai"
  );
  const [prompt, setPrompt] = useState(seed?.prompt ?? "");
  const [assigned, setAssigned] = useState(
    editing ? editing.assignedDate : ymd(new Date())
  );
  const [due, setDue] = useState(
    editing ? editing.dueDate : initialDue ?? ymd(addDays(new Date(), 1))
  );
  const [classId, setClassId] = useState<string | null>(
    seed?.classId ?? initialClassId ?? null
  );
  // AI mode sub-choice: stream a generated assignment from the notes, or use
  // the typed/pasted text exactly as written.
  const [verbatim, setVerbatim] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [title, setTitle] = useState(seed?.title ?? "");
  const [draft, setDraft] = useState(seed?.instructions ?? "");
  const [answerKey, setAnswerKey] = useState(seed?.answerKey ?? "");
  const [questions, setQuestions] = useState<AssignmentQuestion[] | null>(
    seed?.questions && !seedIsFreeQuiz
      ? (seed.questions as AssignmentQuestion[])
      : null
  );
  // Free-response quiz under review (generated, or an FR assignment being
  // edited). Distinct from the multiple-choice `questions` above.
  const [quizQuestions, setQuizQuestions] = useState<
    EditableQuizQuestion[] | null
  >(
    seedIsFreeQuiz
      ? (seed!.questions as FreeResponseQuestion[]).map((q) => ({
          id: q.id,
          prompt: q.prompt,
          answer: q.answer,
        }))
      : null
  );
  // Uploaded source files for the generator (images/PDF/doc). Ephemeral.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attaching, setAttaching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Athena practice-set picker state
  const [topicSlug, setTopicSlug] = useState("");
  const [subtopicSlug, setSubtopicSlug] = useState("");
  const [count, setCount] = useState(6);
  const [pulling, setPulling] = useState(false);

  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const addFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast(`Up to ${MAX_ATTACHMENTS} files.`);
      return;
    }
    setAttaching(true);
    try {
      const picked = Array.from(files).slice(0, room);
      const results = await Promise.all(picked.map(processAttachment));
      const ok = results.filter((a): a is Attachment => a !== null);
      if (ok.length) setAttachments((prev) => [...prev, ...ok]);
    } finally {
      setAttaching(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (id: string) =>
    setAttachments((prev) => prev.filter((a) => a.id !== id));

  // Abort any in-flight generation when the editor unmounts.
  useEffect(() => stopStream, [stopStream]);

  const close = useCallback(() => {
    stopStream();
    onClose();
  }, [stopStream, onClose]);

  useEscapeClose(close);

  const { data: topicsData } = useQuery({
    queryKey: ["learning"],
    queryFn: () =>
      fetch("/api/learning").then((r) => {
        if (!r.ok) throw new Error("Failed to load topics");
        return r.json() as Promise<{ topics: Topic[] }>;
      }),
    staleTime: 10 * 60_000,
    enabled: mode === "athena",
  });
  const topics = useMemo(() => topicsData?.topics ?? [], [topicsData]);
  const activeTopic = topics.find((t) => t.slug === topicSlug) ?? null;

  const reset = () => {
    stopStream();
    setGenerating(false);
    setDraft("");
    setTitle("");
    setAnswerKey("");
    setQuestions(null);
    setQuizQuestions(null);
    setAttachments([]);
  };

  // "Write with AI" → generate the homework as a structured per-question quiz
  // the student does inline and Athena AI/vision-grades. Non-streaming: the
  // agent returns the whole quiz (title, directions, questions + answers).
  const generateHomework = async () => {
    if (!prompt.trim() && attachments.length === 0) {
      toast("Type what you'd like to generate, or attach a file.");
      return;
    }
    setGenerating(true);
    setTitle("");
    setDraft("");
    setAnswerKey("");
    setQuizQuestions(null);

    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const resp = await fetch("/api/educators/homework/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          attachments: attachments.map((a) => ({
            kind: a.kind,
            name: a.name,
            mediaType: a.mediaType,
            data: a.data,
          })),
        }),
        signal: controller.signal,
      });
      if (!resp.ok) throw new Error("quiz generation failed");
      const quiz = (await resp.json()) as {
        title: string;
        intro: string;
        questions: { prompt: string; answer: string }[];
      };
      setTitle(quiz.title);
      setDraft(quiz.intro || "Answer each question below. Show your work.");
      setQuizQuestions(
        quiz.questions.map((q) => ({
          id: crypto.randomUUID(),
          prompt: q.prompt,
          answer: q.answer,
        }))
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        console.error(e);
        toast("Homework generation failed. Try again.");
      }
    } finally {
      abortRef.current = null;
      setGenerating(false);
    }
  };

  const updateQuizQuestion = (
    i: number,
    field: "prompt" | "answer",
    value: string
  ) =>
    setQuizQuestions((prev) =>
      prev ? prev.map((q, j) => (j === i ? { ...q, [field]: value } : q)) : prev
    );
  const addQuizQuestion = () =>
    setQuizQuestions((prev) => [
      ...(prev ?? []),
      { id: crypto.randomUUID(), prompt: "", answer: "" },
    ]);
  const removeQuizQuestion = (i: number) =>
    setQuizQuestions((prev) => (prev ? prev.filter((_, j) => j !== i) : prev));

  /** Verbatim path: take the typed/pasted text exactly as the assignment,
   *  no model call. First line is guessed as the title (editable); an
   *  optional `=== ANSWER KEY ===` tail is split into the teacher-only key. */
  const commitVerbatim = () => {
    const text = prompt.trim();
    if (!text) {
      toast("Type or paste the homework first.");
      return;
    }
    const markerIdx = text.indexOf(ANSWER_KEY_MARKER);
    const body = (markerIdx === -1 ? text : text.slice(0, markerIdx)).replace(
      /\s+$/,
      ""
    );
    const key =
      markerIdx === -1
        ? ""
        : text.slice(markerIdx + ANSWER_KEY_MARKER.length).replace(/^\s+/, "");
    const firstLine = body.split("\n", 1)[0] ?? "";
    setTitle(firstLine.slice(0, 80));
    setDraft(body);
    setAnswerKey(key);
  };

  const pullProblems = async () => {
    if (!topicSlug || !subtopicSlug) {
      toast("Pick a topic and subtopic first.");
      return;
    }
    setPulling(true);
    try {
      const r = await fetch(
        `/api/educators/practice-problems?topicSlug=${encodeURIComponent(
          topicSlug
        )}&subtopicSlug=${encodeURIComponent(subtopicSlug)}&count=${count}`
      );
      if (!r.ok) throw new Error("Failed to pull problems");
      const { questions: qs } = (await r.json()) as {
        questions: AssignmentQuestion[];
      };
      if (!qs.length) {
        toast("No practice problems for that subtopic yet.");
        return;
      }
      setQuestions(qs);
      const sub = activeTopic?.subtopics.find((s) => s.slug === subtopicSlug);
      if (!title.trim()) setTitle(`${sub?.name ?? "Practice"} practice set`);
      if (!draft.trim())
        setDraft(
          "Answer every question, then submit. You'll see your score right away."
        );
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not pull problems.");
    } finally {
      setPulling(false);
    }
  };

  const save = async () => {
    if (!title.trim() || !draft.trim()) {
      toast("Need a title and instructions.");
      return;
    }
    const cleanQuiz = quizQuestions?.filter((q) => q.prompt.trim()) ?? null;
    if (quizQuestions && (!cleanQuiz || cleanQuiz.length === 0)) {
      toast("Add at least one question.");
      return;
    }
    try {
      if (editing) {
        await updateAssignment.mutateAsync({
          id: editing.id,
          title: title.trim(),
          instructions: draft.trim(),
          answerKey: answerKey.trim() || null,
          classId,
          assignedDate: assigned,
          dueDate: due,
        });
      } else {
        // Free-response quiz: questions carry per-question answers, and the
        // answer_key column is the assembled key the grader/print page use.
        const quizPayload: QuizQuestion[] | null = questions
          ? questions
          : cleanQuiz && cleanQuiz.length
          ? cleanQuiz.map((q) => ({
              id: q.id,
              kind: "free" as const,
              prompt: q.prompt.trim(),
              answer: q.answer.trim(),
            }))
          : null;
        await createAssignment.mutateAsync({
          title: title.trim(),
          instructions: draft.trim(),
          answerKey: questions
            ? null
            : cleanQuiz && cleanQuiz.length
            ? assembleAnswerKey(cleanQuiz)
            : answerKey.trim() || null,
          questions: quizPayload,
          classId,
          assignedDate: assigned,
          dueDate: due,
          source: questions
            ? "athena"
            : cleanQuiz && cleanQuiz.length
            ? "ai-quiz"
            : "ai",
          prompt: prompt.trim() || null,
        });
      }
      toast("Saved.");
      onSaved();
    } catch (e) {
      toast(`Could not save: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  const saving = createAssignment.isPending || updateAssignment.isPending;
  const hasDraft = draft.trim().length > 0 || title.trim().length > 0;
  const showComposer = !hasDraft && !generating && !editing;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit homework" : "New homework"}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/85 backdrop-blur-sm"
    >
      <button
        onClick={close}
        className="fixed right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-foreground/10 text-foreground/75 transition hover:border-foreground/30 hover:text-foreground"
        aria-label="Close"
      >
        <X size={16} />
      </button>

      <div className="w-full max-w-2xl px-6 py-16">
        {showComposer && (
          <>
            <div className="mb-8 text-center">
              <div className="font-mono-hud hud-dim mb-3 flex items-center justify-center gap-2 text-[12px] tracking-[0.25em]">
                <Wand2 size={13} /> NEW HOMEWORK
              </div>
              <h2 className="text-4xl font-light tracking-tight text-foreground">
                What would you like to assign?
              </h2>
              {/* Mode toggle */}
              <div className="mt-6 inline-flex rounded-full border border-foreground/15 p-1">
                <ModeButton
                  active={mode === "ai"}
                  onClick={() => setMode("ai")}
                  icon={<Sparkles size={12} />}
                  label="Write with AI"
                />
                <ModeButton
                  active={mode === "athena"}
                  onClick={() => setMode("athena")}
                  icon={<Library size={12} />}
                  label="From Athena's problem bank"
                />
              </div>
            </div>

            {mode === "ai" ? (
              <>
                {/* Verbatim vs generate */}
                <div className="mb-3 flex items-center justify-center gap-2">
                  <SubToggle
                    active={!verbatim}
                    onClick={() => setVerbatim(false)}
                    icon={<Sparkles size={11} />}
                    label="Generate from notes"
                  />
                  <SubToggle
                    active={verbatim}
                    onClick={() => setVerbatim(true)}
                    icon={<PenLine size={11} />}
                    label="Use exactly as written"
                  />
                </div>

                <div className="rounded-lg border border-foreground/15 bg-foreground/[0.03] focus-within:border-foreground/40">
                  <div className="flex items-start gap-3 p-5 pb-0">
                    <BookOpen size={18} className="mt-1 shrink-0 text-foreground/60" />
                    <textarea
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          if (verbatim) commitVerbatim();
                          else generateHomework();
                        }
                      }}
                      placeholder={
                        verbatim
                          ? "Paste or type the homework exactly as students should see it. First line becomes the title; add an answer key after a line reading === ANSWER KEY ==="
                          : "Create homework that is about [subject] in a [style] style with [10] problems for grade [5]."
                      }
                      rows={verbatim ? 6 : 3}
                      autoFocus
                      className="w-full resize-none bg-transparent pb-5 text-lg text-foreground placeholder:text-foreground/55 focus:outline-none"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-foreground/10 px-3 py-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <DateField label="Assigned" value={assigned} onChange={setAssigned} />
                      <DateField label="Due" value={due} onChange={setDue} />
                      {!verbatim && (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={
                            attaching || attachments.length >= MAX_ATTACHMENTS
                          }
                          title="Attach an image, PDF, or doc to generate from"
                          className="font-mono-hud hud-dim flex h-10 items-center gap-2 rounded-full border border-foreground/10 px-3 text-foreground/70 transition hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
                        >
                          {attaching ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <Paperclip size={13} />
                          )}
                          <span className="text-[11px] tracking-[0.15em]">
                            ATTACH
                          </span>
                        </button>
                      )}
                    </div>
                    {verbatim ? (
                      <button
                        onClick={commitVerbatim}
                        disabled={!prompt.trim()}
                        className="font-mono-hud hud-text flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-foreground/30 px-5 text-foreground transition hover:border-foreground/60 disabled:opacity-50"
                      >
                        <PenLine size={14} />
                        Use as homework
                      </button>
                    ) : (
                      <button
                        onClick={generateHomework}
                        disabled={!prompt.trim() && attachments.length === 0}
                        className="font-mono-hud hud-text flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-foreground/30 px-5 text-foreground transition hover:border-foreground/60 disabled:opacity-50"
                      >
                        <Sparkles size={14} />
                        Generate homework
                      </button>
                    )}
                  </div>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ATTACH_ACCEPT}
                  multiple
                  hidden
                  onChange={(e) => addFiles(e.target.files)}
                />

                {!verbatim && attachments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {attachments.map((a) => (
                      <AttachmentChip
                        key={a.id}
                        attachment={a}
                        onRemove={() => removeAttachment(a.id)}
                      />
                    ))}
                  </div>
                )}

                <div className={`mt-8 ${verbatim ? "hidden" : ""}`}>
                  <div className="font-mono-hud hud-dim mb-4 flex items-center justify-center gap-2 text-center text-[12px] tracking-[0.25em]">
                    <Lightbulb size={13} /> OR TRY ONE
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {EXAMPLES.map((ex) => {
                      const Icon = ex.icon;
                      return (
                        <button
                          key={ex.label}
                          onClick={() => setPrompt(ex.prompt)}
                          className="group relative flex flex-col overflow-hidden rounded-xl border border-foreground/10 bg-foreground/[0.02] text-left transition hover:border-foreground/35 hover:bg-foreground/[0.05]"
                        >
                          <div className="relative h-20 w-full border-b border-foreground/10 bg-gradient-to-br from-foreground/[0.07] to-transparent">
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Icon
                                size={28}
                                className="text-foreground/70 transition group-hover:scale-110 group-hover:text-foreground"
                                strokeWidth={1.4}
                              />
                            </div>
                            <div className="font-mono-hud absolute bottom-1 right-1.5 whitespace-pre-line text-right text-[10px] leading-[1.3] text-foreground/60">
                              {ex.preview}
                            </div>
                          </div>
                          <div className="p-3">
                            <div className="text-[14px] leading-tight text-foreground">
                              {ex.label}
                            </div>
                            <div className="font-mono-hud hud-dim mt-1 text-[11px] tracking-[0.1em]">
                              {ex.kind}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-foreground/15 bg-foreground/[0.03] p-5">
                <p className="text-sm leading-relaxed text-foreground/70">
                  Pull real questions from Athena&apos;s problem bank. Students
                  answer right on the share link and are scored instantly. No
                  AI grading involved.
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <PickerSelect
                    value={topicSlug}
                    onChange={(v) => {
                      setTopicSlug(v);
                      setSubtopicSlug("");
                    }}
                    placeholder="Topic"
                    options={topics.map((t) => ({ value: t.slug, label: t.name }))}
                  />
                  <PickerSelect
                    value={subtopicSlug}
                    onChange={setSubtopicSlug}
                    placeholder={activeTopic ? "Subtopic" : "Pick a topic first"}
                    options={(activeTopic?.subtopics ?? []).map((s) => ({
                      value: s.slug,
                      label: s.name,
                    }))}
                  />
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-hud hud-dim text-[11px] tracking-[0.2em]">
                      QUESTIONS
                    </span>
                    {[4, 6, 8, 10].map((n) => (
                      <button
                        key={n}
                        onClick={() => setCount(n)}
                        className={`font-mono-hud h-8 w-8 rounded-full border text-[12px] transition ${
                          count === n
                            ? "border-foreground/50 text-foreground"
                            : "border-foreground/10 text-foreground/60 hover:border-foreground/30"
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <DateField label="Assigned" value={assigned} onChange={setAssigned} />
                    <DateField label="Due" value={due} onChange={setDue} />
                    <button
                      onClick={pullProblems}
                      disabled={pulling || !topicSlug || !subtopicSlug}
                      className="font-mono-hud hud-text flex h-10 items-center gap-2 rounded-full border border-foreground/30 px-5 text-foreground transition hover:border-foreground/60 disabled:opacity-50"
                    >
                      {pulling ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Library size={14} />
                      )}
                      Pull problems
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {(generating || hasDraft || editing) && (
          <div>
            <div className="mb-6 flex items-center justify-between">
              {!editing ? (
                <button
                  onClick={reset}
                  className="font-mono-hud hud-text flex items-center gap-2 text-foreground/75 transition hover:text-foreground"
                >
                  <ArrowLeft size={13} />
                  Start over
                </button>
              ) : (
                <div className="font-mono-hud hud-dim flex items-center gap-2 text-[12px] tracking-[0.25em]">
                  EDITING
                </div>
              )}
              <div className="font-mono-hud hud-dim flex items-center gap-2 text-[12px] tracking-[0.25em]">
                {generating ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> BUILDING QUIZ…
                  </>
                ) : (
                  <>
                    <FileText size={13} /> EDIT BEFORE SAVING
                  </>
                )}
              </div>
            </div>

            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              className="w-full bg-transparent text-3xl font-light tracking-tight text-foreground placeholder:text-foreground/45 focus:outline-none"
            />

            {questions ? (
              <div className="mt-4 space-y-4">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-md border border-foreground/10 bg-foreground/[0.03] p-4 text-[15px] leading-relaxed text-foreground focus:border-foreground/40 focus:outline-none"
                />
                <div className="font-mono-hud hud-dim flex items-center justify-between text-[11px] tracking-[0.2em]">
                  <span>{questions.length} QUESTIONS · AUTO-GRADED</span>
                  {!editing && (
                    <button
                      onClick={pullProblems}
                      disabled={pulling}
                      className="flex items-center gap-1.5 text-foreground/70 transition hover:text-foreground disabled:opacity-50"
                    >
                      <RefreshCw size={11} className={pulling ? "animate-spin" : ""} />
                      RESHUFFLE
                    </button>
                  )}
                </div>
                <div className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
                  {questions.map((q, qi) => (
                    <div
                      key={q.id}
                      className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-3"
                    >
                      <div className="flex gap-2 text-[14px] text-foreground/90">
                        <span className="font-mono-hud text-foreground/55">
                          {qi + 1}.
                        </span>
                        <MathContent content={q.prompt} size="sm" />
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        {q.options.map((opt, oi) => (
                          <div
                            key={oi}
                            className={`flex items-center gap-2 rounded-sm border px-2 py-1 text-[13px] ${
                              oi === q.correctIndex
                                ? "border-emerald-400/40 text-emerald-300/90"
                                : "border-foreground/10 text-foreground/65"
                            }`}
                          >
                            {oi === q.correctIndex && <CheckCircle2 size={11} />}
                            <span className="font-mono-hud text-[11px]">
                              {OPTION_LETTERS[oi]}
                            </span>
                            <MathContent content={opt} size="sm" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : quizQuestions ? (
              <div className="mt-4 space-y-4">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={2}
                  placeholder="Directions shown to students above the questions…"
                  className="w-full resize-none rounded-md border border-foreground/10 bg-foreground/[0.03] p-4 text-[15px] leading-relaxed text-foreground placeholder:text-foreground/55 focus:border-foreground/40 focus:outline-none"
                />
                <div className="font-mono-hud hud-dim flex items-center gap-2 text-[11px] tracking-[0.2em]">
                  <KeyRound size={11} />
                  {quizQuestions.length} QUESTION
                  {quizQuestions.length === 1 ? "" : "S"} · AI-GRADED · ANSWERS
                  TEACHER-ONLY
                </div>
                <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
                  {quizQuestions.map((q, qi) => (
                    <div
                      key={q.id}
                      className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-3"
                    >
                      <div className="flex items-start gap-2">
                        <span className="font-mono-hud mt-2.5 text-[13px] text-foreground/55">
                          {qi + 1}.
                        </span>
                        <div className="flex-1 space-y-2">
                          <textarea
                            value={q.prompt}
                            onChange={(e) =>
                              updateQuizQuestion(qi, "prompt", e.target.value)
                            }
                            readOnly={!!editing}
                            rows={2}
                            placeholder="Question"
                            className="w-full resize-none rounded-sm border border-foreground/10 bg-foreground/[0.02] p-2 text-[14px] text-foreground placeholder:text-foreground/45 focus:border-foreground/40 focus:outline-none"
                          />
                          <div className="flex items-start gap-1.5">
                            <span className="font-mono-hud hud-dim mt-2 shrink-0 text-[10px] tracking-[0.15em]">
                              ANS
                            </span>
                            <textarea
                              value={q.answer}
                              onChange={(e) =>
                                updateQuizQuestion(qi, "answer", e.target.value)
                              }
                              readOnly={!!editing}
                              rows={1}
                              placeholder="Expected answer / solution"
                              className="w-full resize-none rounded-sm border border-dashed border-foreground/15 bg-foreground/[0.01] p-2 text-[13px] text-foreground/85 placeholder:text-foreground/40 focus:border-foreground/40 focus:outline-none"
                            />
                          </div>
                        </div>
                        {!editing && (
                          <button
                            onClick={() => removeQuizQuestion(qi)}
                            className="mt-1.5 shrink-0 text-foreground/35 transition hover:text-foreground"
                            aria-label={`Remove question ${qi + 1}`}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {!editing && (
                  <button
                    onClick={addQuizQuestion}
                    className="font-mono-hud hud-dim flex items-center gap-1.5 text-[11px] tracking-[0.15em] text-foreground/60 transition hover:text-foreground"
                  >
                    <Plus size={12} /> ADD QUESTION
                  </button>
                )}
              </div>
            ) : generating ? (
              <div className="mt-10 flex flex-col items-center justify-center gap-3 py-16 text-center">
                <Loader2 className="animate-spin text-foreground/70" size={22} />
                <div className="font-mono-hud hud-dim text-[12px] tracking-[0.25em]">
                  BUILDING YOUR QUIZ…
                </div>
                <p className="max-w-xs text-sm leading-relaxed text-foreground/55">
                  Reading your {attachments.length ? "notes and files" : "notes"}{" "}
                  and writing the questions and answer key.
                </p>
              </div>
            ) : (
              <>
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={generating ? "" : "Instructions…"}
                  rows={12}
                  className="mt-4 w-full resize-none rounded-md border border-foreground/10 bg-foreground/[0.03] p-4 text-[15px] leading-relaxed text-foreground placeholder:text-foreground/55 focus:border-foreground/40 focus:outline-none"
                />
                <div className="mt-4">
                  <div className="font-mono-hud hud-dim mb-2 flex items-center gap-2 text-[11px] tracking-[0.2em]">
                    <KeyRound size={11} />
                    ANSWER KEY · TEACHER ONLY · NEVER SHOWN TO STUDENTS
                  </div>
                  <textarea
                    value={answerKey}
                    onChange={(e) => setAnswerKey(e.target.value)}
                    placeholder={generating ? "" : "Optional answer key or rubric…"}
                    rows={4}
                    className="w-full resize-none rounded-md border border-dashed border-foreground/15 bg-foreground/[0.02] p-4 text-[14px] leading-relaxed text-foreground/90 placeholder:text-foreground/45 focus:border-foreground/40 focus:outline-none"
                  />
                </div>
              </>
            )}

            <div className="mt-5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <DateField label="Assigned" value={assigned} onChange={setAssigned} />
                <DateField label="Due" value={due} onChange={setDue} />
                {classes.length > 0 && (
                  <label className="flex items-center gap-2 rounded-full border border-foreground/10 px-3 py-1.5 transition hover:border-foreground/25">
                    <span className="font-mono-hud hud-dim text-[11px] tracking-[0.2em]">
                      CLASS
                    </span>
                    <select
                      value={classId ?? ""}
                      onChange={(e) => setClassId(e.target.value || null)}
                      className="font-mono-hud max-w-[140px] bg-transparent text-[13px] text-foreground focus:outline-none"
                    >
                      <option value="">Unassigned</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="flex items-center gap-2">
                {generating && (
                  <button
                    onClick={() => {
                      stopStream();
                      setGenerating(false);
                    }}
                    className="font-mono-hud hud-text flex h-11 items-center gap-2 rounded-full border border-foreground/15 px-5 text-foreground/80 transition hover:border-foreground/40 hover:text-foreground"
                  >
                    Stop
                  </button>
                )}
                <button
                  onClick={save}
                  disabled={!draft.trim() || !title.trim() || generating || saving}
                  className="font-mono-hud hud-text flex h-11 items-center gap-2 rounded-full border border-foreground/30 px-6 text-foreground transition hover:border-foreground/60 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={13} className="animate-spin" /> : null}
                  {editing ? "Save changes" : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const ModeButton = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    onClick={onClick}
    className={`font-mono-hud flex h-9 items-center gap-2 rounded-full px-4 text-[11px] uppercase tracking-[0.15em] transition ${
      active
        ? "bg-foreground/10 text-foreground"
        : "text-foreground/60 hover:text-foreground"
    }`}
  >
    {icon}
    {label}
  </button>
);

const SubToggle = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    onClick={onClick}
    className={`font-mono-hud flex h-8 items-center gap-1.5 rounded-full border px-3 text-[10px] uppercase tracking-[0.12em] transition ${
      active
        ? "border-foreground/40 bg-foreground/10 text-foreground"
        : "border-foreground/10 text-foreground/55 hover:text-foreground"
    }`}
  >
    {icon}
    {label}
  </button>
);

const AttachmentChip = ({
  attachment,
  onRemove,
}: {
  attachment: Attachment;
  onRemove: () => void;
}) => {
  const Icon = attachment.kind === "pdf" ? FileText : FileIcon;
  return (
    <span className="group flex max-w-[220px] items-center gap-2 rounded-full border border-foreground/15 bg-foreground/[0.03] py-1 pl-1.5 pr-2 text-foreground/80">
      {attachment.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={attachment.previewUrl}
          alt=""
          className="h-6 w-6 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground/10">
          {attachment.kind === "image" ? (
            <ImageIcon size={12} />
          ) : (
            <Icon size={12} />
          )}
        </span>
      )}
      <span className="truncate text-[12px]">{attachment.name}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${attachment.name}`}
        className="shrink-0 text-foreground/40 transition hover:text-foreground"
      >
        <X size={12} />
      </button>
    </span>
  );
};

const PickerSelect = ({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className="font-mono-hud h-11 w-full rounded-md border border-foreground/15 bg-foreground/[0.03] px-3 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
  >
    <option value="">{placeholder}</option>
    {options.map((o) => (
      <option key={o.value} value={o.value}>
        {o.label}
      </option>
    ))}
  </select>
);

const DateField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <label className="flex items-center gap-2 rounded-full border border-foreground/10 px-3 py-1.5 transition hover:border-foreground/25">
    <CalendarRange size={12} className="text-foreground/60" />
    <span className="font-mono-hud hud-dim text-[11px] tracking-[0.2em]">
      {label.toUpperCase()}
    </span>
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="font-mono-hud bg-transparent text-[13px] text-foreground focus:outline-none"
    />
  </label>
);
