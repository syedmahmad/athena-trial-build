# Email setup checklist (sending email to users)

Today nothing in Athena sends real email. Parent reports are generated and
**logged only** (`educator_parent_reports` rows; the UI says "logged, not
emailed"). This checklist takes you from there to actually delivering email
(parent reports first, then anything else), in roughly the order to do it.

## 1. Pick a provider

- [ ] Choose one. For this stack (Next.js on Northflank, server routes) the
      easiest is **Resend** (clean API, first-class React email templates).
      Alternatives: **Postmark** (best transactional deliverability/support),
      **AWS SES** (cheapest at scale, more setup), **SendGrid**.
- [ ] Create the account and confirm the plan covers expected volume
      (reports = roster size x periods; budget for retries and other emails).
- [ ] Decide the **sending domain/subdomain**, e.g. `mail.athena.<domain>` or
      `notifications.athena.<domain>`. A subdomain keeps transactional
      reputation separate from your root domain.

## 2. Authenticate the domain (deliverability lives or dies here)

In the provider dashboard, add the domain, then add the DNS records it gives
you at your DNS host:

- [ ] **SPF** (TXT) authorizing the provider to send for the domain.
- [ ] **DKIM** (CNAME/TXT) keys the provider generates. Sign every message.
- [ ] **DMARC** (TXT at `_dmarc.<domain>`): start at `p=none` with a `rua=`
      report address, watch for a week, then move to `quarantine`/`reject`.
- [ ] **Custom Return-Path / MAIL FROM** (CNAME) for SPF alignment.
- [ ] Wait for the provider to show all records **Verified** (DNS can take up
      to a few hours).

## 3. Sender identity

- [ ] Set the **From** name + address, e.g. `Athena <reports@mail.athena.<domain>>`.
- [ ] Set a monitored **Reply-To** (teacher's address for parent replies, or a
      support inbox). Parents will reply; decide where that goes.
- [ ] Add a real physical mailing address + unsubscribe link to the footer
      (CAN-SPAM / CASL requirement, see step 8).

## 4. Secrets and config

- [ ] Generate the provider **API key** (use a send-only key if offered).
- [ ] Add it to the Athena secret stores, do NOT commit it:
  - [ ] Vault collection `athena-agent` (or web app's secret store) — see the
        project's Vault notes.
  - [ ] Northflank **runtime environment** for the web service (`athena-app`).
  - [ ] Local `.env` for development.
- [ ] Standardize names, e.g. `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`,
      `EMAIL_REPLY_TO`, and a kill switch `EMAIL_SENDING_ENABLED=false` (default
      off, like the educator paywall flag) so you can ship dark and flip on.

## 5. Server-side email helper

- [ ] Add the SDK: `cd /Users/craig/athena && pnpm add resend` (or chosen SDK).
- [ ] Create `src/lib/email/send.ts` — a single server-only `sendEmail({ to,
      subject, html, text, replyTo })` that reads the env, no-ops when
      `EMAIL_SENDING_ENABLED` is false, and returns/loggs the provider id.
- [ ] Keep it server-only (never import into a client component; the API key
      must never reach the browser).

## 6. Templates

- [ ] Build the **parent report** email: greeting, the AI summary, the period,
      a plain footer. Keep it plain and legible (mirror the no-em-dash copy
      rule). Use `@react-email/components` for HTML + a text fallback, or a
      small HTML string.
- [ ] Always send **multipart (HTML + plain text)**; text-only fallback helps
      deliverability and accessibility.
- [ ] Templates to plan for beyond reports: assignment-assigned notice,
      "work graded" notice, teacher invite, password/magic-link (auth provider
      usually handles this one).

## 7. Wire it into the app

The integration point already exists. In
`src/app/api/educators/reports/route.ts`, right after `logParentReport({...})`
(records the row), add the send:

- [ ] Look up the recipient: `student.parentEmail` (already on the roster).
- [ ] Render the parent-report template with the generated `summary`.
- [ ] `await sendEmail(...)`; on success, store the provider message id /
      mark the row as emailed (add an `emailed_at` column to
      `educator_parent_reports` if you want delivery state).
- [ ] Update the UI copy: the student detail currently says
      "PARENT REPORTS · LOGGED, NOT EMAILED" and the button says "Log parent
      report" (`src/components/educators/students-page.tsx`). Change to
      "Send parent report" once sending is live, and keep it honest if sending
      is disabled.
- [ ] Decide sync vs queued: a single report can send inline; a "send to all
      parents" action should queue (see step 10).

## 8. Compliance (important for student/parent email + schools)

- [ ] **Unsubscribe**: every non-essential email needs a working unsubscribe
      link and honors it. Transactional report emails a parent opted into are
      lower risk, but still give an opt-out.
- [ ] **CAN-SPAM / CASL**: accurate From/Subject, physical address, opt-out.
- [ ] **FERPA / COPPA**: report emails contain a student's education records.
      Confirm the teacher/school has consent to email the parent, only send to
      the parent address on the roster, and avoid putting sensitive detail in
      the subject line. Get sign-off from whoever owns school agreements.
- [ ] Add a per-recipient suppression list (bounces/complaints/unsubscribes)
      and never send to a suppressed address.

## 9. Deliverability and monitoring

- [ ] Configure the provider's **bounce + complaint webhooks** -> a small
      `/api/webhooks/email` route that writes to a suppression list.
- [ ] Warm up gradually if volume is high; sending 1000s on day one from a new
      domain tanks reputation.
- [ ] Watch the provider dashboard for bounce rate (<2%) and complaint rate
      (<0.1%).

## 10. Sending at volume

- [ ] For batch sends ("email all parents"), use a queue instead of a loop in
      the request: provider batch API, or a Supabase/pg-based job, or
      Northflank cron. Respect provider rate limits and retry with backoff.
- [ ] Make sends idempotent (don't double-email the same report on retry).

## 11. Test before flipping the switch

- [ ] Send to a personal inbox; confirm it lands in **Primary**, not spam.
- [ ] Run the message through https://www.mail-tester.com (aim 9-10/10) and
      check SPF/DKIM/DMARC all pass.
- [ ] Test a hard bounce (invalid address) and confirm the webhook suppresses it.
- [ ] Verify the kill switch: `EMAIL_SENDING_ENABLED=false` truly sends nothing.
- [ ] Then enable in prod (Northflank env) and send one real report to yourself
      as the parent address before turning it on for teachers.

---

**Fastest path to "it works":** Resend + a verified subdomain (steps 1-3) ->
`EMAIL_*` secrets (step 4) -> `src/lib/email/send.ts` (step 5) -> one parent
report template (step 6) -> the send call after `logParentReport` (step 7) ->
mail-tester pass (step 11). Compliance and volume (steps 8-10) before you turn
it on for real classrooms.
