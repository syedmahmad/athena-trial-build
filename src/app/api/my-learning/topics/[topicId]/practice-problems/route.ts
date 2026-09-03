import { getAuthIdentity, getAppUser } from "@/lib/auth/current-user";
import { NextResponse } from "next/server";
import { getCustomTopicWithQuestions } from "@/lib/db/queries/custom-learning";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ topicId: string }> }
) {
  const { userId: clerkId } = await getAuthIdentity();
  if (!clerkId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await getAppUser(clerkId);
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const { topicId } = await params;
  const result = await getCustomTopicWithQuestions(topicId, user.id);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { topic } = result;

  const agentRes = await fetch(`${AGENT_URL}/practice-problems`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: topic.title, subtopic: topic.title, subject: "general" }),
  });

  if (!agentRes.ok) {
    return NextResponse.json({ error: "Failed to generate practice problems" }, { status: 502 });
  }

  const data = await agentRes.json();
  return NextResponse.json(data);
}
