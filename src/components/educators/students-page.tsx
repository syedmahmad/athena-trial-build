"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Mail,
  Loader2,
  Plus,
  Trash2,
  Settings,
  User,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronRight,
  Activity,
  Users,
  GraduationCap,
  Send,
  Sparkles,
  Pencil,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthUser } from "@/components/auth/auth-context";
import {
  useCreateClass,
  useCreateStudent,
  useDeleteClass,
  useDeleteStudent,
  useEducatorAssignments,
  useEducatorStudents,
  useEducatorSubmissions,
  useLogParentReport,
  useParentReports,
  useRenameClass,
  useUpdateStudent,
  type EducatorClass,
  type EducatorStudent,
} from "@/hooks/use-educators";
import { EduDrawer } from "@/components/educators/edu-drawer";
import {
  inSelectedClass,
  useEduClass,
} from "@/components/educators/class-context";

type GradePoint = { grade: number; title: string };

type StudentStat = {
  count: number;
  avg: number | null;
  lastAt: string | null;
  history: GradePoint[];
  perAssignment: { title: string; grade: number | null; submitted: boolean }[];
};

const toneFor = (g: number) =>
  g >= 85 ? "bg-emerald-400/80" : g >= 70 ? "bg-amber-400/70" : "bg-rose-500/70";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");

const Avatar = ({ name, size = "md" }: { name: string; size?: "md" | "lg" }) => (
  <div
    className={`flex shrink-0 items-center justify-center rounded-full border border-foreground/15 bg-foreground/[0.06] ${
      size === "lg" ? "h-16 w-16" : "h-10 w-10"
    }`}
  >
    <span
      className={`font-mono-hud text-foreground/80 ${
        size === "lg" ? "text-sm" : "text-[12px]"
      }`}
    >
      {initials(name)}
    </span>
  </div>
);

export function StudentsPage() {
  const [sending, setSending] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const studentsQ = useEducatorStudents();
  const submissionsQ = useEducatorSubmissions();
  const assignmentsQ = useEducatorAssignments();
  const logReport = useLogParentReport();
  const { selectedClassId, selectedClass } = useEduClass();

  const isError = studentsQ.isError || submissionsQ.isError;
  useEffect(() => {
    if (isError) toast.error("Failed to load students.");
  }, [isError]);

  const students = useMemo(
    () => inSelectedClass(studentsQ.data?.students ?? [], selectedClassId),
    [studentsQ.data, selectedClassId]
  );
  const subs = useMemo(() => submissionsQ.data?.submissions ?? [], [submissionsQ.data]);
  const assignments = useMemo(
    () => assignmentsQ.data?.assignments ?? [],
    [assignmentsQ.data]
  );

  // Real (non-simulated) work only — demo data never reaches statistics.
  const stats = useMemo(() => {
    const titleById = new Map(assignments.map((a) => [a.id, a.title]));
    const map = new Map<string, StudentStat>();
    students.forEach((s) => {
      const mine = subs
        .filter((sub) => sub.studentId === s.id && !sub.simulated)
        .sort((a, b) => (a.submittedAt ?? "").localeCompare(b.submittedAt ?? ""));
      const graded = mine.filter((sub) => sub.grade !== null);
      const history: GradePoint[] = graded.map((sub) => ({
        grade: sub.grade as number,
        title: titleById.get(sub.assignmentId) ?? "Assignment",
      }));
      const lastAt = mine.reduce<string | null>(
        (acc, sub) =>
          sub.submittedAt && (!acc || sub.submittedAt > acc) ? sub.submittedAt : acc,
        null
      );
      map.set(s.id, {
        count: graded.length,
        avg: graded.length
          ? Math.round(
              graded.reduce((sum, sub) => sum + (sub.grade ?? 0), 0) / graded.length
            )
          : null,
        lastAt,
        history,
        perAssignment: mine.map((sub) => ({
          title: titleById.get(sub.assignmentId) ?? "Assignment",
          grade: sub.grade,
          submitted: !!(sub.response?.trim() || sub.answers),
        })),
      });
    });
    return map;
  }, [students, subs, assignments]);

  const sendReport = async (student: EducatorStudent) => {
    setSending(student.id);
    try {
      await logReport.mutateAsync({ studentId: student.id });
      toast(
        `Report logged for ${student.name}'s parent. Read it in their profile.`
      );
    } catch (e) {
      toast(`Could not log report: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setSending(null);
    }
  };

  const activeStudent = openStudent
    ? students.find((s) => s.id === openStudent)
    : null;

  // Class health buckets across all real grades
  const health = useMemo(() => {
    let good = 0,
      ok = 0,
      struggling = 0;
    Array.from(stats.values()).forEach((v) =>
      v.history.forEach(({ grade }) => {
        if (grade >= 85) good++;
        else if (grade >= 70) ok++;
        else struggling++;
      })
    );
    const total = good + ok + struggling || 1;
    return {
      good,
      ok,
      struggling,
      count: good + ok + struggling,
      goodPct: (good / total) * 100,
      okPct: (ok / total) * 100,
      strugglingPct: (struggling / total) * 100,
    };
  }, [stats]);

  return (
    <div className="flex h-full flex-col">
      {/* Header row */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <GraduationCap size={16} className="text-foreground/70" />
          <div className="font-mono-hud hud-text text-foreground">Students</div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setChatOpen(true)}
            className="font-mono-hud hud-text flex h-10 items-center gap-2 rounded-full border border-foreground/15 px-5 text-foreground/80 transition hover:border-foreground/40 hover:text-foreground"
          >
            <Sparkles size={14} />
            Ask Athena
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="font-mono-hud hud-text flex h-10 items-center gap-2 rounded-full border border-foreground/15 px-5 text-foreground/80 transition hover:border-foreground/40 hover:text-foreground"
          >
            <Settings size={14} />
            Settings
          </button>
        </div>
      </div>

      {/* Class health bar */}
      {health.count > 0 && (
        <div className="mb-8 rounded-lg border border-foreground/10 bg-foreground/[0.03] p-5">
          <div className="font-mono-hud hud-dim mb-3 flex items-center justify-between text-[12px] tracking-[0.2em]">
            <span className="flex items-center gap-2">
              <Activity size={12} />
              CLASS HEALTH
            </span>
            <span className="flex items-center gap-2">
              <Users size={12} />
              {health.count} GRADED SUBMISSIONS
            </span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-sm border border-foreground/10 bg-foreground/[0.03]">
            {health.good > 0 && (
              <div
                style={{ width: `${health.goodPct}%` }}
                className="bg-emerald-400/80"
                title={`${health.good} good`}
              />
            )}
            {health.ok > 0 && (
              <div
                style={{ width: `${health.okPct}%` }}
                className="bg-amber-400/70"
                title={`${health.ok} ok`}
              />
            )}
            {health.struggling > 0 && (
              <div
                style={{ width: `${health.strugglingPct}%` }}
                className="bg-rose-500/70"
                title={`${health.struggling} struggling`}
              />
            )}
          </div>
          <div className="font-mono-hud hud-dim mt-3 flex items-center gap-5 text-[12px] tracking-[0.15em]">
            <LegendDot cls="bg-emerald-400/80" label={`GOOD ${health.good}`} icon={<TrendingUp size={10} />} />
            <LegendDot cls="bg-amber-400/70" label={`OK ${health.ok}`} icon={<Minus size={10} />} />
            <LegendDot cls="bg-rose-500/70" label={`STRUGGLING ${health.struggling}`} icon={<TrendingDown size={10} />} />
          </div>
        </div>
      )}

      {/* Student rows */}
      <div className="font-mono-hud hud-dim mb-3 flex items-center gap-2 text-[12px] tracking-[0.2em]">
        <Users size={12} />
        {selectedClass ? `${selectedClass.name.toUpperCase()} · ` : "ROSTER · "}
        {students.length}
      </div>
      <div className="space-y-2">
        {students.map((s) => {
          const stat = stats.get(s.id);
          const avg = stat?.avg ?? null;
          const history = stat?.history ?? [];
          const trendIcon =
            avg === null ? (
              <Minus size={12} />
            ) : avg >= 85 ? (
              <TrendingUp size={12} className="text-emerald-400/90" />
            ) : avg >= 70 ? (
              <Minus size={12} className="text-amber-400/90" />
            ) : (
              <TrendingDown size={12} className="text-rose-400/90" />
            );
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpenStudent(s.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") setOpenStudent(s.id);
              }}
              className="group flex w-full cursor-pointer items-center gap-4 rounded-md border border-foreground/10 bg-foreground/[0.02] px-4 py-3 text-left transition hover:border-foreground/30 hover:bg-foreground/[0.04]"
            >
              <Avatar name={s.name} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] text-foreground">{s.name}</div>
                <div className="font-mono-hud hud-dim mt-0.5 flex items-center gap-1.5 text-[12px]">
                  {trendIcon}
                  {avg !== null
                    ? `${avg}% avg · ${stat?.count ?? 0} graded`
                    : "No graded work yet"}
                </div>
              </div>
              <div className="hidden items-center gap-0.5 sm:flex">
                {history.slice(-10).map((p, i) => (
                  <span
                    key={i}
                    title={`${p.title}: ${p.grade}%`}
                    className={`h-6 w-2.5 rounded-sm ${toneFor(p.grade)}`}
                  />
                ))}
              </div>
              <ChevronRight
                size={14}
                className="text-foreground/45 transition group-hover:text-foreground/70"
              />
            </div>
          );
        })}
        {students.length === 0 && !studentsQ.isLoading && (
          <div className="rounded-md border border-dashed border-foreground/15 p-12 text-center">
            <Users size={20} className="mx-auto mb-3 text-foreground/55" />
            <p className="font-mono-hud hud-dim mx-auto max-w-sm text-[13px] leading-relaxed">
              No students yet. Add your roster. Each student&apos;s school
              email is how their work on share links comes back to you.
            </p>
            <button
              onClick={() => setSettingsOpen(true)}
              className="font-mono-hud hud-text mx-auto mt-5 flex h-10 items-center gap-2 rounded-full border border-foreground/30 px-5 text-foreground transition hover:border-foreground/60"
            >
              <Plus size={13} />
              Add students
            </button>
          </div>
        )}
      </div>

      {activeStudent && (
        <StudentDetail
          student={activeStudent}
          stat={stats.get(activeStudent.id) ?? null}
          onClose={() => setOpenStudent(null)}
          onSend={() => sendReport(activeStudent)}
          sending={sending === activeStudent.id}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          students={studentsQ.data?.students ?? []}
          defaultClassId={selectedClassId}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {chatOpen && (
        <ChatPanel
          students={students}
          stats={stats}
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}

const LegendDot = ({
  cls,
  label,
  icon,
}: {
  cls: string;
  label: string;
  icon?: React.ReactNode;
}) => (
  <span className="flex items-center gap-2">
    <span className={`h-2.5 w-2.5 rounded-sm ${cls}`} />
    {icon}
    {label}
  </span>
);

/* ----------------------------- Student Detail ----------------------------- */

const StudentDetail = ({
  student,
  stat,
  onClose,
  onSend,
  sending,
}: {
  student: EducatorStudent;
  stat: StudentStat | null;
  onClose: () => void;
  onSend: () => void;
  sending: boolean;
}) => {
  const history = stat?.history ?? [];
  const reportsQ = useParentReports(student.id);
  const reports = reportsQ.data?.reports ?? [];
  return (
    <EduDrawer title="Student" onClose={onClose}>
      <div className="flex items-center gap-4">
        <Avatar name={student.name} size="lg" />
        <div>
          <div className="text-xl text-foreground">{student.name}</div>
          <div className="font-mono-hud hud-dim mt-1 text-[13px]">
            {stat?.avg !== null && stat?.avg !== undefined
              ? `${stat.avg}% average`
              : "No graded work yet"}
          </div>
        </div>
      </div>

      <div className="mt-8">
        <div className="font-mono-hud hud-dim mb-2 text-[12px] tracking-[0.2em]">
          RECENT GRADES
        </div>
        <div className="flex items-center gap-1">
          {history.length === 0 && (
            <span className="font-mono-hud hud-dim text-[13px]">No data yet</span>
          )}
          {history.map((p, i) => (
            <span
              key={i}
              title={`${p.title}: ${p.grade}%`}
              className={`h-7 w-4 rounded-sm ${toneFor(p.grade)}`}
            />
          ))}
        </div>
      </div>

      {stat && stat.perAssignment.length > 0 && (
        <div className="mt-8">
          <div className="font-mono-hud hud-dim mb-2 text-[12px] tracking-[0.2em]">
            ASSIGNMENTS
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
            {stat.perAssignment.map((pa, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 rounded-md border border-foreground/10 bg-foreground/[0.02] px-3 py-2"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/85">
                  {pa.title}
                </span>
                <span className="font-mono-hud text-[12px] text-foreground/70">
                  {pa.grade !== null
                    ? `${pa.grade}%`
                    : pa.submitted
                      ? "TURNED IN"
                      : "-"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 space-y-3">
        <Field label="Student email" value={student.studentEmail} />
        <Field label="Parent email" value={student.parentEmail} />
      </div>

      {/* Report history — AI-written, logged only (no email delivery yet) */}
      <div className="mt-8 flex min-h-0 flex-1 flex-col">
        <div className="font-mono-hud hud-dim mb-2 text-[12px] tracking-[0.2em]">
          PARENT REPORTS · LOGGED, NOT EMAILED
        </div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
          {reports.length === 0 && (
            <p className="font-mono-hud hud-dim text-[13px]">
              {reportsQ.isLoading ? "Loading…" : "None logged yet."}
            </p>
          )}
          {reports.map((r) => (
            <div
              key={r.id}
              className="rounded-md border border-foreground/10 bg-foreground/[0.02] p-3"
            >
              <div className="font-mono-hud hud-dim text-[11px] tracking-[0.15em]">
                {new Date(r.sentAt)
                  .toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                  .toUpperCase()}{" "}
                · {r.periodStart} → {r.periodEnd}
              </div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-foreground/85">
                {r.summary}
              </p>
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={onSend}
        disabled={sending}
        className="font-mono-hud hud-text mt-6 flex h-12 shrink-0 items-center justify-center gap-2 rounded-full border border-foreground/30 text-foreground transition hover:border-foreground/60 disabled:opacity-50"
      >
        {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
        Log parent report
      </button>
    </EduDrawer>
  );
};

const Field = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
    <div className="font-mono-hud hud-dim text-[11px] tracking-[0.2em]">
      {label.toUpperCase()}
    </div>
    <div className="font-mono-hud mt-1 text-sm text-foreground">{value}</div>
  </div>
);

/* ----------------------------- Settings Panel ----------------------------- */

const SettingsPanel = ({
  students,
  defaultClassId,
  onClose,
}: {
  students: EducatorStudent[];
  defaultClassId: string | null;
  onClose: () => void;
}) => {
  const [name, setName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [newClassId, setNewClassId] = useState<string | null>(defaultClassId);
  const { user } = useAuthUser();
  const { classes } = useEduClass();
  const createStudent = useCreateStudent();

  const addStudent = async () => {
    if (!name.trim() || !studentEmail.trim() || !parentEmail.trim()) {
      toast("Fill in all three fields.");
      return;
    }
    try {
      await createStudent.mutateAsync({
        name: name.trim(),
        studentEmail: studentEmail.trim(),
        parentEmail: parentEmail.trim(),
        classId: newClassId,
      });
      setName("");
      setStudentEmail("");
      setParentEmail("");
    } catch (e) {
      toast(`Could not add: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  return (
    <EduDrawer title="Settings" width="max-w-2xl" onClose={onClose}>
      <div className="flex-1 space-y-8 overflow-y-auto pr-1">
        {/* Profile */}
        <section>
          <div className="font-mono-hud hud-dim mb-3 text-[12px] tracking-[0.2em]">
            PROFILE
          </div>
          <div className="flex items-center gap-3 rounded-md border border-foreground/10 bg-foreground/[0.03] p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-foreground/15 text-foreground/70">
              <User size={18} />
            </div>
            <div>
              <div className="text-sm text-foreground">
                {user?.displayName ?? "Teacher"}
              </div>
              <div className="font-mono-hud hud-dim text-[12px]">
                {user?.email ?? ""}
              </div>
            </div>
          </div>
        </section>

        {/* Classes */}
        <ClassesSection classes={classes} />

        {/* Add student */}
        <section>
          <div className="font-mono-hud hud-dim mb-3 text-[12px] tracking-[0.2em]">
            ADD STUDENT
          </div>
          <p className="mb-3 text-[13px] leading-relaxed text-foreground/65">
            The school email is how students turn in work from a share link.
            It must match what they type.
          </p>
          <div className="space-y-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="h-11 w-full rounded-md border border-foreground/15 bg-foreground/[0.03] px-4 text-sm text-foreground placeholder:text-foreground/55 focus:border-foreground/40 focus:outline-none"
            />
            <input
              value={studentEmail}
              onChange={(e) => setStudentEmail(e.target.value)}
              placeholder="Student school email"
              type="email"
              className="h-11 w-full rounded-md border border-foreground/15 bg-foreground/[0.03] px-4 text-sm text-foreground placeholder:text-foreground/55 focus:border-foreground/40 focus:outline-none"
            />
            <input
              value={parentEmail}
              onChange={(e) => setParentEmail(e.target.value)}
              placeholder="Parent email"
              type="email"
              className="h-11 w-full rounded-md border border-foreground/15 bg-foreground/[0.03] px-4 text-sm text-foreground placeholder:text-foreground/55 focus:border-foreground/40 focus:outline-none"
            />
            {classes.length > 0 && (
              <select
                value={newClassId ?? ""}
                onChange={(e) => setNewClassId(e.target.value || null)}
                className="font-mono-hud h-11 w-full rounded-md border border-foreground/15 bg-foreground/[0.03] px-4 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
              >
                <option value="">No class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={addStudent}
              disabled={createStudent.isPending}
              className="font-mono-hud hud-text mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-full border border-foreground/30 text-foreground transition hover:border-foreground/60 disabled:opacity-50"
            >
              {createStudent.isPending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Plus size={14} />
              )}{" "}
              Add
            </button>
          </div>
        </section>

        {/* Roster — full edit lives here, the management hub */}
        <section>
          <div className="font-mono-hud hud-dim mb-3 text-[12px] tracking-[0.2em]">
            ROSTER · {students.length}
          </div>
          <div className="space-y-1.5">
            {students.map((s) => (
              <RosterRow key={s.id} s={s} classes={classes} />
            ))}
            {students.length === 0 && (
              <p className="font-mono-hud hud-dim text-[13px]">No students yet.</p>
            )}
          </div>
        </section>
      </div>
    </EduDrawer>
  );
};

/* ----------------------------- Roster Row ----------------------------- */

const RosterRow = ({
  s,
  classes,
}: {
  s: EducatorStudent;
  classes: EducatorClass[];
}) => {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [name, setName] = useState(s.name);
  const [studentEmail, setStudentEmail] = useState(s.studentEmail);
  const [parentEmail, setParentEmail] = useState(s.parentEmail);
  const update = useUpdateStudent();
  const del = useDeleteStudent();

  // Seed the fields from current props when opening the editor (the
  // collapsed row reads props directly, so no sync effect is needed).
  const openEdit = () => {
    setName(s.name);
    setStudentEmail(s.studentEmail);
    setParentEmail(s.parentEmail);
    setEditing(true);
  };

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  const save = async () => {
    if (!name.trim() || !studentEmail.trim() || !parentEmail.trim()) {
      toast("Name and both emails are required.");
      return;
    }
    try {
      await update.mutateAsync({
        id: s.id,
        name: name.trim(),
        studentEmail: studentEmail.trim(),
        parentEmail: parentEmail.trim(),
      });
      setEditing(false);
    } catch (e) {
      toast(`Could not save: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  if (editing) {
    return (
      <div className="space-y-2 rounded-md border border-foreground/20 bg-foreground/[0.04] p-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          className="h-9 w-full rounded-md border border-foreground/15 bg-foreground/[0.03] px-3 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
        />
        <input
          value={studentEmail}
          onChange={(e) => setStudentEmail(e.target.value)}
          placeholder="Student school email"
          type="email"
          className="h-9 w-full rounded-md border border-foreground/15 bg-foreground/[0.03] px-3 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
        />
        <input
          value={parentEmail}
          onChange={(e) => setParentEmail(e.target.value)}
          placeholder="Parent email"
          type="email"
          className="h-9 w-full rounded-md border border-foreground/15 bg-foreground/[0.03] px-3 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
        />
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setEditing(false)}
            className="font-mono-hud hud-text flex h-8 items-center gap-1.5 rounded-full border border-foreground/15 px-3 text-foreground/80 transition hover:border-foreground/35 hover:text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={update.isPending}
            className="font-mono-hud hud-text flex h-8 items-center gap-1.5 rounded-full border border-foreground/30 px-3 text-foreground transition hover:border-foreground/60 disabled:opacity-50"
          >
            {update.isPending ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Check size={12} />
            )}
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-foreground/10 bg-foreground/[0.03] p-3">
      <div className="min-w-0">
        <div className="truncate text-sm text-foreground">{s.name}</div>
        <div className="font-mono-hud hud-dim truncate text-[12px]">
          {s.studentEmail}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {classes.length > 0 && (
          <select
            value={s.classId ?? ""}
            onChange={(e) =>
              update.mutate({ id: s.id, classId: e.target.value || null })
            }
            className="font-mono-hud h-8 max-w-[130px] rounded-md border border-foreground/15 bg-foreground/[0.04] px-2 text-[12px] text-foreground focus:border-foreground/40 focus:outline-none"
            aria-label={`Class for ${s.name}`}
          >
            <option value="">No class</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={openEdit}
          className="text-foreground/55 transition hover:text-foreground"
          aria-label={`Edit ${s.name}`}
        >
          <Pencil size={13} />
        </button>
        {confirming ? (
          <button
            onClick={() =>
              del.mutate(s.id, {
                onError: (e) =>
                  toast(e instanceof Error ? e.message : "Could not remove."),
              })
            }
            className="font-mono-hud rounded-full border border-destructive/60 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-destructive transition hover:bg-destructive/10"
          >
            Remove?
          </button>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="text-foreground/55 transition hover:text-foreground"
            aria-label={`Remove ${s.name}`}
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
};

/* ----------------------------- Classes Section ----------------------------- */

const ClassesSection = ({ classes }: { classes: EducatorClass[] }) => {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const createClass = useCreateClass();
  const renameClass = useRenameClass();
  const deleteClass = useDeleteClass();

  const add = async () => {
    if (!newName.trim()) return;
    try {
      await createClass.mutateAsync(newName.trim());
      setNewName("");
    } catch (e) {
      toast(`Could not add class: ${e instanceof Error ? e.message : "unknown"}`);
    }
  };

  const commitRename = async (id: string) => {
    if (!editName.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await renameClass.mutateAsync({ id, name: editName.trim() });
    } catch (e) {
      toast(`Could not rename: ${e instanceof Error ? e.message : "unknown"}`);
    } finally {
      setEditingId(null);
    }
  };

  return (
    <section>
      <div className="font-mono-hud hud-dim mb-3 text-[12px] tracking-[0.2em]">
        CLASSES · {classes.length}
      </div>
      <p className="mb-3 text-[13px] leading-relaxed text-foreground/65">
        Group students and homework into periods or sections. Deleting a class
        keeps its students and homework. They just become unassigned.
      </p>
      <div className="mb-2 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="New class name (e.g. Period 3)"
          className="h-10 flex-1 rounded-md border border-foreground/15 bg-foreground/[0.03] px-4 text-sm text-foreground placeholder:text-foreground/55 focus:border-foreground/40 focus:outline-none"
        />
        <button
          onClick={add}
          disabled={createClass.isPending || !newName.trim()}
          className="font-mono-hud hud-text flex h-10 items-center gap-1.5 rounded-full border border-foreground/30 px-4 text-foreground transition hover:border-foreground/60 disabled:opacity-50"
        >
          <Plus size={13} />
          Add
        </button>
      </div>
      <div className="space-y-1.5">
        {classes.map((c) => (
          <div
            key={c.id}
            className="flex items-center justify-between gap-2 rounded-md border border-foreground/10 bg-foreground/[0.03] p-2.5"
          >
            {editingId === c.id ? (
              <input
                value={editName}
                autoFocus
                onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(c.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                onBlur={() => commitRename(c.id)}
                className="h-8 flex-1 rounded-md border border-foreground/20 bg-foreground/[0.05] px-2 text-sm text-foreground focus:border-foreground/40 focus:outline-none"
              />
            ) : (
              <button
                onClick={() => {
                  setEditingId(c.id);
                  setEditName(c.name);
                }}
                className="flex-1 truncate text-left text-sm text-foreground hover:text-foreground"
                title="Click to rename"
              >
                {c.name}
              </button>
            )}
            {confirmId === c.id ? (
              <button
                onClick={() => {
                  deleteClass.mutate(c.id, {
                    onError: (e) =>
                      toast(e instanceof Error ? e.message : "Could not delete."),
                  });
                  setConfirmId(null);
                }}
                className="font-mono-hud rounded-full border border-destructive/60 px-2.5 py-1 text-[11px] uppercase tracking-[0.12em] text-destructive transition hover:bg-destructive/10"
              >
                Delete?
              </button>
            ) : (
              <button
                onClick={() => setConfirmId(c.id)}
                className="text-foreground/55 transition hover:text-foreground"
                aria-label={`Delete ${c.name}`}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {classes.length === 0 && (
          <p className="font-mono-hud hud-dim text-[13px]">No classes yet.</p>
        )}
      </div>
    </section>
  );
};

/* ----------------------------- Chat Panel ----------------------------- */

type ChatMsg = { role: "user" | "assistant"; content: string };

const ChatPanel = ({
  students,
  stats,
  onClose,
}: {
  students: EducatorStudent[];
  stats: Map<string, StudentStat>;
  onClose: () => void;
}) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [busy, setBusy] = useState(false);

  const context = useMemo(
    () => ({
      students: students.map((s) => {
        const st = stats.get(s.id);
        return {
          name: s.name,
          average: st?.avg ?? null,
          assignments_graded: st?.count ?? 0,
          last_turned_in: st?.lastAt ?? null,
          assignments: (st?.perAssignment ?? []).map((pa) => ({
            title: pa.title,
            grade: pa.grade,
            turned_in: pa.submitted,
          })),
        };
      }),
    }),
    [students, stats]
  );

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setInput("");
    setBusy(true);

    try {
      const res = await fetch("/api/educators/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next, context }),
      });
      if (!res.ok || !res.body) {
        toast("Could not reach Athena.");
        setBusy(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const j = JSON.parse(data) as { token?: string; error?: string };
            if (j.error) {
              toast("Chat error.");
              continue;
            }
            if (j.token) {
              acc += j.token;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: acc };
                return copy;
              });
            }
          } catch {
            /* ignore partial frames */
          }
        }
      }
    } catch {
      toast("Chat error.");
    } finally {
      setBusy(false);
    }
  };

  const suggestions = [
    "Who is struggling the most?",
    "Who hasn't turned in the latest homework?",
    "Which students improved recently?",
  ];

  return (
    <EduDrawer title="Ask Athena" onClose={onClose} noPadding>
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        {messages.length === 0 && (
          <div className="space-y-3">
            <div className="font-mono-hud hud-dim text-[12px] tracking-[0.2em]">
              ASK ABOUT YOUR STUDENTS
            </div>
            {suggestions.map((q) => (
              <button
                key={q}
                onClick={() => setInput(q)}
                className="block w-full rounded-md border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-left text-sm text-foreground/80 transition hover:border-foreground/30 hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-md px-4 py-3 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-6 border border-foreground/15 bg-foreground/[0.05] text-foreground"
                : "mr-6 border border-foreground/10 bg-foreground/[0.02] text-foreground/85"
            }`}
          >
            {m.content ||
              (busy ? <Loader2 size={13} className="animate-spin" /> : "")}
          </div>
        ))}
      </div>

      <div className="border-t border-foreground/10 p-4">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask about grades, students, trends..."
            rows={2}
            className="flex-1 resize-none rounded-md border border-foreground/15 bg-foreground/[0.03] px-4 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-foreground/55 focus:border-foreground/40 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-foreground/30 text-foreground transition hover:border-foreground/60 disabled:opacity-50"
            aria-label="Send"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          </button>
        </div>
      </div>
    </EduDrawer>
  );
};
