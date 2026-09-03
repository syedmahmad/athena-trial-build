import { Clock } from "lucide-react";

export function SpeedInsight({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-athena-navy/5 text-athena-navy">
        <Clock className="h-5 w-5" />
      </span>
      <p className="text-sm leading-snug text-foreground">{text}</p>
    </div>
  );
}
