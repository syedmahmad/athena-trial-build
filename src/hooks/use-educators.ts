"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AssignmentQuestion,
  EducatorAssignment,
  EducatorClass,
  EducatorStudent,
  EducatorSubmission,
  FreeResponseQuestion,
  ParentReport,
  QuizQuestion,
} from "@/lib/db/queries/educators";

export type {
  AssignmentQuestion,
  EducatorAssignment,
  EducatorClass,
  EducatorStudent,
  EducatorSubmission,
  FreeResponseQuestion,
  ParentReport,
  QuizQuestion,
};

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ─── Queries ─────────────────────────────────────────────────────────────

export function useEducatorClasses() {
  return useQuery({
    queryKey: ["educator", "classes"],
    queryFn: () =>
      fetch("/api/educators/classes").then((r) =>
        jsonOrThrow<{ classes: EducatorClass[] }>(r)
      ),
    staleTime: 60_000,
  });
}

export function useEducatorAssignments() {
  return useQuery({
    queryKey: ["educator", "assignments"],
    queryFn: () =>
      fetch("/api/educators/assignments").then((r) =>
        jsonOrThrow<{ assignments: EducatorAssignment[] }>(r)
      ),
    staleTime: 60_000,
  });
}

export function useEducatorStudents() {
  return useQuery({
    queryKey: ["educator", "students"],
    queryFn: () =>
      fetch("/api/educators/students").then((r) =>
        jsonOrThrow<{ students: EducatorStudent[] }>(r)
      ),
    staleTime: 60_000,
  });
}

export function useEducatorSubmissions() {
  return useQuery({
    queryKey: ["educator", "submissions"],
    queryFn: () =>
      fetch("/api/educators/submissions").then((r) =>
        jsonOrThrow<{ submissions: EducatorSubmission[] }>(r)
      ),
    staleTime: 30_000,
  });
}

// ─── Mutations ───────────────────────────────────────────────────────────

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      title: string;
      instructions: string;
      answerKey?: string | null;
      questions?: QuizQuestion[] | null;
      classId?: string | null;
      assignedDate?: string;
      dueDate: string;
      source?: string;
      prompt?: string | null;
    }) =>
      fetch("/api/educators/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => jsonOrThrow<{ assignment: EducatorAssignment }>(r)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "assignments"] });
    },
  });
}

export function useUpdateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      title?: string;
      instructions?: string;
      answerKey?: string | null;
      classId?: string | null;
      assignedDate?: string;
      dueDate?: string;
    }) =>
      fetch(`/api/educators/assignments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then((r) => jsonOrThrow<{ assignment: EducatorAssignment }>(r)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "assignments"] });
    },
  });
}

export function useDeleteAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/educators/assignments/${id}`, { method: "DELETE" }).then((r) =>
        jsonOrThrow<{ ok: boolean }>(r)
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "assignments"] });
      qc.invalidateQueries({ queryKey: ["educator", "submissions"] });
    },
  });
}

export type SendAssignmentResult = {
  sent: number;
  failed: number;
  total: number;
  skipped: number;
};

/** Email the assignment share link to the rostered students (students only,
 *  scoped to the assignment's class). Read-only on cache — no invalidation. */
export function useSendAssignment() {
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/educators/assignments/${id}/send`, { method: "POST" }).then(
        (r) => jsonOrThrow<SendAssignmentResult>(r)
      ),
  });
}

export function useCreateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      name: string;
      studentEmail: string;
      parentEmail: string;
      classId?: string | null;
    }) =>
      fetch("/api/educators/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => jsonOrThrow<{ student: EducatorStudent }>(r)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "students"] });
    },
  });
}

/** Edit a student (name / emails / class). Send only the fields you change. */
export function useUpdateStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...patch
    }: {
      id: string;
      name?: string;
      studentEmail?: string;
      parentEmail?: string;
      classId?: string | null;
    }) =>
      fetch(`/api/educators/students/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then((r) => jsonOrThrow<{ student: EducatorStudent }>(r)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "students"] });
    },
  });
}

export function useDeleteStudent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/educators/students/${id}`, { method: "DELETE" }).then((r) =>
        jsonOrThrow<{ ok: boolean }>(r)
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "students"] });
      qc.invalidateQueries({ queryKey: ["educator", "submissions"] });
    },
  });
}

/** AI-grade one student's existing submission (409 when nothing submitted). */
export function useAiGrade() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { assignmentId: string; studentId: string }) =>
      fetch("/api/educators/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => jsonOrThrow<{ submission: EducatorSubmission }>(r)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "submissions"] });
    },
  });
}

export interface AssignmentInsight {
  headline: string;
  struggles: string[];
  suggestion: string;
}

/** AI class-level read on one assignment (409 until something is graded). */
export function useAssignmentInsight() {
  return useMutation({
    mutationFn: (assignmentId: string) =>
      fetch("/api/educators/assignment-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId }),
      }).then((r) =>
        jsonOrThrow<{ insight: AssignmentInsight; gradedCount: number }>(r)
      ),
  });
}

/** Explicit demo action: invent + grade a simulated response (badged). */
export function useSimulateSubmission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { assignmentId: string; studentId: string }) =>
      fetch("/api/educators/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => jsonOrThrow<{ submission: EducatorSubmission }>(r)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "submissions"] });
    },
  });
}

export function useSaveSubmissionEdit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      assignmentId: string;
      studentId: string;
      grade: number | null;
      teacherFeedback: string;
    }) =>
      fetch("/api/educators/submissions", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => jsonOrThrow<{ submission: EducatorSubmission }>(r)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "submissions"] });
    },
  });
}

export function useParentReports(studentId: string | null) {
  return useQuery({
    queryKey: ["educator", "reports", studentId],
    queryFn: () =>
      fetch(`/api/educators/reports?studentId=${studentId}`).then((r) =>
        jsonOrThrow<{ reports: ParentReport[] }>(r)
      ),
    enabled: !!studentId,
    staleTime: 30_000,
  });
}

export function useLogParentReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { studentId: string }) =>
      fetch("/api/educators/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then((r) => jsonOrThrow<{ ok: boolean; summary: string }>(r)),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["educator", "reports", vars.studentId] });
    },
  });
}

// ─── Classes ─────────────────────────────────────────────────────────────

export function useCreateClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      fetch("/api/educators/classes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).then((r) => jsonOrThrow<{ class: EducatorClass }>(r)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "classes"] });
    },
  });
}

export function useRenameClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; name: string }) =>
      fetch(`/api/educators/classes/${data.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name }),
      }).then((r) => jsonOrThrow<{ class: EducatorClass }>(r)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "classes"] });
    },
  });
}

/** Delete a class — its students/assignments become unassigned. Refresh
 *  those lists too so the UI reflects the SET NULL. */
export function useDeleteClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/educators/classes/${id}`, { method: "DELETE" }).then((r) =>
        jsonOrThrow<{ ok: boolean }>(r)
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["educator", "classes"] });
      qc.invalidateQueries({ queryKey: ["educator", "students"] });
      qc.invalidateQueries({ queryKey: ["educator", "assignments"] });
    },
  });
}
