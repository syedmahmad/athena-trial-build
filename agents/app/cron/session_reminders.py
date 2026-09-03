"""
Background cron that sends session reminder emails ~1-2 hours before
each user's scheduled study session. Runs every 30 minutes.
"""

import asyncio
import logging
import os
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import resend

from app.utils.db import client

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 30 * 60  # 30 minutes

APP_URL = os.environ.get("APP_URL", "https://athena-pov.com")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "Athena <noreply@athena.com>")


def _welcome_html(display_name: str) -> tuple[str, str]:
    subject = "Welcome to Athena!"
    html = f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <tr>
      <td style="padding:40px 32px;text-align:center;">
        <h1 style="margin:0 0 16px;font-size:24px;color:#111827;">Welcome to Athena, {display_name}!</h1>
        <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
          You're all set to start your SAT prep journey. Athena uses AI-powered lessons, quizzes, and tutoring to help you reach your target score.
        </p>
        <a href="{APP_URL}/dashboard" style="display:inline-block;padding:12px 32px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">
          Go to Dashboard
        </a>
        <p style="margin:24px 0 0;font-size:14px;color:#9ca3af;">
          If you have any questions, just open the Mentor chat in the app.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return subject, html


def _reminder_html(display_name: str, start_time: str) -> tuple[str, str]:
    subject = f"Your study session starts at {start_time}"
    html = f"""\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:40px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
    <tr>
      <td style="padding:40px 32px;text-align:center;">
        <h1 style="margin:0 0 16px;font-size:24px;color:#111827;">Hey {display_name}!</h1>
        <p style="margin:0 0 24px;font-size:16px;color:#4b5563;line-height:1.6;">
          Your study session is coming up at <strong>{start_time}</strong>. Jump in and keep your streak going!
        </p>
        <a href="{APP_URL}/dashboard" style="display:inline-block;padding:12px 32px;background:#6366f1;color:#ffffff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;">
          Start Session
        </a>
        <p style="margin:24px 0 0;font-size:14px;color:#9ca3af;">
          Consistency is the key to SAT success. You've got this!
        </p>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return subject, html


def _get_session_datetime(date_str: str, time_str: str, tz_name: str) -> datetime | None:
    """Combine date (YYYY-MM-DD) + time (HH:MM) in a timezone into a UTC-aware datetime."""
    try:
        tz = ZoneInfo(tz_name)
        year, month, day = map(int, date_str.split("-"))
        hour, minute = map(int, time_str.split(":"))
        local_dt = datetime(year, month, day, hour, minute, tzinfo=tz)
        return local_dt.astimezone(timezone.utc)
    except Exception:
        return None


def _format_time(date_str: str, time_str: str, tz_name: str) -> str:
    """Format time for display, e.g. '2:30 PM'."""
    try:
        tz = ZoneInfo(tz_name)
        year, month, day = map(int, date_str.split("-"))
        hour, minute = map(int, time_str.split(":"))
        local_dt = datetime(year, month, day, hour, minute, tzinfo=tz)
        return local_dt.strftime("%-I:%M %p")
    except Exception:
        return time_str


def _send_email(to: str, subject: str, html: str) -> None:
    resend.api_key = os.environ.get("RESEND_API_KEY", "")
    resend.Emails.send({
        "from": EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
    })


def _run_reminders() -> dict:
    """Check for upcoming sessions and send reminder emails. Returns stats."""
    now = datetime.now(timezone.utc)
    today_str = now.strftime("%Y-%m-%d")
    tomorrow = now + timedelta(days=1)
    tomorrow_str = tomorrow.strftime("%Y-%m-%d")

    db = client()
    resp = (
        db.table("sessions")
        .select("id, scheduled_date, schedule_id, user_id")
        .in_("scheduled_date", [today_str, tomorrow_str])
        .eq("status", "planned")
        .is_("reminder_sent_at", "null")
        .execute()
    )

    sessions = resp.data or []
    if not sessions:
        return {"sent": 0, "errors": 0}

    # Gather unique user and schedule IDs
    user_ids = list({s["user_id"] for s in sessions})
    schedule_ids = list({s["schedule_id"] for s in sessions})

    # Batch fetch users and schedules
    users_resp = db.table("users").select("id, email, display_name, timezone").in_("id", user_ids).execute()
    users_map = {u["id"]: u for u in (users_resp.data or [])}

    schedules_resp = db.table("schedules").select("id, start_time").in_("id", schedule_ids).execute()
    schedules_map = {s["id"]: s for s in (schedules_resp.data or [])}

    sent = 0
    errors = 0

    for session in sessions:
        user = users_map.get(session["user_id"])
        schedule = schedules_map.get(session["schedule_id"])
        if not user or not schedule:
            continue

        tz_name = user.get("timezone", "America/New_York")
        session_dt = _get_session_datetime(session["scheduled_date"], schedule["start_time"], tz_name)
        if not session_dt:
            continue

        diff_hours = (session_dt - now).total_seconds() / 3600
        if diff_hours < 1 or diff_hours > 2:
            continue

        display_time = _format_time(session["scheduled_date"], schedule["start_time"], tz_name)
        display_name = user.get("display_name") or "there"
        subject, html = _reminder_html(display_name, display_time)

        try:
            _send_email(user["email"], subject, html)
            db.table("sessions").update(
                {"reminder_sent_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", session["id"]).execute()
            sent += 1
        except Exception as e:
            logger.error(f"Failed to send reminder for session {session['id']}: {e}")
            errors += 1

    return {"sent": sent, "errors": errors}


async def session_reminder_loop() -> None:
    """Run the reminder check every 30 minutes."""
    while True:
        try:
            result = _run_reminders()
            if result["sent"] or result["errors"]:
                logger.info(f"Session reminders: {result}")
        except Exception as e:
            logger.error(f"Session reminder cron error: {e}")
        await asyncio.sleep(INTERVAL_SECONDS)
