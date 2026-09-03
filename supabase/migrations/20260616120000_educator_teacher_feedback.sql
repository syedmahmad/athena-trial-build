-- Separate AI feedback from the teacher's own feedback on a submission.
-- `feedback` keeps holding the AI grader's note (written by AI grading /
-- simulate); `teacher_feedback` is the teacher's own comment, edited in the
-- grading view. The teacher's edit no longer overwrites the AI note.
alter table public.educator_submissions
  add column if not exists teacher_feedback text;

comment on column public.educator_submissions.teacher_feedback is
  'Teacher-authored feedback, separate from the AI grader''s feedback column.';
