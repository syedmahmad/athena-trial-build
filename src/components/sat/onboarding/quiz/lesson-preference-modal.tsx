"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BookOpen, ListTodo } from "lucide-react";

export function LessonPreferenceModal({
  open,
  onSelect,
}: {
  open: boolean;
  onSelect: (preference: "view_now" | "queue_for_later") => void;
}) {
  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>How would you like to learn?</DialogTitle>
          <DialogDescription>
            When you get a question wrong, we create an interactive lesson
            to help you understand the concept. How would you like to
            handle these?
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
          <Button
            variant="outline"
            className="h-auto flex-col gap-2 p-4"
            onClick={() => onSelect("view_now")}
          >
            <BookOpen className="h-6 w-6 text-athena-amber" />
            <span className="font-semibold">View now</span>
            <span className="text-xs text-muted-foreground">
              Learn the concept immediately
            </span>
          </Button>
          <Button
            variant="outline"
            className="h-auto flex-col gap-2 p-4"
            onClick={() => onSelect("queue_for_later")}
          >
            <ListTodo className="h-6 w-6 text-athena-navy dark:text-athena-navy-light" />
            <span className="font-semibold">Queue for later</span>
            <span className="text-xs text-muted-foreground">
              Finish the quiz first, learn after
            </span>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
