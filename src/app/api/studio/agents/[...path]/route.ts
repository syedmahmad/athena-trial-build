/**
 * Catch-all proxy for Studio agent registry API.
 * Forwards all requests to the agents backend at /studio/agents/*.
 */

import { NextRequest, NextResponse } from "next/server";

const AGENT_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8080";

async function proxyToBackend(
  req: NextRequest,
  params: { path: string[] }
): Promise<NextResponse> {
  const subPath = params.path.join("/");
  const url = new URL(req.url);
  const queryString = url.search;
  const backendUrl = `${AGENT_URL}/studio/agents/${subPath}${queryString}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      body = await req.text();
    } catch {
      // no body
    }
  }

  const backendRes = await fetch(backendUrl, {
    method: req.method,
    headers,
    body,
  });

  const responseBody = await backendRes.text();

  return new NextResponse(responseBody, {
    status: backendRes.status,
    headers: {
      "Content-Type": backendRes.headers.get("Content-Type") || "application/json",
    },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyToBackend(req, await params);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyToBackend(req, await params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyToBackend(req, await params);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyToBackend(req, await params);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyToBackend(req, await params);
}
