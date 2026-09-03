import { Sparkles } from "lucide-react";

export function ScoreContextStrip({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl bg-muted/60 px-4 py-3">
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-athena-amber" />
      <p className="text-sm leading-snug text-foreground">{text}</p>
    </div>
  );
}
