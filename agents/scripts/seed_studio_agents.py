"""Seed script for Studio agent registry.

Creates conductor (default), Alice, and Bart agents with prompts and deployments.

Usage:
    cd agents
    uv run python scripts/seed_studio_agents.py
"""

import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv
load_dotenv()
load_dotenv(Path(__file__).parent.parent.parent / ".env")

from app.utils.db import client
from app.run_time.sat.micro_lesson_agent import micro_lesson_agent

# The full micro-lesson instructions — the gold standard for interactive whiteboard lessons
FULL_LESSON_INSTRUCTIONS = "\n\n".join(micro_lesson_agent.instructions)


def seed():
    db = client()

    # ─── 0. Seed Archetypes ──────────────────────────────────────────────

    print("Seeding archetypes...")

    db.table("studio_archetypes").upsert({
        "id": "sat-math-tutor",
        "display_name": "SAT Math Tutor",
        "description": "Patient, step-by-step SAT math tutor with whiteboard teaching and quiz capabilities. Suitable for interactive lessons with narration.",
        "domain": "math",
        "prompt_sections": [
            {
                "slug": "personality",
                "display_name": "Personality",
                "description": "Defines the tutor's tone, warmth, and communication style",
                "default_content": "You are a patient and encouraging math tutor. You explain concepts clearly, celebrate student progress, and never make students feel bad about mistakes.",
                "variables": [],
            },
            {
                "slug": "teaching_style",
                "display_name": "Teaching Style",
                "description": "How the tutor delivers lessons — pacing, examples, scaffolding",
                "default_content": "Teach step by step. Start with a concrete example, then explain the underlying concept. Use the whiteboard to show work visually. Ask check-in questions to gauge understanding.",
                "variables": [],
            },
            {
                "slug": "feedback_style",
                "display_name": "Feedback Style",
                "description": "How the tutor responds to correct and incorrect answers",
                "default_content": "When correct: celebrate briefly and move on. When incorrect: acknowledge what they got right, gently explain the mistake, and guide them to the answer.",
                "variables": [],
            },
            {
                "slug": "whiteboard_instructions",
                "display_name": "Whiteboard Instructions",
                "description": "Full whiteboard teaching system prompt (usually the base lesson instructions)",
                "default_content": "You are teaching {{skill_name}}.\nTopic: {{skill_description}}\n\nUse the <<<WHITEBOARD>>> format to render interactive whiteboard steps.",
                "variables": [
                    {"name": "skill_name", "type": "string", "required": True, "description": "Name of the skill being taught"},
                    {"name": "skill_description", "type": "string", "required": True, "description": "Description of the skill"},
                ],
            },
        ],
        "skills": [
            {"slug": "whiteboard_teaching", "enabled_by_default": True, "default_config": {"max_steps": 30, "include_check_ins": True}},
            {"slug": "quiz", "enabled_by_default": True, "default_config": {"problems_per_round": 5, "adaptive": True}},
        ],
        "config_schema": [
            {"key": "voice", "display_name": "Voice", "description": "TTS voice for narration", "type": "select", "default": "george", "options": ["george", "bella", "aria", "off"]},
            {"key": "pace", "display_name": "Pace", "description": "Overall lesson pacing", "type": "select", "default": "medium", "options": ["slow", "medium", "fast"]},
            {"key": "hint_detail", "display_name": "Hint Detail", "description": "How detailed hints are when a student is stuck", "type": "select", "default": "standard", "options": ["brief", "standard", "detailed"]},
            {"key": "max_lesson_steps", "display_name": "Max Lesson Steps", "description": "Maximum number of whiteboard steps per lesson", "type": "number", "default": 8, "min": 4, "max": 12},
        ],
    }, on_conflict="id").execute()
    print("  -> sat-math-tutor archetype created")

    db.table("studio_archetypes").upsert({
        "id": "drill-master",
        "display_name": "Drill Master",
        "description": "High-energy, fast-paced drill-based tutor focused on building speed and accuracy through rapid-fire practice. Minimal hand-holding.",
        "domain": "math",
        "prompt_sections": [
            {
                "slug": "personality",
                "display_name": "Personality",
                "description": "Defines the drill master's energy level and tone",
                "default_content": "You are a high-energy drill master. Keep things moving fast. Be direct, positive, and competitive. Think coach, not professor.",
                "variables": [],
            },
            {
                "slug": "drill_style",
                "display_name": "Drill Style",
                "description": "How drills are structured and delivered",
                "default_content": "Present problems quickly. Give minimal explanation upfront — let students learn by doing. After each answer, give a one-line explanation and move on immediately.",
                "variables": [],
            },
            {
                "slug": "feedback_style",
                "display_name": "Feedback Style",
                "description": "How the drill master responds to answers",
                "default_content": "Right? 'Boom! Next.' Wrong? 'Nope — the answer is X because Y. Moving on.' Keep it punchy.",
                "variables": [],
            },
            {
                "slug": "whiteboard_instructions",
                "display_name": "Whiteboard Instructions",
                "description": "Whiteboard teaching system prompt for drill-based lessons",
                "default_content": "You are a drill master teaching {{skill_name}}.\nTopic: {{skill_description}}\n\nKeep whiteboard steps short and punchy. Focus on worked examples.",
                "variables": [
                    {"name": "skill_name", "type": "string", "required": True, "description": "Name of the skill"},
                    {"name": "skill_description", "type": "string", "required": True, "description": "Description of the skill"},
                ],
            },
        ],
        "skills": [
            {"slug": "whiteboard_teaching", "enabled_by_default": True, "default_config": {"max_steps": 15, "include_check_ins": False}},
            {"slug": "quiz", "enabled_by_default": True, "default_config": {"problems_per_round": 5, "adaptive": True}},
        ],
        "config_schema": [
            {"key": "pace", "display_name": "Pace", "description": "Drill pacing", "type": "select", "default": "fast", "options": ["fast", "very-fast"]},
            {"key": "problems_per_round", "display_name": "Problems Per Round", "description": "Number of problems in each drill round", "type": "number", "default": 5, "min": 3, "max": 10},
            {"key": "show_hints", "display_name": "Show Hints", "description": "Whether to offer hints on wrong answers", "type": "boolean", "default": False},
        ],
    }, on_conflict="id").execute()
    print("  -> drill-master archetype created")

    # ─── 1. Conductor ─────────────────────────────────────────────────────

    print("Seeding 'conductor' agent...")
    db.table("studio_agents").upsert({
        "id": "conductor",
        "display_name": "Athena",
        "tagline": "The original adaptive tutor",
        "description": "Step-by-step SAT tutor with interactive whiteboard, narration, and adaptive pacing. The default experience.",
        "avatar_color": "#58a6ff",
        "domain": "general",
        "status": "active",
        "sort_order": 0,
    }, on_conflict="id").execute()

    for section, data in [
        ("model_settings", {
            "provider": "anthropic",
            "model": "claude-sonnet-4-5-20250929",
            "max_tokens": 2000,
            "temperature": 0.7,
        }),
        ("ui_settings", {
            "layout": "standard",
            "widgets": ["whiteboard", "step_solver"],
            "phases": ["lesson", "practice", "quiz", "done"],
            "narration": True,
            "student_chat": True,
            "quick_chips": ["Got it!", "I don't get it", "Show me an example", "Explain differently"],
            "advance_mode": "manual",
            "chrome": {"step_bar": True, "title_bar": True, "progress": "dots"},
            "extensions": [],
        }),
        ("interaction_rules", {
            "max_lesson_steps": 8,
            "practice_count_min": 3,
            "practice_count_max": 4,
            "quiz_count_min": 5,
            "quiz_count_max": 5,
            "show_hints": True,
            "hint_escalation": True,
            "allow_student_chat": True,
            "nudge_delay_ms": 30000,
        }),
    ]:
        db.table("studio_agent_config_sections").upsert({
            "agent_id": "conductor",
            "section": section,
            "data": data,
        }, on_conflict="agent_id,section").execute()

    # System prompt
    prompt_resp = db.table("studio_agent_prompts").upsert({
        "agent_id": "conductor",
        "slug": "system",
        "display_name": "System Prompt",
        "description": "Main teaching prompt — defines the tutor's behavior, phases, whiteboard format, and interaction model.",
        "sort_order": 0,
    }, on_conflict="agent_id,slug").execute()
    prompt_id = prompt_resp.data[0]["id"]

    # Check if version already exists
    existing = db.table("studio_agent_prompt_versions").select("id").eq("prompt_id", prompt_id).execute()
    if not existing.data:
        ver_resp = db.table("studio_agent_prompt_versions").insert({
            "prompt_id": prompt_id,
            "content": (
                "You are Athena, teaching {{skill_name}}.\n"
                "Topic description: {{skill_description}}\n\n"
                + FULL_LESSON_INSTRUCTIONS
            ),
            "variables": [
                {"name": "skill_name", "type": "string", "required": True, "description": "Name of the skill"},
                {"name": "skill_description", "type": "string", "required": True, "description": "Description of the skill"},
            ],
            "status": "published",
            "author": "seed",
            "change_note": "Initial seed version",
        }).execute()
        version_id = ver_resp.data[0]["id"]

        # Create live deployment
        db.table("studio_agent_deployments").insert({
            "agent_id": "conductor",
            "status": "live",
            "prompt_pins": {prompt_id: version_id},
            "config_snapshot": {
                "model_settings": {"provider": "anthropic", "model": "claude-sonnet-4-5-20250929", "max_tokens": 2000, "temperature": 0.7},
                "ui_settings": {"layout": "standard", "widgets": ["whiteboard", "step_solver"]},
                "interaction_rules": {"max_lesson_steps": 8},
            },
            "change_note": "Initial seed deployment",
            "deployed_by": "seed",
        }).execute()
        print("  -> Created with deployment v1 (live)")
    else:
        print("  -> Already seeded, skipping")

    # ─── 2. Alice ─────────────────────────────────────────────────────────

    print("Seeding 'alice' agent...")
    db.table("studio_agents").upsert({
        "id": "alice",
        "display_name": "Alice",
        "tagline": "Patient step-by-step algebra guide",
        "description": "Alice teaches math with a calm, methodical approach. She uses visual step-by-step algebra work and encourages students to try before showing answers.",
        "avatar_color": "#a371f7",
        "domain": "math",
        "status": "active",
        "sort_order": 1,
    }, on_conflict="id").execute()

    for section, data in [
        ("model_settings", {"provider": "anthropic", "model": "claude-sonnet-4-5-20250929", "max_tokens": 2000, "temperature": 0.6}),
        ("ui_settings", {
            "layout": "workspace", "widgets": ["whiteboard", "step_solver"],
            "phases": ["lesson", "practice", "quiz", "done"], "narration": True, "student_chat": True,
            "quick_chips": ["Got it!", "Show me more", "I'm confused"],
            "advance_mode": "manual",
            "chrome": {"step_bar": True, "title_bar": True, "progress": "dots"},
            "extensions": [],
        }),
        ("interaction_rules", {
            "max_lesson_steps": 6, "practice_count_min": 3, "practice_count_max": 4,
            "quiz_count_min": 3, "quiz_count_max": 5, "show_hints": True, "hint_escalation": True,
            "allow_student_chat": True, "nudge_delay_ms": 20000,
        }),
    ]:
        db.table("studio_agent_config_sections").upsert({
            "agent_id": "alice", "section": section, "data": data,
        }, on_conflict="agent_id,section").execute()

    for slug, name, desc, content, variables in [
        ("personality", "Personality", "Defines Alice's tone and style",
         "You are Alice, a patient and warm math tutor. You speak calmly and use simple language. "
         "You encourage students and never make them feel bad for mistakes. "
         "You teach {{skill_name}} at a comfortable pace.",
         [{"name": "skill_name", "type": "string", "required": True}]),
        ("system", "Teaching Prompt", "Main teaching instructions",
         "You are Alice, teaching {{skill_name}}.\n"
         "Topic: {{skill_description}}\n\n"
         + FULL_LESSON_INSTRUCTIONS,
         [{"name": "skill_name", "type": "string", "required": True},
          {"name": "skill_description", "type": "string", "required": True}]),
        ("feedback", "Feedback Prompt", "How Alice gives feedback",
         "When the student answers incorrectly, be encouraging. Say what they got right, "
         "then gently explain the mistake. Never just say 'wrong' — always teach.",
         []),
    ]:
        resp = db.table("studio_agent_prompts").upsert({
            "agent_id": "alice", "slug": slug, "display_name": name, "description": desc,
            "sort_order": 0 if slug == "personality" else (1 if slug == "system" else 2),
        }, on_conflict="agent_id,slug").execute()
        pid = resp.data[0]["id"]

        existing = db.table("studio_agent_prompt_versions").select("id").eq("prompt_id", pid).execute()
        if not existing.data:
            db.table("studio_agent_prompt_versions").insert({
                "prompt_id": pid, "content": content, "variables": variables,
                "status": "published", "author": "seed", "change_note": "Initial version",
            }).execute()

    print("  -> Created with 3 prompt slots")

    # ─── 3. Bart ──────────────────────────────────────────────────────────

    print("Seeding 'bart' agent...")
    db.table("studio_agents").upsert({
        "id": "bart",
        "display_name": "Bart",
        "tagline": "Fast-paced drill master",
        "description": "Bart teaches through rapid-fire practice and competition. High energy, fast pace, focused on building speed and accuracy through repetition.",
        "avatar_color": "#f7c948",
        "domain": "math",
        "status": "active",
        "sort_order": 2,
    }, on_conflict="id").execute()

    for section, data in [
        ("model_settings", {"provider": "anthropic", "model": "claude-sonnet-4-5-20250929", "max_tokens": 1500, "temperature": 0.8}),
        ("ui_settings", {
            "layout": "standard", "widgets": ["step_solver"],
            "phases": ["lesson", "practice", "quiz", "done"], "narration": False, "student_chat": False,
            "quick_chips": ["Next!", "Too easy", "Slow down"],
            "advance_mode": "auto",
            "chrome": {"step_bar": True, "title_bar": True, "progress": "ring"},
            "extensions": [],
        }),
        ("interaction_rules", {
            "max_lesson_steps": 3, "practice_count_min": 5, "practice_count_max": 8,
            "quiz_count_min": 5, "quiz_count_max": 5, "show_hints": False, "hint_escalation": False,
            "allow_student_chat": False, "nudge_delay_ms": 10000,
        }),
    ]:
        db.table("studio_agent_config_sections").upsert({
            "agent_id": "bart", "section": section, "data": data,
        }, on_conflict="agent_id,section").execute()

    for slug, name, desc, content, variables in [
        ("system", "System Prompt", "Bart's main teaching prompt",
         "You are Bart, a high-energy drill master teaching {{skill_name}}.\n"
         "Topic: {{skill_description}}\n\n"
         + FULL_LESSON_INSTRUCTIONS,
         [{"name": "skill_name", "type": "string", "required": True}]),
        ("feedback", "Feedback Prompt", "Bart's feedback style",
         "Keep feedback short and punchy. Right? 'Boom! Next one.' Wrong? 'Nope. The answer is X because Y. Moving on.'",
         []),
    ]:
        resp = db.table("studio_agent_prompts").upsert({
            "agent_id": "bart", "slug": slug, "display_name": name, "description": desc,
            "sort_order": 0 if slug == "system" else 1,
        }, on_conflict="agent_id,slug").execute()
        pid = resp.data[0]["id"]

        existing = db.table("studio_agent_prompt_versions").select("id").eq("prompt_id", pid).execute()
        if not existing.data:
            db.table("studio_agent_prompt_versions").insert({
                "prompt_id": pid, "content": content, "variables": variables,
                "status": "published", "author": "seed", "change_note": "Initial version",
            }).execute()

    print("  -> Created with 2 prompt slots")

    # ─── Link agents to archetypes ─────────────────────────────────────────

    print("\nLinking agents to archetypes...")
    for agent_id, archetype_id, agent_config in [
        ("conductor", "sat-math-tutor", {"voice": "george", "pace": "medium", "hint_detail": "standard", "max_lesson_steps": 8}),
        ("alice", "sat-math-tutor", {"voice": "bella", "pace": "slow", "hint_detail": "detailed", "max_lesson_steps": 6}),
        ("bart", "drill-master", {"pace": "very-fast", "problems_per_round": 5, "show_hints": False}),
    ]:
        db.table("studio_agents").update({
            "archetype_id": archetype_id,
            "agent_config": agent_config,
        }).eq("id", agent_id).execute()
        print(f"  -> {agent_id} linked to {archetype_id}")

    # ─── Create deployments for agents that don't have one ────────────────

    for agent_id in ["alice", "bart"]:
        existing_deploy = db.table("studio_agent_deployments").select("id").eq("agent_id", agent_id).eq("status", "live").execute()
        if existing_deploy.data:
            print(f"  {agent_id}: deployment already exists, skipping")
            continue

        prompts = db.table("studio_agent_prompts").select("id, slug").eq("agent_id", agent_id).execute().data or []
        pins = {}
        for p in prompts:
            versions = db.table("studio_agent_prompt_versions").select("id").eq("prompt_id", p["id"]).eq("status", "published").execute().data
            if versions:
                pins[p["id"]] = versions[0]["id"]

        if not pins:
            print(f"  {agent_id}: no published versions, skipping deployment")
            continue

        config_rows = db.table("studio_agent_config_sections").select("section, data").eq("agent_id", agent_id).execute().data or []
        config_snapshot = {r["section"]: r["data"] for r in config_rows}

        db.table("studio_agent_deployments").insert({
            "agent_id": agent_id,
            "status": "live",
            "prompt_pins": pins,
            "config_snapshot": config_snapshot,
            "change_note": "Initial seed deployment",
            "deployed_by": "seed",
        }).execute()
        print(f"  {agent_id}: created live deployment")

    print("\nDone! Seeded 3 agents with deployments: conductor, alice, bart")


if __name__ == "__main__":
    seed()
