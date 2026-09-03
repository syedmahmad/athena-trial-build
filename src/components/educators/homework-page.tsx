"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  Trash2,
  CalendarDays,
  Search,
  ExternalLink,
  Check,
  Pencil,
  CopyPlus,
  Printer,
  List,
  ChevronLeft,
  ChevronRight,
  Library,
  KeyRound,
  Layers,
  Send,
  Copy,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  useDeleteAssignment,
  useEducatorAssignments,
  useSendAssignment,
  type EducatorAssignment,
} from "@/hooks/use-educators";
import { AssignmentEditor } from "@/components/educators/assignment-editor";
import { formatShortDate, formatLongDate, ymd } from "@/lib/educators";
import { inSelectedClass, useEduClass } from "@/components/educators/class-context";

type EditorState =
  | { kind: "closed" }
  | { kind: "new"; initialDue?: string }
  | { kind: "edit"; assignment: EducatorAssignment }
  | { kind: "reuse"; assignment: EducatorAssignment };

export function HomeworkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Auto-open the editor when arriving from the landing page (?new=1)
  const [editor, setEditor] = useState<EditorState>(() =>
    searchParams.get("new") === "1" ? { kind: "new" } : { kind: "closed" }
  );
  const [view, setView] = useState<"list" | "calendar">(() =>
    searchParams.get("view") === "calendar" ? "calendar" : "list"
  );
  const [query, setQuery] = useState("");

  const { data, isError } = useEducatorAssignments();
  const deleteAssignment = useDeleteAssignment();
  const { selectedClassId, classes } = useEduClass();
  const assignments = useMemo(
    () => inSelectedClass(data?.assignments ?? [], selectedClassId),
    [data, selectedClassId]
  );
  // Only label rows with their class when viewing "All" (and classes exist),
  // otherwise the chip is redundant with the active filter.
  const classNameById = useMemo(() => {
    if (selectedClassId !== null) return null;
    if (classes.length === 0) return null;
    return new Map(classes.map((c) => [c.id, c.name]));
  }, [classes, selectedClassId]);

  useEffect(() => {
    if (isError) toast.error("Failed to load homework.");
  }, [isError]);

  // Strip one-shot params so refresh/back doesn't replay them.
  useEffect(() => {
    if (searchParams.get("new") === "1" || searchParams.get("view")) {
      router.replace("/educators/homework", { scroll: false });
    }
  }, [searchParams, router]);

  const today = ymd(new Date());

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? assignments.filter(
          (a) =>
            a.title.toLowerCase().includes(q) ||
            a.instructions.toLowerCase().includes(q)
        )
      : assignments;

    const upcoming: EducatorAssignment[] = [];
    const past: EducatorAssignment[] = [];
    filtered.forEach((a) => {
      if (a.dueDate >= today) upcoming.push(a);
      else past.push(a);
    });
    past.reverse();
    return { upcoming, past };
  }, [assignments, query, today]);

  const removeAssignment = (id: string) => {
    deleteAssignment.mutate(id, {
      onError: (e) => toast(e instanceof Error ? e.message : "Could not delete."),
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header row: search + view toggle + add */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-foreground/10 bg-foreground/[0.03] px-4">
          <Search size={15} className="text-foreground/55" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search homework"
            className="h-11 w-full bg-transparent text-[15px] text-foreground placeholder:text-foreground/50 focus:outline-none"
          />
        </div>
        <div className="flex rounded-full border border-foreground/10 p-1">
          <ViewButton
            active={view === "list"}
            onClick={() => setView("list")}
            icon={<List size={13} />}
            label="List"
          />
          <ViewButton
            active={view === "calendar"}
            onClick={() => setView("calendar")}
            icon={<CalendarDays size={13} />}
            label="Calendar"
          />
        </div>
        <button
          onClick={() => setEditor({ kind: "new" })}
          className="font-mono-hud hud-text flex h-11 items-center gap-2 rounded-full border border-foreground/30 px-5 text-foreground transition hover:border-foreground/60"
        >
          <Plus size={14} /> New homework
        </button>
      </div>

      {view === "list" ? (
        <div className="flex-1 space-y-8 overflow-y-auto pr-1">
          <Section
            title="Upcoming"
            items={groups.upcoming}
            classNameById={classNameById}
            onRemove={removeAssignment}
            onEdit={(a) => setEditor({ kind: "edit", assignment: a })}
            onReuse={(a) => setEditor({ kind: "reuse", assignment: a })}
          />
          <Section
            title="Past"
            items={groups.past}
            classNameById={classNameById}
            onRemove={removeAssignment}
            onEdit={(a) => setEditor({ kind: "edit", assignment: a })}
            onReuse={(a) => setEditor({ kind: "reuse", assignment: a })}
            dim
          />
          {assignments.length === 0 && (
            <div className="rounded-lg border border-dashed border-foreground/15 p-12 text-center">
              <p className="font-mono-hud hud-dim text-[13px]">
                No homework yet. Click &quot;New homework&quot; to generate one.
              </p>
            </div>
          )}
        </div>
      ) : (
        <CalendarView
          assignments={assignments}
          onDayCreate={(date) => setEditor({ kind: "new", initialDue: date })}
          onOpen={(a) => setEditor({ kind: "edit", assignment: a })}
        />
      )}

      {editor.kind !== "closed" && (
        <AssignmentEditor
          editing={editor.kind === "edit" ? editor.assignment : null}
          prefill={editor.kind === "reuse" ? editor.assignment : null}
          initialDue={editor.kind === "new" ? editor.initialDue : undefined}
          initialClassId={editor.kind === "new" ? selectedClassId : undefined}
          onClose={() => setEditor({ kind: "closed" })}
          onSaved={() => setEditor({ kind: "closed" })}
        />
      )}
    </div>
  );
}

const ViewButton = ({
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
    aria-pressed={active}
  >
    {icon}
    {label}
  </button>
);

const Section = ({
  title,
  items,
  classNameById,
  onRemove,
  onEdit,
  onReuse,
  dim,
}: {
  title: string;
  items: EducatorAssignment[];
  classNameById: Map<string, string> | null;
  onRemove: (id: string) => void;
  onEdit: (a: EducatorAssignment) => void;
  onReuse: (a: EducatorAssignment) => void;
  dim?: boolean;
}) => {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="font-mono-hud hud-dim mb-3 text-[12px] tracking-[0.2em]">
        {title.toUpperCase()} · {items.length}
      </div>
      <div className="space-y-1.5">
        {items.map((a) => (
          <AssignmentRow
            key={a.id}
            a={a}
            dim={dim}
            className={
              a.classId && classNameById ? classNameById.get(a.classId) : undefined
            }
            onRemove={onRemove}
            onEdit={onEdit}
            onReuse={onReuse}
          />
        ))}
      </div>
    </div>
  );
};

const AssignmentRow = ({
  a,
  dim,
  className,
  onRemove,
  onEdit,
  onReuse,
}: {
  a: EducatorAssignment;
  dim?: boolean;
  /** Class label to show in "All classes" view. */
  className?: string;
  onRemove: (id: string) => void;
  onEdit: (a: EducatorAssignment) => void;
  onReuse: (a: EducatorAssignment) => void;
}) => {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);
  const sendMut = useSendAssignment();

  // Auto-cancel the delete confirmation if it sits unanswered.
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(t);
  }, [confirming]);

  // Auto-cancel the send confirmation if it sits unanswered.
  useEffect(() => {
    if (!confirmSend) return;
    const t = setTimeout(() => setConfirmSend(false), 4000);
    return () => clearTimeout(t);
  }, [confirmSend]);

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/educators/a/${a.id}`
      );
      setCopied(true);
      toast("Link copied. Students sign in with their school email to do it.");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Could not copy");
    }
  };

  // First click arms a confirm (emailing real students is a side effect);
  // second click within 4s sends the share link to the roster.
  const sendToStudents = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (sendMut.isPending) return;
    if (!confirmSend) {
      setConfirmSend(true);
      return;
    }
    setConfirmSend(false);
    try {
      const r = await sendMut.mutateAsync(a.id);
      if (r.sent > 0) {
        const extra = [
          r.failed ? `${r.failed} failed` : "",
          r.skipped ? `${r.skipped} skipped` : "",
        ]
          .filter(Boolean)
          .join(", ");
        toast.success(
          `Emailed ${r.sent} student${r.sent === 1 ? "" : "s"}.${
            extra ? ` ${extra}.` : ""
          }`
        );
      } else if (r.total === 0) {
        toast("No students with an email in this class yet.");
      } else {
        toast.error("Could not send. Check that email is configured.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send");
    }
  };

  return (
    <div
      className={`group grid grid-cols-[110px_1fr_auto] items-start gap-4 rounded-md border border-foreground/10 bg-foreground/[0.03] p-4 transition hover:border-foreground/20 ${
        dim ? "opacity-70" : ""
      }`}
    >
      <div className="font-mono-hud flex flex-col gap-1 text-[12px] text-foreground/75">
        <span
          className="hud-dim flex items-center gap-2 text-[11px]"
          title="Assigned date"
        >
          <Send size={11} />
          {formatShortDate(a.assignedDate)}
        </span>
        <span className="flex items-center gap-2" title="Due date">
          <CalendarDays size={13} />
          {formatShortDate(a.dueDate)}
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate text-[15px] text-foreground">{a.title}</div>
          {className && (
            <span className="font-mono-hud inline-flex shrink-0 items-center gap-1 rounded-full border border-foreground/20 bg-foreground/[0.05] px-2 py-0.5 text-[10px] tracking-[0.1em] text-foreground/80">
              <Layers size={9} />
              {className}
            </span>
          )}
          {a.questions && (
            <span className="font-mono-hud inline-flex shrink-0 items-center gap-1 rounded-full border border-foreground/15 px-2 py-0.5 text-[10px] tracking-[0.1em] text-foreground/70">
              <Library size={9} />
              {a.questions.length} Qs · AUTO-GRADED
            </span>
          )}
          {a.answerKey && (
            <span
              className="font-mono-hud inline-flex shrink-0 items-center gap-1 rounded-full border border-foreground/15 px-2 py-0.5 text-[10px] tracking-[0.1em] text-foreground/70"
              title="Has a teacher-only answer key"
            >
              <KeyRound size={9} />
              KEY
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-[13px] text-foreground/65">
          {a.instructions}
        </p>
        <div className="mt-2.5 flex items-center gap-1.5">
          <RowAction
            onClick={sendToStudents}
            icon={
              sendMut.isPending ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Send size={11} />
              )
            }
          >
            {sendMut.isPending
              ? "Sending..."
              : confirmSend
                ? "Confirm send"
                : "Send to students"}
          </RowAction>
          <RowAction onClick={copy} icon={copied ? <Check size={11} /> : <Copy size={11} />}>
            {copied ? "Link copied" : "Copy link"}
          </RowAction>
          <RowAction href={`/educators/a/${a.id}`} icon={<ExternalLink size={11} />}>
            Student view
          </RowAction>
          <RowAction
            href={`/educators/print/${a.id}`}
            icon={<Printer size={11} />}
          >
            Print / PDF
          </RowAction>
          <RowAction onClick={() => onEdit(a)} icon={<Pencil size={11} />}>
            Edit
          </RowAction>
          <RowAction onClick={() => onReuse(a)} icon={<CopyPlus size={11} />}>
            Reuse
          </RowAction>
        </div>
      </div>
      {confirming ? (
        <button
          onClick={() => onRemove(a.id)}
          className="font-mono-hud rounded-full border border-destructive/60 px-3 py-1 text-[11px] uppercase tracking-[0.15em] text-destructive transition hover:bg-destructive/10"
        >
          Delete?
        </button>
      ) : (
        <button
          onClick={() => setConfirming(true)}
          className="text-foreground/45 opacity-0 transition group-hover:opacity-100 hover:text-foreground"
          aria-label="Delete assignment"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
};

const RowAction = ({
  href,
  onClick,
  icon,
  children,
}: {
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) => {
  const cls =
    "font-mono-hud hud-text inline-flex items-center gap-1.5 rounded-full border border-foreground/15 px-3 py-1 text-[12px] text-foreground/80 transition hover:border-foreground/40 hover:text-foreground";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {icon}
        {children}
      </a>
    );
  }
  return (
    <button onClick={onClick} className={cls}>
      {icon}
      {children}
    </button>
  );
};

/* ───────────────────────── Calendar view ───────────────────────── */

const monthLabel = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

const CalendarView = ({
  assignments,
  onDayCreate,
  onOpen,
}: {
  assignments: EducatorAssignment[];
  onDayCreate: (date: string) => void;
  onOpen: (a: EducatorAssignment) => void;
}) => {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selected, setSelected] = useState<string>(() => ymd(new Date()));

  const grid = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const startOffset = first.getDay();
    const daysInMonth = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0
    ).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++)
      cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [cursor]);

  // Each assignment lands on its due-date cell (the actionable date) and, when
  // different, also on its assigned-date cell so teachers see when work goes out.
  const byDate = useMemo(() => {
    const map = new Map<
      string,
      { due: EducatorAssignment[]; assigned: EducatorAssignment[] }
    >();
    const bucket = (k: string) => {
      if (!map.has(k)) map.set(k, { due: [], assigned: [] });
      return map.get(k)!;
    };
    assignments.forEach((a) => {
      bucket(a.dueDate).due.push(a);
      if (a.assignedDate && a.assignedDate !== a.dueDate)
        bucket(a.assignedDate).assigned.push(a);
    });
    return map;
  }, [assignments]);

  const selectedDay = byDate.get(selected);
  const selectedAssignments = selectedDay?.due ?? [];
  const selectedAssigned = selectedDay?.assigned ?? [];
  const today = ymd(new Date());

  return (
    <div className="grid flex-1 grid-cols-1 gap-10 lg:grid-cols-[1fr_320px]">
      <div className="flex flex-col">
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
            }
            className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/10 text-foreground/75 transition hover:border-foreground/30 hover:text-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft size={15} />
          </button>
          <h2 className="font-mono-hud text-lg tracking-tight text-foreground">
            {monthLabel(cursor)}
          </h2>
          <button
            onClick={() =>
              setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
            }
            className="flex h-9 w-9 items-center justify-center rounded-full border border-foreground/10 text-foreground/75 transition hover:border-foreground/30 hover:text-foreground"
            aria-label="Next month"
          >
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="font-mono-hud hud-dim mb-2 grid grid-cols-7 gap-px text-[12px] tracking-[0.2em]">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} className="px-2 py-1">
              {d}
            </div>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-7 gap-px overflow-hidden rounded-lg border border-foreground/10 bg-foreground/5">
          {grid.map((d, i) => {
            if (!d)
              return <div key={i} className="min-h-[92px] bg-background/40" />;
            const k = ymd(d);
            const day = byDate.get(k);
            const items = day?.due ?? [];
            const assignedItems = day?.assigned ?? [];
            const isSelected = selected === k;
            const isToday = today === k;
            return (
              <div
                key={i}
                role="button"
                tabIndex={0}
                onClick={() => setSelected(k)}
                onDoubleClick={() => onDayCreate(k)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setSelected(k);
                }}
                className={`group relative min-h-[92px] cursor-pointer bg-background p-2 text-left transition hover:bg-foreground/[0.04] ${
                  isSelected ? "ring-1 ring-foreground/50" : ""
                }`}
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`font-mono-hud text-[12px] ${
                      isToday ? "text-foreground" : "text-foreground/70"
                    }`}
                  >
                    {d.getDate()}
                    {isToday && (
                      <span className="ml-1 inline-block h-1 w-1 rounded-full bg-foreground align-middle" />
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDayCreate(k);
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded-full border border-foreground/15 text-foreground/60 opacity-0 transition hover:border-foreground/40 hover:text-foreground group-hover:opacity-100"
                    aria-label={`New homework due ${k}`}
                    title="New homework due this day"
                  >
                    <Plus size={10} />
                  </button>
                </div>
                <div className="mt-1 space-y-1">
                  {items.slice(0, 2).map((a) => (
                    <button
                      key={a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(a);
                      }}
                      className="block w-full truncate rounded-sm border border-foreground/15 bg-foreground/[0.04] px-1.5 py-0.5 text-left text-[11px] text-foreground/85 transition hover:border-foreground/40"
                      title={`Due: "${a.title}"`}
                    >
                      {a.title}
                    </button>
                  ))}
                  {items.length > 2 && (
                    <div className="font-mono-hud hud-dim text-[10px]">
                      +{items.length - 2}
                    </div>
                  )}
                  {assignedItems.slice(0, 2).map((a) => (
                    <button
                      key={`asg-${a.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(a);
                      }}
                      className="flex w-full items-center gap-1 truncate rounded-sm border border-dashed border-foreground/15 px-1.5 py-0.5 text-left text-[11px] text-foreground/55 transition hover:border-foreground/35"
                      title={`Assigned: "${a.title}"`}
                    >
                      <Send size={9} className="shrink-0" />
                      <span className="truncate">{a.title}</span>
                    </button>
                  ))}
                  {assignedItems.length > 2 && (
                    <div className="font-mono-hud hud-dim text-[10px]">
                      +{assignedItems.length - 2} assigned
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="font-mono-hud hud-dim mt-3 text-[11px] tracking-[0.15em]">
          CLICK A TITLE TO EDIT · USE + (OR DOUBLE-CLICK A DAY) TO ASSIGN
        </p>
      </div>

      {/* Side panel: selected day */}
      <aside className="flex flex-col">
        <div className="font-mono-hud hud-dim mb-4 flex items-center gap-2 text-[12px] tracking-[0.15em]">
          <CalendarDays size={13} />
          {formatLongDate(selected).toUpperCase()}
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto pr-1">
          {selectedAssignments.length === 0 && selectedAssigned.length === 0 && (
            <p className="font-mono-hud hud-dim text-[13px]">
              Nothing due or assigned this day.
            </p>
          )}
          {selectedAssignments.map((a) => (
            <button
              key={a.id}
              onClick={() => onOpen(a)}
              className="block w-full rounded-md border border-foreground/10 bg-foreground/[0.03] p-3 text-left transition hover:border-foreground/30"
            >
              <div className="text-[15px] text-foreground">{a.title}</div>
              <p className="mt-1 line-clamp-3 text-[13px] text-foreground/65">
                {a.instructions}
              </p>
            </button>
          ))}
          {selectedAssigned.length > 0 && (
            <>
              <div className="font-mono-hud hud-dim flex items-center gap-2 pt-2 text-[11px] tracking-[0.15em]">
                <Send size={11} />
                ASSIGNED THIS DAY
              </div>
              {selectedAssigned.map((a) => (
                <button
                  key={`asg-${a.id}`}
                  onClick={() => onOpen(a)}
                  className="block w-full rounded-md border border-dashed border-foreground/10 p-3 text-left transition hover:border-foreground/30"
                >
                  <div className="text-[15px] text-foreground/80">{a.title}</div>
                  <p className="font-mono-hud hud-dim mt-1 text-[11px] tracking-[0.1em]">
                    DUE {formatShortDate(a.dueDate).toUpperCase()}
                  </p>
                </button>
              ))}
            </>
          )}
        </div>

        <button
          onClick={() => onDayCreate(selected)}
          className="font-mono-hud hud-text mt-4 flex h-11 items-center justify-center gap-2 rounded-full border border-foreground/30 text-foreground transition hover:border-foreground/60"
        >
          <Plus size={13} />
          New homework due {formatShortDate(selected)}
        </button>
      </aside>
    </div>
  );
};
