"""
Triage / receptionist agent for the Athena Studio.

Converses with the student to understand what they need, then recommends
a tutor agent and facilitates handoff.
"""

from __future__ import annotations

import json
from typing import AsyncGenerator

from app.utils.llm_client import anthropic_async_client

HANDOFF_DELIMITER = "<<<HANDOFF>>>"

TRIAGE_SYSTEM_PROMPT = """\
You are Athena's studio receptionist — a warm, encouraging guide who helps students \
figure out what they want to learn today. You are NOT a tutor yourself; your job is to \
understand the student's needs and match them with the perfect tutor agent.

Your personality:
- Warm, patient, and genuinely curious about what the student wants to learn
- Encouraging but not over-the-top — like a friendly librarian or study buddy
- Concise — keep your messages short (2-4 sentences max) unless the student needs more

Your conversation flow:
1. Greet the student naturally and ask what they want to work on
2. If their request is vague, ask ONE clarifying question (not a quiz — just helpful narrowing)
3. Once you understand the topic, recommend a specific tutor agent from the available list
4. If the student wants someone different, offer alternatives

IMPORTANT RULES:
- Never try to teach or explain academic content yourself
- Keep the conversation to 2-3 exchanges before making a recommendation
- If the student clearly states a topic, recommend immediately (don't over-question)
- Always explain briefly WHY you're recommending a specific tutor

When you are ready to recommend a tutor, end your message with the delimiter {delimiter} \
followed by a JSON object on the next line. The JSON must have this structure:

For a recommendation:
{{
  "action": "recommend_tutor",
  "agent_id": "<id from available agents>",
  "agent_name": "<display_name>",
  "reason": "<1 sentence explaining why this tutor is a great fit>",
  "student_context": {{
    "topic": "<what they want to learn>",
    "struggle_areas": "<what they're struggling with, if mentioned>",
    "notes": "<any personality/emotional notes for the tutor>"
  }}
}}

When the student confirms they want to proceed with the recommended tutor:
{{
  "action": "start_session",
  "agent_id": "<id>",
  "agent_name": "<display_name>",
  "student_context": {{
    "topic": "<topic>",
    "struggle_areas": "<struggles>",
    "notes": "<notes>"
  }}
}}

Available tutor agents:
{agents_block}

Remember: your text response is what the student sees. The JSON after the delimiter is \
parsed by the system — it does NOT appear in the chat. So write a natural conversational \
message, then add the delimiter + JSON only when making a recommendation or starting a session.
""".replace("{delimiter}", HANDOFF_DELIMITER)


def _format_agents_block(agents: list[dict]) -> str:
    """Format the available agents into a readable list for the system prompt."""
    if not agents:
        return "No agents currently available."
    lines = []
    for a in agents:
        line = f"- id: {a['id']} | name: {a.get('display_name', a['id'])} | tagline: {a.get('tagline', 'N/A')} | domain: {a.get('domain', 'general')}"
        lines.append(line)
    return "\n".join(lines)


async def triage_chat_stream(
    message: str,
    history: list[dict] | None = None,
    available_agents: list[dict] | None = None,
) -> AsyncGenerator[str, None]:
    """Stream a triage agent response via the Anthropic API.

    Yields text chunks (may contain <<<HANDOFF>>> delimiter + JSON).
    """
    # Anthropic client via Majordomo gateway (see app/utils/llm_client.py).
    client = anthropic_async_client(feature="studio-triage")

    agents_block = _format_agents_block(available_agents or [])
    system_prompt = TRIAGE_SYSTEM_PROMPT.replace("{agents_block}", agents_block)

    # Build messages array
    messages: list[dict] = []
    if history:
        for msg in history:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            # Map "tutor"/"assistant" to "assistant" for Anthropic API
            if role in ("tutor", "assistant"):
                role = "assistant"
            messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": message})

    async with client.messages.stream(
        model="claude-sonnet-4-20250514",
        max_tokens=1024,
        system=system_prompt,
        messages=messages,
    ) as stream:
        async for text in stream.text_stream:
            yield text
