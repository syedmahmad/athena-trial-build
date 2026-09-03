"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFullSatContext } from "@/components/full-sat/full-sat-context";

export default function FullSatAttemptPage() {
  const router = useRouter();
  const { attempt, currentIndex } = useFullSatContext();

  useEffect(() => {
    router.replace(`/full-sat/${attempt.id}/${currentIndex + 1}`);
  }, [router, attempt.id, currentIndex]);

  return null;
}
