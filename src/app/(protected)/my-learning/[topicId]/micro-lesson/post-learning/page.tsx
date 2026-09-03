"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PostLearningRedirect() {
  const params = useParams<{ topicId: string }>();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/my-learning/${params.topicId}/micro-lesson`);
  }, [router, params.topicId]);

  return null;
}
