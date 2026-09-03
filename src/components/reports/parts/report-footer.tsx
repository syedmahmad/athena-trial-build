export function ReportFooter({ generatedAt }: { generatedAt: string }) {
  const stamp = new Date(generatedAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return (
    <footer className="mt-auto flex items-center justify-between border-t border-border/60 pt-4">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-athena-navy text-[10px] font-bold text-athena-amber">
          A
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-foreground">
          Athena
        </span>
      </div>
      <span className="text-[11px] text-muted-foreground">Generated {stamp}</span>
    </footer>
  );
}
