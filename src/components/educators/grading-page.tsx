"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck,
  Loader2,
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Circle,
  Pencil,
  Check,
  FlaskConical,
  Inbox,
  Lightbulb,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  useAiGrade,
  useAssignmentInsight,
  useEducatorAssignments,
  useEducatorStudents,
  useEducatorSubmissions,
  useSaveSubmissionEdit,
  useSimulateSubmission,
  type EducatorAssignment,
  type EducatorStudent,
  type EducatorSubmission,
} from "@/hooks/use-educators";
import { EduDrawer } from "@/components/educators/edu-drawer";
import { inSelectedClass, useEduClass } from "@/components/educators/class-context";
import {
  formatShortDate,
  OPTION_LETTERS,
  isPracticeSet,
  type AssignmentQuestion,
} from "@/lib/educators";

const gradeTone = (g: number | null) => {
  if (g === null) return "text-foreground/55";
  if (g >= 85) return "text-emerald-400/90";
  if (g >= 70) return "text-amber-400/90";
  return "text-rose-400/90";
};

const hasWork = (sub: EducatorSubmission | null) =>
  !!sub && (!!sub.response?.trim() || !!sub.answers || !!sub.images?.length);

export function GradingPage() {
  const [openAssignment, setOpenAssignment] = useState<string | null>(null);
  const [gradingKeys, setGradingKeys] = useState<Set<string>>(new Set());

  const assignmentsQ = useEducatorAssignments();
  const studentsQ = useEducatorStudents();
  const submissionsQ = useEducatorSubmissions();
  const aiGrade = useAiGrade();
  const simulate = useSimulateSubmission();
  const saveEditMutation = useSaveSubmissionEdit();

  const isError = assignmentsQ.isError || studentsQ.isError || submissionsQ.isError;
  useEffect(() => {
    if (isError) toast.error("Failed to load grading data.");
  }, [isError]);

  const loading =
    assignmentsQ.isLoading || studentsQ.isLoading || submissionsQ.isLoading;

  const { selectedClassId } = useEduClass();
  const assignments = useMemo(() => {
    const list = inSelectedClass(
      assignmentsQ.data?.assignments ?? [],
      selectedClassId
    ).slice();
    list.sort((a, b) => (a.dueDate < b.dueDate ? 1 : -1));
    return list;
  }, [assignmentsQ.data, selectedClassId]);
  const students = useMemo(
    () => inSelectedClass(studentsQ.data?.students ?? [], selectedClassId),
    [studentsQ.data, selectedClassId]
  );
  const subs = useMemo(() => submissionsQ.data?.submissions ?? [], [submissionsQ.data]);

  // Per-assignment turn-in / graded counts (real submissions only).
  const assignmentStats = useMemo(() => {
    const map = new Map<
      string,
      { submitted: number; graded: number; total: number; avg: number | null }
    >();
    const acc = new Map<
      string,
      { submitted: number; graded: number; sum: number }
    >();
    assignments.forEach((a) => acc.set(a.id, { submitted: 0, graded: 0, sum: 0 }));
    subs.forEach((sub) => {
      const a = acc.get(sub.assignmentId);
      if (!a || sub.simulated) return;
      if (sub.response?.trim() || sub.answers) a.submitted += 1;
      if (sub.grade !== null) {
        a.graded += 1;
        a.sum += sub.grade;
      }
    });
    acc.forEach((v, k) => {
      map.set(k, {
        submitted: v.submitted,
        graded: v.graded,
        total: students.length,
        avg: v.graded ? Math.round(v.sum / v.graded) : null,
      });
    });
    return map;
  }, [assignments, students, subs]);

  const subFor = (assignmentId: string, studentId: string) =>
    subs.find((s) => s.assignmentId === assignmentId && s.studentId === studentId) ??
    null;

  const markGrading = (key: string, on: boolean) =>
    setGradingKeys((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const gradeOne = async (assignment: EducatorAssignment, student: EducatorStudent) => {
    const key = `${assignment.id}:${student.id}`;
    markGrading(key, true);
    try {
      await aiGrade.mutateAsync({
        assignmentId: assignment.id,
        studentId: student.id,
      });
    } catch (e) {
      toast(`Grading failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      markGrading(key, false);
    }
  };

  const simulateOne = async (
    assignment: EducatorAssignment,
    student: EducatorStudent
  ) => {
    const key = `${assignment.id}:${student.id}`;
    markGrading(key, true);
    try {
      await simulate.mutateAsync({
        assignmentId: assignment.id,
        studentId: student.id,
      });
    } catch (e) {
      toast(`Simulation failed: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      markGrading(key, false);
    }
  };

  /** Grade every student with ungraded real work, a few at a time. */
  const gradeUngraded = async (assignment: EducatorAssignment) => {
    const targets = students.filter((s) => {
      const sub = subFor(assignment.id, s.id);
      return hasWork(sub) && sub!.grade === null;
    });
    if (targets.length === 0) return;
    const queue = [...targets];
    const workers = Array.from(
      { length: Math.min(4, queue.length) },
      async () => {
        for (let s = queue.shift(); s; s = queue.shift()) {
          await gradeOne(assignment, s);
        }
      }
    );
    await Promise.all(workers);
  };

  const saveEdit = async (
    assignment: EducatorAssignment,
    student: EducatorStudent,
    grade: number | null,
    teacherFeedback: string
  ) => {
    try {
      await saveEditMutation.mutateAsync({
        assignmentId: assignment.id,
        studentId: student.id,
        grade,
        teacherFeedback,
      });
      return true;
    } catch (e) {
      toast(`Save failed: ${e instanceof Error ? e.message : "unknown"}`);
      return false;
    }
  };

  const active = openAssignment
    ? assignments.find((a) => a.id === openAssignment) ?? null
    : null;

  return (
    <div className="flex h-full flex-col">
      <div className="mb-6 flex items-center gap-2">
        <ClipboardCheck size={16} className="text-foreground/70" />
        <div className="font-mono-hud hud-text text-foreground">Grading</div>
      </div>

      {loading ? (
        <div className="font-mono-hud hud-dim flex items-center gap-2 text-[13px]">
          <Loader2 size={13} className="animate-spin" />
          Loading
        </div>
      ) : (
        <div className="flex-1">
          <div className="font-mono-hud hud-dim mb-3 text-[12px] tracking-[0.2em]">
            ASSIGNMENTS · {assignments.length}
          </div>
          <div className="space-y-2">
            {assignments.length === 0 && (
              <div className="rounded-md border border-dashed border-foreground/15 p-8 text-center">
                <div className="font-mono-hud hud-dim text-[13px]">
                  No assignments yet. Create one in Homework.
                </div>
              </div>
            )}
            {assignments.map((a) => {
              const st = assignmentStats.get(a.id);
              const ungraded = (st?.submitted ?? 0) - (st?.graded ?? 0);
              return (
                <button
                  key={a.id}
                  onClick={() => setOpenAssignment(a.id)}
                  className={`group flex w-full items-center gap-4 rounded-md border bg-foreground/[0.02] px-4 py-3 text-left transition hover:bg-foreground/[0.04] ${
                    ungraded > 0
                      ? "border-rose-400/40 hover:border-rose-400/60"
                      : "border-foreground/10 hover:border-foreground/30"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] text-foreground">{a.title}</div>
                    <div className="font-mono-hud hud-dim mt-0.5 text-[12px] tracking-[0.15em]">
                      DUE {formatShortDate(a.dueDate).toUpperCase()} ·{" "}
                      {st?.submitted ?? 0}/{st?.total ?? 0} TURNED IN ·{" "}
                      {st?.graded ?? 0} GRADED
                    </div>
                  </div>
                  {ungraded > 0 && (
                    <span className="font-mono-hud rounded-full border border-rose-400/40 bg-rose-500/[0.08] px-2.5 py-0.5 text-[11px] tracking-[0.12em] text-rose-300/90">
                      {ungraded} TO GRADE
                    </span>
                  )}
                  <div className={`font-mono-hud text-sm ${gradeTone(st?.avg ?? null)}`}>
                    {st?.avg !== null && st?.avg !== undefined ? `${st.avg}%` : "·"}
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-foreground/45 transition group-hover:text-foreground/70"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {active && (
        <AssignmentDetail
          assignment={active}
          students={students}
          subFor={(sid) => subFor(active.id, sid)}
          gradingKeys={gradingKeys}
          onGrade={(s) => gradeOne(active, s)}
          onSimulate={(s) => simulateOne(active, s)}
          onGradeUngraded={() => gradeUngraded(active)}
          onSaveEdit={(s, grade, teacherFeedback) =>
            saveEdit(active, s, grade, teacherFeedback)
          }
          onClose={() => setOpenAssignment(null)}
        />
      )}
    </div>
  );
}

const AssignmentDetail = ({
  assignment,
  students,
  subFor,
  gradingKeys,
  onGrade,
  onSimulate,
  onGradeUngraded,
  onSaveEdit,
  onClose,
}: {
  assignment: EducatorAssignment;
  students: EducatorStudent[];
  subFor: (studentId: string) => EducatorSubmission | null;
  gradingKeys: Set<string>;
  onGrade: (s: EducatorStudent) => void;
  onSimulate: (s: EducatorStudent) => void;
  onGradeUngraded: () => Promise<void>;
  onSaveEdit: (
    s: EducatorStudent,
    grade: number | null,
    teacherFeedback: string
  ) => Promise<boolean>;
  onClose: () => void;
}) => {
  const [openSub, setOpenSub] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editGrade, setEditGrade] = useState<string>("");
  const [editFeedback, setEditFeedback] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [batchRunning, setBatchRunning] = useState(false);

  const anyGrading = gradingKeys.size > 0;
  const insight = useAssignmentInsight();

  const ungradedCount = students.filter((s) => {
    const sub = subFor(s.id);
    return hasWork(sub) && sub!.grade === null;
  }).length;

  // Real graded submissions (insight needs at least one).
  const gradedCount = students.filter((s) => {
    const sub = subFor(s.id);
    return !!sub && !sub.simulated && sub.grade !== null;
  }).length;

  const runInsight = () =>
    insight.mutate(assignment.id, {
      onError: (e) =>
        toast(e instanceof Error ? e.message : "Could not generate insight."),
    });

  const runBatch = async () => {
    setBatchRunning(true);
    try {
      await onGradeUngraded();
    } finally {
      setBatchRunning(false);
    }
  };

  const startEdit = (s: EducatorStudent, sub: EducatorSubmission | null) => {
    setEditing(s.id);
    setOpenSub(s.id);
    setEditGrade(sub?.grade !== null && sub?.grade !== undefined ? String(sub.grade) : "");
    setEditFeedback(sub?.teacherFeedback ?? "");
  };

  const commitEdit = async (s: EducatorStudent) => {
    const n =
      editGrade.trim() === ""
        ? null
        : Math.max(0, Math.min(100, Math.round(Number(editGrade))));
    if (editGrade.trim() !== "" && Number.isNaN(n as number)) {
      toast("Grade must be a number 0-100.");
      return;
    }
    setSavingEdit(true);
    const ok = await onSaveEdit(s, n, editFeedback.trim());
    setSavingEdit(false);
    if (ok) setEditing(null);
  };

  return (
    <EduDrawer title="Assignment" width="max-w-2xl" onClose={onClose}>
      <h3 className="text-2xl font-light tracking-tight text-foreground">
        {assignment.title}
      </h3>
      <div className="font-mono-hud hud-dim mt-1 text-[12px] tracking-[0.2em]">
        DUE {formatShortDate(assignment.dueDate).toUpperCase()}
        {isPracticeSet(assignment.questions)
          ? " · PRACTICE SET · AUTO-GRADED"
          : assignment.questions
          ? " · QUIZ · AI-GRADED"
          : ""}
      </div>

      {/* AI class insight — the glowing lightbulb */}
      {gradedCount > 0 && (
        <div className="mt-5">
          {insight.data ? (
            <div className="rounded-lg border border-amber-400/25 bg-amber-400/[0.04] p-4">
              <div className="flex items-start gap-3">
                <Lightbulb
                  size={18}
                  className="insight-bulb mt-0.5 shrink-0"
                  fill="currentColor"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-relaxed text-foreground">
                    {insight.data.insight.headline}
                  </p>
                  {insight.data.insight.struggles.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {insight.data.insight.struggles.map((st, i) => (
                        <li
                          key={i}
                          className="flex gap-2 text-[13px] leading-relaxed text-foreground/85"
                        >
                          <span className="text-amber-300/70">·</span>
                          {st}
                        </li>
                      ))}
                    </ul>
                  )}
                  {insight.data.insight.suggestion && (
                    <p className="mt-2.5 text-[13px] leading-relaxed text-foreground/75">
                      <span className="font-mono-hud hud-dim text-[10px] tracking-[0.2em]">
                        TRY{" "}
                      </span>
                      {insight.data.insight.suggestion}
                    </p>
                  )}
                  <button
                    onClick={runInsight}
                    disabled={insight.isPending}
                    className="font-mono-hud hud-dim mt-3 text-[10px] tracking-[0.15em] underline-offset-4 transition hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    {insight.isPending ? "REFRESHING…" : "REFRESH"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <button
              onClick={runInsight}
              disabled={insight.isPending}
              className="flex w-full items-center gap-3 rounded-lg border border-foreground/12 bg-foreground/[0.02] px-4 py-3 text-left transition hover:border-amber-400/30 hover:bg-amber-400/[0.03] disabled:opacity-60"
            >
              <Lightbulb
                size={18}
                className={`insight-bulb shrink-0 ${insight.isPending ? "is-on" : ""}`}
                fill="currentColor"
              />
              <span className="text-[14px] text-foreground/85">
                {insight.isPending
                  ? "Reading the class's work…"
                  : "What did the class struggle with?"}
              </span>
              {insight.isPending && (
                <Loader2 size={14} className="ml-auto animate-spin text-foreground/55" />
              )}
            </button>
          )}
        </div>
      )}

      {ungradedCount > 0 && (
        <button
          onClick={runBatch}
          disabled={batchRunning || anyGrading}
          className="font-mono-hud hud-text mt-6 flex h-10 items-center justify-center gap-2 rounded-full border border-foreground/30 text-foreground transition hover:border-foreground/60 disabled:opacity-50"
        >
          {batchRunning ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Sparkles size={14} />
          )}
          Grade ungraded ({ungradedCount})
        </button>
      )}

      <div className="font-mono-hud hud-dim mb-2 mt-8 text-[12px] tracking-[0.2em]">
        STUDENTS
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {students.length === 0 && (
          <div className="font-mono-hud hud-dim text-[13px]">
            No students yet. Add them in Students → Settings.
          </div>
        )}
        {students.map((s) => {
          const sub = subFor(s.id);
          const submitted = hasWork(sub);
          const key = `${assignment.id}:${s.id}`;
          const isGrading = gradingKeys.has(key);
          const isOpen = openSub === s.id;
          const isEditing = editing === s.id;
          return (
            <div
              key={s.id}
              className="rounded-md border border-foreground/10 bg-foreground/[0.02]"
            >
              <button
                onClick={() => setOpenSub(isOpen ? null : s.id)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                {sub?.grade !== null && sub?.grade !== undefined ? (
                  <CheckCircle2 size={14} className="text-foreground/70" />
                ) : isGrading ? (
                  <Loader2 size={14} className="animate-spin text-foreground/55" />
                ) : submitted ? (
                  <Inbox size={14} className="text-rose-400/80" />
                ) : (
                  <Circle size={14} className="text-foreground/40" />
                )}
                <div className="min-w-0 flex-1 truncate text-[15px] text-foreground">
                  {s.name}
                </div>
                {sub?.simulated && (
                  <span className="font-mono-hud rounded-full border border-amber-400/40 px-2 py-0.5 text-[10px] tracking-[0.12em] text-amber-300/90">
                    SIMULATED
                  </span>
                )}
                {!submitted && !sub?.grade ? (
                  <span className="font-mono-hud hud-dim text-[11px] tracking-[0.12em]">
                    NO SUBMISSION
                  </span>
                ) : (
                  <div
                    className={`font-mono-hud text-[13px] ${
                      sub?.grade !== null && sub?.grade !== undefined
                        ? gradeTone(sub.grade)
                        : "text-rose-300/90"
                    }`}
                  >
                    {sub?.grade !== null && sub?.grade !== undefined
                      ? `${sub.grade}%`
                      : "TURNED IN"}
                  </div>
                )}
              </button>

              {isOpen && (
                <div className="space-y-3 border-t border-foreground/10 px-3 py-3">
                  {!isEditing ? (
                    <>
                      {sub?.simulated && (
                        <p className="rounded-md border border-amber-400/25 bg-amber-400/[0.05] px-3 py-2 text-[12px] leading-relaxed text-amber-200/90">
                          Demo data. This response was AI-invented via
                          &quot;Simulate&quot;, not submitted by {s.name}. It is
                          excluded from class statistics.
                        </p>
                      )}
                      {sub?.submittedAt && !sub.simulated && (
                        <div className="font-mono-hud hud-dim text-[11px] tracking-[0.15em]">
                          TURNED IN{" "}
                          {new Date(sub.submittedAt)
                            .toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                            })
                            .toUpperCase()}
                        </div>
                      )}
                      {sub?.feedback && (
                        <div>
                          <div className="font-mono-hud hud-dim flex items-center gap-1.5 text-[11px] tracking-[0.2em]">
                            <Sparkles size={10} /> AI FEEDBACK
                          </div>
                          <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">
                            {sub.feedback}
                          </p>
                        </div>
                      )}
                      {sub?.teacherFeedback && (
                        <div>
                          <div className="font-mono-hud hud-dim flex items-center gap-1.5 text-[11px] tracking-[0.2em]">
                            <Pencil size={10} /> TEACHER FEEDBACK
                          </div>
                          <p className="mt-1 text-[13px] leading-relaxed text-foreground/85">
                            {sub.teacherFeedback}
                          </p>
                        </div>
                      )}
                      {isPracticeSet(assignment.questions) && sub?.answers ? (
                        <div>
                          <div className="font-mono-hud hud-dim text-[11px] tracking-[0.2em]">
                            ANSWERS
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {(assignment.questions as AssignmentQuestion[]).map((q, qi) => {
                              const chosen = sub.answers?.[qi] ?? -1;
                              const right = chosen === q.correctIndex;
                              return (
                                <span
                                  key={q.id}
                                  title={`Q${qi + 1}: chose ${
                                    OPTION_LETTERS[chosen] ?? "-"
                                  }, correct ${OPTION_LETTERS[q.correctIndex]}`}
                                  className={`font-mono-hud inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[11px] ${
                                    right
                                      ? "border-emerald-400/40 text-emerald-300/90"
                                      : "border-rose-400/40 text-rose-300/90"
                                  }`}
                                >
                                  {qi + 1}
                                  {right ? <Check size={9} /> : <XIcon size={9} />}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <>
                          {sub?.response && (
                            <div>
                              <div className="font-mono-hud hud-dim text-[11px] tracking-[0.2em]">
                                RESPONSE
                              </div>
                              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/75">
                                {sub.response}
                              </p>
                            </div>
                          )}
                          {!!sub?.imageUrls?.length && (
                            <div>
                              <div className="font-mono-hud hud-dim text-[11px] tracking-[0.2em]">
                                WORK PHOTOS · {sub.imageUrls.length}
                              </div>
                              <div className="mt-1.5 flex flex-wrap gap-2">
                                {sub.imageUrls.map((url, i) => (
                                  <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noreferrer"
                                    title="Open full size"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={url}
                                      alt={`Student work photo ${i + 1}`}
                                      className="h-24 w-24 rounded-md border border-foreground/15 object-cover transition hover:border-foreground/45"
                                    />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      <div className="flex items-center justify-end gap-2 pt-1">
                        {!submitted && !isPracticeSet(assignment.questions) && (
                          <button
                            onClick={() => onSimulate(s)}
                            disabled={isGrading}
                            title="Demo: invent and grade a plausible response (clearly badged)"
                            className="font-mono-hud flex h-8 items-center gap-1.5 rounded-full border border-amber-400/30 px-3 text-[11px] uppercase tracking-[0.12em] text-amber-300/90 transition hover:border-amber-400/60 disabled:opacity-50"
                          >
                            {isGrading ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <FlaskConical size={12} />
                            )}
                            Simulate (demo)
                          </button>
                        )}
                        {submitted && (
                          <button
                            onClick={() => onGrade(s)}
                            disabled={isGrading}
                            className="font-mono-hud hud-text flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-foreground/80 transition hover:border-foreground/35 hover:text-foreground disabled:opacity-50"
                          >
                            {isGrading ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Sparkles size={12} />
                            )}
                            {sub?.grade !== null && sub?.grade !== undefined
                              ? "Re-grade"
                              : "Grade"}
                          </button>
                        )}
                        <button
                          onClick={() => startEdit(s, sub)}
                          className="font-mono-hud hud-text flex h-8 items-center gap-1.5 rounded-full border border-foreground/30 px-3 text-foreground transition hover:border-foreground/60"
                        >
                          <Pencil size={12} />
                          Edit
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-3">
                        <label className="font-mono-hud hud-dim flex items-center gap-2 text-[11px] tracking-[0.2em]">
                          GRADE
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={editGrade}
                            onChange={(e) => setEditGrade(e.target.value)}
                            className="font-mono-hud h-8 w-20 rounded-md border border-foreground/15 bg-foreground/[0.04] px-2 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
                          />
                          <span className="text-foreground/55">/ 100</span>
                        </label>
                      </div>
                      {sub?.feedback && (
                        <div className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-2.5">
                          <div className="font-mono-hud hud-dim flex items-center gap-1.5 text-[10px] tracking-[0.2em]">
                            <Sparkles size={9} /> AI FEEDBACK
                          </div>
                          <p className="mt-1 text-[12px] leading-relaxed text-foreground/70">
                            {sub.feedback}
                          </p>
                        </div>
                      )}
                      <div>
                        <div className="font-mono-hud hud-dim mb-1 text-[11px] tracking-[0.2em]">
                          YOUR FEEDBACK
                        </div>
                        <textarea
                          value={editFeedback}
                          onChange={(e) => setEditFeedback(e.target.value)}
                          rows={3}
                          placeholder="Add your own comment for the student"
                          className="w-full resize-none rounded-md border border-foreground/15 bg-foreground/[0.04] p-2 text-[13px] leading-relaxed text-foreground placeholder:text-foreground/55 focus:border-foreground/40 focus:outline-none"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setEditing(null)}
                          disabled={savingEdit}
                          className="font-mono-hud hud-text flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-foreground/80 transition hover:border-foreground/35 hover:text-foreground disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => commitEdit(s)}
                          disabled={savingEdit}
                          className="font-mono-hud hud-text flex h-8 items-center gap-1.5 rounded-full border border-foreground/30 px-3 text-foreground transition hover:border-foreground/60 disabled:opacity-50"
                        >
                          {savingEdit ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Check size={12} />
                          )}
                          Save
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </EduDrawer>
  );
};
