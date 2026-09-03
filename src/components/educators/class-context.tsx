"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useEducatorClasses, type EducatorClass } from "@/hooks/use-educators";

const STORAGE_KEY = "athena.edu.selectedClass";
/** Sentinel: the "All classes" view (also the default). */
export const ALL_CLASSES = "__all__";

type ClassContextValue = {
  classes: EducatorClass[];
  /** Effective selection (already corrected if the class was deleted). */
  selected: string;
  setSelected: (id: string) => void;
  /** Resolved class id for filtering: null means "All". */
  selectedClassId: string | null;
  /** The selected class object, or null for All / unknown. */
  selectedClass: EducatorClass | null;
  isLoading: boolean;
};

const ClassContext = createContext<ClassContextValue | null>(null);

function readSaved(): string {
  if (typeof window === "undefined") return ALL_CLASSES;
  try {
    return localStorage.getItem(STORAGE_KEY) ?? ALL_CLASSES;
  } catch {
    return ALL_CLASSES;
  }
}

export function EduClassProvider({ children }: { children: React.ReactNode }) {
  const { data, isLoading } = useEducatorClasses();
  const classes = useMemo(() => data?.classes ?? [], [data]);
  // Lazy-init from localStorage. Safe against hydration mismatch: every
  // class-dependent render (switcher, filters) is gated behind React Query
  // data that is absent at hydration, so server and client first-render alike.
  const [raw, setRaw] = useState<string>(readSaved);

  const setSelected = useCallback((id: string) => {
    setRaw(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<ClassContextValue>(() => {
    // Derive the effective selection during render: if the saved class was
    // deleted (and the list has loaded), fall back to All — no effect needed.
    const stillExists = raw === ALL_CLASSES || classes.some((c) => c.id === raw);
    const selected = isLoading || stillExists ? raw : ALL_CLASSES;
    const selectedClassId = selected === ALL_CLASSES ? null : selected;
    return {
      classes,
      selected,
      setSelected,
      selectedClassId,
      selectedClass: classes.find((c) => c.id === selectedClassId) ?? null,
      isLoading,
    };
  }, [classes, raw, setSelected, isLoading]);

  return <ClassContext.Provider value={value}>{children}</ClassContext.Provider>;
}

export function useEduClass() {
  const ctx = useContext(ClassContext);
  if (!ctx) throw new Error("useEduClass must be used within EduClassProvider");
  return ctx;
}

/** Filter helper shared by the pages: keep items in the selected class.
 *  In "All" mode nothing is filtered (unassigned items show too). */
export function inSelectedClass<T extends { classId: string | null }>(
  items: T[],
  selectedClassId: string | null
): T[] {
  if (selectedClassId === null) return items;
  return items.filter((i) => i.classId === selectedClassId);
}
