/**
 * Proxy for listing all Studio sessions across agents.
 * GET /api/studio/sessions → GET /studio/agents/all-sessions
 */

import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const backendUrl = `${AGENT_URL}/studio/agents/all-sessions${url.search}`;

  const res = await fetch(backendUrl);
  const body = await res.text();

  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
