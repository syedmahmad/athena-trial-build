"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PostLearningRedirect() {
  const params = useParams<{ topicSlug: string; subtopicSlug: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(
      `/learning/${params.topicSlug}/${params.subtopicSlug}/micro-lesson`
    );
  }, [router, params.topicSlug, params.subtopicSlug]);

  return null;
}
