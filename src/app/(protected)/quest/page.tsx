"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuestContext } from "@/components/daily-quest/quest-context";

export default function QuestPage() {
  const router = useRouter();
  const { currentIndex } = useQuestContext();

  useEffect(() => {
    router.replace(`/quest/${currentIndex + 1}`);
  }, [router, currentIndex]);

  return null;
}
