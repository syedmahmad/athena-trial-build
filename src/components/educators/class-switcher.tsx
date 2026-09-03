"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Layers } from "lucide-react";
import { ALL_CLASSES, useEduClass } from "@/components/educators/class-context";

/** Header dropdown that filters every teacher page by class. Hidden until
 *  the teacher has created at least one class — single-class teachers never
 *  see it (the surface works exactly as before).
 *
 *  The menu is portaled to <body> so it clears the page content's stacking
 *  context (the teacher shell header and the page <section> are sibling
 *  z-10 contexts; an in-header absolute menu would paint under the page,
 *  while the overlay drawers must still paint over the header). See the
 *  portal-popovers convention. */
export function ClassSwitcher() {
  const { classes, selected, setSelected, selectedClass } = useEduClass();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position the portaled menu under the button (right-aligned). The
  // `rect &&` render gate means the menu only paints once positioned.
  useEffect(() => {
    if (open && btnRef.current) setRect(btnRef.current.getBoundingClientRect());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        btnRef.current?.contains(t) ||
        menuRef.current?.contains(t)
      )
        return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const reposition = () => setOpen(false);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  if (classes.length === 0) return null;

  const label = selectedClass?.name ?? "All classes";

  const pick = (id: string) => {
    setSelected(id);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className="font-mono-hud hud-text flex h-9 items-center gap-2 rounded-full border border-foreground/15 px-4 text-foreground/85 transition hover:border-foreground/40 hover:text-foreground"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Layers size={13} />
        <span className="max-w-[160px] truncate normal-case tracking-normal">
          {label}
        </span>
        <ChevronDown
          size={13}
          className={`transition ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className="edu-theme fixed z-[60] w-60 overflow-hidden rounded-lg border border-foreground/15 bg-background py-1 shadow-xl shadow-black/40"
            style={{
              top: rect.bottom + 8,
              right: Math.max(8, window.innerWidth - rect.right),
            }}
          >
            <SwitcherRow
              label="All classes"
              active={selected === ALL_CLASSES}
              onClick={() => pick(ALL_CLASSES)}
            />
            <div className="my-1 h-px bg-foreground/10" />
            {classes.map((c) => (
              <SwitcherRow
                key={c.id}
                label={c.name}
                active={selected === c.id}
                onClick={() => pick(c.id)}
              />
            ))}
          </div>,
          document.body
        )}
    </>
  );
}

const SwitcherRow = ({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) => (
  <button
    role="option"
    aria-selected={active}
    onClick={onClick}
    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[14px] transition hover:bg-foreground/[0.06] ${
      active ? "text-foreground" : "text-foreground/75"
    }`}
  >
    <span className="truncate">{label}</span>
    {active && <Check size={14} className="shrink-0 text-foreground/70" />}
  </button>
);
