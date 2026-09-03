import { resend } from "./client";

export async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}) {
  if (!resend) {
    console.warn("RESEND_API_KEY not set — skipping email");
    return null;
  }

  return resend.emails.send({
    from: process.env.EMAIL_FROM ?? "Athena <noreply@athena.com>",
    to: params.to,
    subject: params.subject,
    html: params.html,
    ...(params.replyTo ? { replyTo: params.replyTo } : {}),
  });
}
