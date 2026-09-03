export type LessonSection =
  | { type: "explanation"; title: string; content: string }
  | { type: "walkthrough"; title: string; steps: string[] }
  | { type: "insight"; title: string; content: string };

export type LessonContent = {
  sections: LessonSection[];
};
