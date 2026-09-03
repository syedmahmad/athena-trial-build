import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { sendEmail } from "@/lib/email/send";
import { authActionEmailHtml } from "@/lib/email/templates";

/**
 * Supabase "Send Email Hook" endpoint — Supabase POSTs every auth email
 * (signup confirmation, magic link, recovery, email change) here instead of
 * sending it itself, so the message goes out through our Resend setup with
 * Athena branding. Public by design: it is not user-authenticated, it is
 * verified by the Standard Webhooks signature using the hook secret.
 *
 * Configure in Supabase: Auth → Hooks → Send Email → HTTPS endpoint
 *   URL    = https://athena.sset.dev/api/auth/send-email-hook
 *   secret = the generated `v1,whsec_…` value → SUPABASE_AUTH_EMAIL_HOOK_SECRET
 *
 * Inert until the Supabase-auth cutover (no Supabase auth emails fire in Clerk
 * mode). Returns a JSON 200 on success; 401/500 with an error body otherwise.
 * (Supabase's hook validator rejects a response with no Content-Type, so even
 * the success/ack responses must be JSON, not an empty body.)
 */
function verifySignature(
  rawBody: string,
  headers: Headers,
  secret: string
): boolean {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const sigHeader = headers.get("webhook-signature");
  if (!id || !timestamp || !sigHeader) return false;

  // Reject stale deliveries (5 min tolerance) to blunt replay.
  const now = Math.floor(Date.now() / 1000);
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > 300) return false;

  // Secret arrives as `v1,whsec_<base64>`; the signing key is the base64 part.
  let s = secret.trim();
  if (s.startsWith("v1,")) s = s.slice(3);
  if (s.startsWith("whsec_")) s = s.slice(6);
  const key = Buffer.from(s, "base64");

  const expected = crypto
    .createHmac("sha256", key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  // Header is a space-separated list of `v<n>,<base64sig>`.
  return sigHeader.split(" ").some((part) => {
    const sig = part.includes(",") ? part.slice(part.indexOf(",") + 1) : part;
    const sigBuf = Buffer.from(sig);
    return (
      sigBuf.length === expectedBuf.length &&
      crypto.timingSafeEqual(sigBuf, expectedBuf)
    );
  });
}

type HookPayload = {
  user?: { email?: string };
  email_data?: {
    token_hash?: string;
    email_action_type?: string;
    redirect_to?: string;
  };
};

export async function POST(req: Request) {
  const secret = process.env.SUPABASE_AUTH_EMAIL_HOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: { http_code: 500, message: "email hook secret not configured" } },
      { status: 500 }
    );
  }

  const raw = await req.text();
  if (!verifySignature(raw, req.headers, secret)) {
    return NextResponse.json(
      { error: { http_code: 401, message: "invalid signature" } },
      { status: 401 }
    );
  }

  let payload: HookPayload;
  try {
    payload = JSON.parse(raw) as HookPayload;
  } catch {
    return NextResponse.json(
      { error: { http_code: 400, message: "invalid payload" } },
      { status: 400 }
    );
  }

  const email = payload.user?.email;
  const data = payload.email_data ?? {};
  const { token_hash, email_action_type, redirect_to } = data;

  // Notification-type events carry no actionable link — acknowledge so auth
  // is never blocked, but send nothing.
  if (!email || !token_hash || !email_action_type) {
    return NextResponse.json({}, { status: 200 });
  }

  const base =
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const link =
    `${base}/auth/v1/verify` +
    `?token=${encodeURIComponent(token_hash)}` +
    `&type=${encodeURIComponent(email_action_type)}` +
    `&redirect_to=${encodeURIComponent(redirect_to ?? "")}`;

  const tpl = authActionEmailHtml({ actionType: email_action_type, link });
  // Unhandled (e.g. reauthentication OTP, notifications) — ack without sending.
  if (!tpl) return NextResponse.json({}, { status: 200 });

  try {
    await sendEmail({ to: email, subject: tpl.subject, html: tpl.html });
  } catch (err) {
    console.error("send-email-hook: Resend send failed", err);
    return NextResponse.json(
      { error: { http_code: 500, message: "failed to send email" } },
      { status: 500 }
    );
  }

  return NextResponse.json({}, { status: 200 });
}
