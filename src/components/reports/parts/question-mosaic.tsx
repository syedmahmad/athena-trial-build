import { Lightbulb, MessageCircleQuestion } from "lucide-react";
import type { QuizPerQuestion } from "@/lib/reports/types";

function tileTone(q: QuizPerQuestion): {
  bg: string;
  text: string;
  ring: string;
} {
  if (!q.isCorrect) {
    return { bg: "bg-destructive/10", text: "text-destructive", ring: "ring-destructive/20" };
  }
  if (q.hintUsed || q.tutorUsed) {
    return { bg: "bg-athena-amber/15", text: "text-athena-amber", ring: "ring-athena-amber/20" };
  }
  return { bg: "bg-athena-success/15", text: "text-athena-success", ring: "ring-athena-success/20" };
}

export function QuestionMosaic({ perQuestion }: { perQuestion: QuizPerQuestion[] }) {
  return (
    <div
      data-testid="question-mosaic"
      className="grid grid-cols-10 gap-2"
    >
      {perQuestion.map((q) => {
        const tone = tileTone(q);
        return (
          <div
            key={q.index}
            data-tile
            data-correct={q.isCorrect}
            className={`relative flex h-11 w-11 items-center justify-center rounded-lg ring-1 ${tone.bg} ${tone.ring}`}
          >
            <span className={`text-xs font-semibold ${tone.text}`}>
              Q{q.index + 1}
            </span>
            {q.hintUsed ? (
              <Lightbulb className="absolute -right-1 -top-1 h-3.5 w-3.5 text-athena-amber drop-shadow-sm" strokeWidth={2.5} />
            ) : null}
            {q.tutorUsed ? (
              <MessageCircleQuestion className="absolute -bottom-1 -right-1 h-3.5 w-3.5 text-athena-navy drop-shadow-sm" strokeWidth={2.5} />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
