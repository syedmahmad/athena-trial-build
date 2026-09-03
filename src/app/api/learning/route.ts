import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase/client";
import { getLatestSessionsBySubtopic } from "@/lib/db/queries/tracking";

export async function GET(request: NextRequest) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const subject = request.nextUrl.searchParams.get("subject");

  let topicsQuery = supabase
    .from("topics")
    .select("id, slug, name, icon, color_scheme, overview, estimated_total_minutes, sat_relevance, difficulty_distribution, order_index, subject")
    .order("order_index", { ascending: true });

  if (subject) {
    topicsQuery = topicsQuery.eq("subject", subject);
  }

  const user = await getAppUser(clerkId);

  const [topicsRes, subtopicsRes, sessionMap] = await Promise.all([
    topicsQuery,
    supabase
      .from("subtopics")
      .select("id, topic_id, slug, name, difficulty, estimated_minutes, description, order_index")
      .order("order_index", { ascending: true }),
    user ? getLatestSessionsBySubtopic(user.id) : Promise.resolve(new Map()),
  ]);

  const allTopics = (topicsRes.data ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    icon: t.icon,
    colorScheme: t.color_scheme,
    overview: t.overview,
    estimatedTotalMinutes: t.estimated_total_minutes,
    satRelevance: t.sat_relevance,
    difficultyDistribution: t.difficulty_distribution,
    orderIndex: t.order_index,
    subject: t.subject,
  }));

  const allSubtopics = (subtopicsRes.data ?? []).map((st) => {
    const session = sessionMap.get(st.id);
    return {
      id: st.id,
      topicId: st.topic_id,
      slug: st.slug,
      name: st.name,
      difficulty: st.difficulty,
      estimatedMinutes: st.estimated_minutes,
      description: st.description,
      orderIndex: st.order_index,
      lastVisitedAt: session?.lastVisitedAt ?? null,
      completed: session?.completed ?? false,
      stepsViewed: session?.stepsViewed ?? null,
      totalSteps: session?.totalSteps ?? null,
    };
  });

  const topicsWithSubtopics = allTopics.map((topic) => ({
    ...topic,
    subtopics: allSubtopics.filter((st) => st.topicId === topic.id),
  }));

  return NextResponse.json({ topics: topicsWithSubtopics });
}
