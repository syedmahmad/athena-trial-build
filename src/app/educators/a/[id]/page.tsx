import { AssignmentView } from "@/components/educators/assignment-view";

// Public student-facing assignment page, reached via an unguessable share
// link. Intentionally not Clerk-gated.
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssignmentView assignmentId={id} />;
}
