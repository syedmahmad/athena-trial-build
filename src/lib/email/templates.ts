const appUrl = process.env.APP_URL ?? "https://athena.sset.dev";

export function welcomeEmailHtml({ displayName }: { displayName: string }) {
  return {
    subject: "Welcome to Athena!",
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <tr>
      <td style="padding:40px 32px;text-align:center;">
        <h1 style="margin:0 0 16px;font-size:24px;color:#111827;">Welcome to Athena, ${displayName}!</h1>
        <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
          You're all set to start your SAT prep journey. Athena uses AI-powered lessons, quizzes, and tutoring to help you reach your target score.
        </p>
        <a href="${appUrl}/dashboard" style="display:inline-block;padding:12px 32px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">
          Go to Dashboard
        </a>
        <p style="margin:24px 0 0;font-size:14px;color:#9ca3af;">
          If you have any questions, just open the Mentor chat in the app.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export function assignmentEmailHtml({
  studentName,
  teacherName,
  assignmentTitle,
  dueDate,
  link,
}: {
  studentName?: string;
  teacherName?: string;
  assignmentTitle: string;
  dueDate?: string;
  link: string;
}) {
  const greeting = studentName ? `Hi ${studentName},` : "Hi,";
  const fromLine = teacherName
    ? `${teacherName} assigned you new homework on Athena.`
    : "You have new homework on Athena.";
  const dueLine = dueDate
    ? `<p style="margin:0 0 24px;font-size:15px;color:#4b5563;line-height:1.6;">It's due ${dueDate}.</p>`
    : "";
  return {
    subject: `New homework: ${assignmentTitle}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <tr>
      <td style="padding:40px 32px;">
        <p style="margin:0 0 16px;font-size:16px;color:#111827;">${greeting}</p>
        <p style="margin:0 0 8px;font-size:16px;color:#4b5563;line-height:1.6;">${fromLine}</p>
        <h1 style="margin:8px 0 16px;font-size:20px;color:#111827;">${assignmentTitle}</h1>
        ${dueLine}
        <a href="${link}" style="display:inline-block;padding:12px 32px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">
          Open your homework
        </a>
        <p style="margin:24px 0 0;font-size:14px;color:#9ca3af;line-height:1.6;">
          Sign in with your school email to start. If you weren't expecting this, you can ignore it.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

export function sessionReminderHtml({
  displayName,
  startTime,
}: {
  displayName: string;
  startTime: string;
}) {
  return {
    subject: `Your study session starts at ${startTime}`,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <tr>
      <td style="padding:40px 32px;text-align:center;">
        <h1 style="margin:0 0 16px;font-size:24px;color:#111827;">Hey ${displayName}!</h1>
        <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
          Your study session is coming up at <strong>${startTime}</strong>. Jump in and keep your streak going!
        </p>
        <a href="${appUrl}/dashboard" style="display:inline-block;padding:12px 32px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">
          Start Session
        </a>
        <p style="margin:24px 0 0;font-size:14px;color:#9ca3af;">
          Consistency is the key to SAT success. You've got this!
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}

/**
 * Auth-action emails sent on Supabase's behalf via the Send Email Hook
 * (`/api/auth/send-email-hook`). One template per `email_action_type`; the
 * link is the Supabase `/auth/v1/verify` URL the hook constructs. Returns null
 * for action types that carry no link (notification events) so the hook can
 * acknowledge without sending. Plain copy, no em dashes.
 */
export function authActionEmailHtml({
  actionType,
  link,
}: {
  actionType: string;
  link: string;
}): { subject: string; html: string } | null {
  const copy: Record<
    string,
    { subject: string; heading: string; body: string; cta: string }
  > = {
    signup: {
      subject: "Confirm your email",
      heading: "Confirm your email",
      body: "Confirm your email to finish setting up your Athena account.",
      cta: "Confirm email",
    },
    invite: {
      subject: "You're invited to Athena",
      heading: "You're invited",
      body: "Accept your invitation to set up your Athena account.",
      cta: "Accept invite",
    },
    magiclink: {
      subject: "Your Athena sign-in link",
      heading: "Sign in to Athena",
      body: "Use the button below to sign in. It works once and expires soon.",
      cta: "Sign in",
    },
    recovery: {
      subject: "Reset your Athena password",
      heading: "Reset your password",
      body: "Choose a new password below. If you did not request this, you can ignore this email.",
      cta: "Reset password",
    },
    email_change: {
      subject: "Confirm your new email",
      heading: "Confirm your new email",
      body: "Confirm your new email address for Athena.",
      cta: "Confirm email",
    },
    email: {
      subject: "Confirm your email",
      heading: "Confirm your email",
      body: "Confirm your email address for Athena.",
      cta: "Confirm email",
    },
  };
  const c = copy[actionType];
  if (!c) return null;
  return {
    subject: c.subject,
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <tr>
      <td style="padding:40px 32px;text-align:center;">
        <h1 style="margin:0 0 16px;font-size:24px;color:#111827;">${c.heading}</h1>
        <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">${c.body}</p>
        <a href="${link}" style="display:inline-block;padding:12px 32px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">
          ${c.cta}
        </a>
        <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">
          If the button does not work, copy and paste this link into your browser:<br>
          <span style="color:#6b7280;word-break:break-all;">${link}</span>
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`,
  };
}
