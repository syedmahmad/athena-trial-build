/**
 * Proxy for Studio agent list/create endpoints.
 * GET /api/studio/agents → GET /studio/agents
 * POST /api/studio/agents → POST /studio/agents
 */

import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const backendUrl = `${AGENT_URL}/studio/agents${url.search}`;

  const res = await fetch(backendUrl);
  const body = await res.text();

  return new NextResponse(body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const res = await fetch(`${AGENT_URL}/studio/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  const responseBody = await res.text();

  return new NextResponse(responseBody, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}
