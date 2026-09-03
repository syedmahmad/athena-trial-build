import { Suspense } from "react";
import { PrintSheet } from "@/components/educators/print-sheet";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <PrintSheet assignmentId={id} />
    </Suspense>
  );
}
