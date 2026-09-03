import { Suspense } from "react";
import { HomeworkPage } from "@/components/educators/homework-page";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <HomeworkPage />
    </Suspense>
  );
}
