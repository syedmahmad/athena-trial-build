"""
Content Generation Workflow — orchestrates multi-step SAT content generation
using Agno Workflow and persists to Supabase.

Idempotent: skips topics/subtopics/problems that already exist in the DB.
"""

import asyncio
from agno.workflow import Workflow

from app.utils.db import (
    save_topic,
    save_subtopic,
    save_problems,
    get_topic_by_slug,
    get_subtopic,
    get_problem_count,
)
from app.pre_generation.topic_generator import generate_topic
from app.pre_generation.subtopic_generator import generate_subtopic
from app.pre_generation.problem_generator import generate_problems_batch, BATCH_SIZE

MATH_CONTENT_MAP = {
    "Algebra": {
        "order": 1,
        "icon": "🔢",
        "color": "blue",
        "subtopics": [
            "Linear equations (one variable)",
            "Linear equations (two variables)",
            "Linear inequalities",
            "Systems of linear equations",
            "Linear functions",
        ],
    },
    "Advanced Math": {
        "order": 2,
        "icon": "📐",
        "color": "purple",
        "subtopics": [
            "Equivalent expressions",
            "Nonlinear equations (quadratic, exponential, radical, rational)",
            "Polynomial operations",
            "Nonlinear functions",
            "Function transformations",
        ],
    },
    "Problem Solving and Data Analysis": {
        "order": 3,
        "icon": "📊",
        "color": "green",
        "subtopics": [
            "Ratios and proportional relationships",
            "Percentages",
            "Unit conversion",
            "One-variable data (mean, median, standard deviation)",
            "Two-variable data (scatterplots, regression)",
            "Probability",
            "Statistical inference (margin of error concepts)",
        ],
    },
    "Geometry and Trigonometry": {
        "order": 4,
        "icon": "📏",
        "color": "amber",
        "subtopics": [
            "Area and volume",
            "Lines, angles, and triangles",
            "Similarity and congruence",
            "Right triangle trigonometry",
            "Circles (equations, arc length, sector area)",
            "Coordinate geometry",
        ],
    },
}

RW_CONTENT_MAP = {
    "Information and Ideas": {
        "order": 1,
        "icon": "📖",
        "color": "blue",
        "subtopics": [
            "Central Ideas and Details",
            "Inferences",
            "Command of Evidence",
            "Informational Graphics (tables, charts, graphs)",
        ],
    },
    "Craft and Structure": {
        "order": 2,
        "icon": "🧱",
        "color": "purple",
        "subtopics": [
            "Words in Context",
            "Text Structure and Purpose",
            "Cross-Text Connections",
        ],
    },
    "Expression of Ideas": {
        "order": 3,
        "icon": "✏️",
        "color": "green",
        "subtopics": [
            "Rhetorical Synthesis",
            "Transitions",
        ],
    },
    "Standard English Conventions": {
        "order": 4,
        "icon": "✅",
        "color": "amber",
        "subtopics": [
            "Boundaries (run-ons, fragments, comma splices)",
            "Form, Structure, and Sense (verb tense, parallelism, modifiers, pronouns)",
            "Agreement (subject-verb, pronoun-antecedent)",
            "Punctuation (commas, semicolons, colons, dashes, apostrophes)",
        ],
    },
}

SCIENCE_CONTENT_MAP = {
    "Biology": {
        "order": 1,
        "icon": "🧬",
        "color": "blue",
        "subtopics": [
            "Cells and Cell Structure",
            "Genetics and Heredity",
            "Evolution and Natural Selection",
            "Ecology and Ecosystems",
            "Human Body Systems",
        ],
    },
    "Chemistry": {
        "order": 2,
        "icon": "⚗️",
        "color": "purple",
        "subtopics": [
            "Atomic Structure",
            "The Periodic Table",
            "Chemical Bonding",
            "Chemical Reactions",
            "Acids, Bases, and Solutions",
        ],
    },
    "Physics": {
        "order": 3,
        "icon": "⚛️",
        "color": "green",
        "subtopics": [
            "Motion and Forces",
            "Energy and Work",
            "Waves and Sound",
            "Electricity and Magnetism",
            "Light and Optics",
        ],
    },
    "Earth and Space Science": {
        "order": 4,
        "icon": "🌍",
        "color": "amber",
        "subtopics": [
            "Structure of the Earth and Plate Tectonics",
            "Weather and Climate",
            "The Water and Rock Cycles",
            "The Solar System",
            "Stars and the Universe",
        ],
    },
}

SOCIAL_STUDIES_CONTENT_MAP = {
    "United States History": {
        "order": 1,
        "icon": "🏛️",
        "color": "blue",
        "subtopics": [
            "Founding and the Constitution",
            "Civil War and Reconstruction",
            "Industrialization and Immigration",
            "The World Wars and the Great Depression",
            "Civil Rights and Modern America",
        ],
    },
    "World History": {
        "order": 2,
        "icon": "📜",
        "color": "purple",
        "subtopics": [
            "Ancient Civilizations",
            "Classical Empires (Greece and Rome)",
            "The Middle Ages",
            "Renaissance and Revolutions",
            "The Modern Globalized World",
        ],
    },
    "Geography": {
        "order": 3,
        "icon": "🗺️",
        "color": "green",
        "subtopics": [
            "Maps and Geographic Tools",
            "Physical Geography and Landforms",
            "Human Population and Migration",
            "World Regions and Cultures",
            "Resources and the Environment",
        ],
    },
    "Civics and Economics": {
        "order": 4,
        "icon": "⚖️",
        "color": "amber",
        "subtopics": [
            "Foundations of Government",
            "The Three Branches of Government",
            "Citizenship, Rights, and Elections",
            "Basic Economic Concepts",
            "Markets, Money, and Personal Finance",
        ],
    },
}

# Keep backward compat alias
CONTENT_MAP = MATH_CONTENT_MAP

SUBJECT_CONFIGS = {
    "math": {"content_map": MATH_CONTENT_MAP, "subject": "math", "problems_per_subtopic": 40},
    "reading-writing": {"content_map": RW_CONTENT_MAP, "subject": "reading-writing", "problems_per_subtopic": 40},
    "science": {"content_map": SCIENCE_CONTENT_MAP, "subject": "science", "problems_per_subtopic": 10},
    "social-studies": {"content_map": SOCIAL_STUDIES_CONTENT_MAP, "subject": "social-studies", "problems_per_subtopic": 10},
}

# Default problems per subtopic; per-subject overrides live in SUBJECT_CONFIGS.
PROBLEMS_PER_SUBTOPIC = 40


def _make_slug(name: str) -> str:
    return name.lower().replace(" ", "-").replace("(", "").replace(")", "").replace(",", "")


class ContentGenerationWorkflow(Workflow):
    name: str = "SAT Content Generation"
    description: str = "Generates topics, subtopics, and SAT problems"

    async def run_generation(self, subject: str = "math") -> dict:
        """Execute the full content generation pipeline. Skips existing content."""
        config = SUBJECT_CONFIGS[subject]
        content_map = config["content_map"]
        subject_key = config["subject"]
        problems_per_subtopic = config.get("problems_per_subtopic", PROBLEMS_PER_SUBTOPIC)

        stats = {"topics": 0, "subtopics": 0, "problems": 0, "skipped_topics": 0, "skipped_subtopics": 0, "skipped_problems": 0}

        # ── Step 1: Generate Topics ──
        print(f"\n══════════════════════════════════════")
        print(f"  Step 1: Generating Topics ({subject})")
        print(f"══════════════════════════════════════\n")

        saved_topics = {}  # name -> {id, ...}
        topics_to_generate = []

        for topic_name, meta in content_map.items():
            slug = _make_slug(topic_name)
            existing = get_topic_by_slug(slug)
            if existing:
                saved_topics[topic_name] = existing
                stats["skipped_topics"] += 1
                print(f"  ⏭ Topic already exists: {topic_name} (id: {existing['id'][:8]}...)")
            else:
                topics_to_generate.append((topic_name, meta))

        if topics_to_generate:
            topic_tasks = [
                generate_topic(
                    name=name,
                    subtopics=meta["subtopics"],
                    order=meta["order"],
                    icon=meta["icon"],
                    color=meta["color"],
                    subject=subject_key,
                )
                for name, meta in topics_to_generate
            ]
            topic_results = await asyncio.gather(*topic_tasks)

            for topic_data in topic_results:
                saved = save_topic(topic_data)
                saved_topics[topic_data["name"]] = saved
                stats["topics"] += 1
                print(f"  ✓ Saved topic: {topic_data['name']} (id: {saved['id'][:8]}...)")

        # ── Step 2: Generate Subtopics ──
        print(f"\n══════════════════════════════════════")
        print(f"  Step 2: Generating Subtopics ({subject})")
        print(f"══════════════════════════════════════\n")

        saved_subtopics = {}  # (topic_name, subtopic_name) -> {id, ...}
        subtopics_to_generate = []

        for topic_name, meta in content_map.items():
            topic_id = saved_topics[topic_name]["id"]
            for i, sub_name in enumerate(meta["subtopics"]):
                slug = _make_slug(sub_name)
                existing = get_subtopic(topic_id, slug)
                if existing:
                    saved_subtopics[(topic_name, sub_name)] = existing
                    stats["skipped_subtopics"] += 1
                    print(f"  ⏭ [{topic_name}] {sub_name} (exists)")
                else:
                    subtopics_to_generate.append((topic_name, sub_name, topic_id, i, meta["subtopics"]))

        if subtopics_to_generate:
            sub_tasks = [
                generate_subtopic(
                    name=sub_name,
                    topic_name=topic_name,
                    topic_id=topic_id,
                    order_index=order_idx,
                    all_subtopic_names=all_subs,
                    subject=subject_key,
                )
                for topic_name, sub_name, topic_id, order_idx, all_subs in subtopics_to_generate
            ]
            sub_results = await asyncio.gather(*sub_tasks)

            for (topic_name, sub_name, *_), sub_data in zip(subtopics_to_generate, sub_results):
                saved = save_subtopic(sub_data)
                saved_subtopics[(topic_name, sub_name)] = saved
                stats["subtopics"] += 1
                print(f"  ✓ [{topic_name}] {sub_name} (id: {saved['id'][:8]}...)")

        # ── Step 3: Generate Problems ──
        print(f"\n══════════════════════════════════════")
        print(f"  Step 3: Generating Problems ({subject})")
        print(f"══════════════════════════════════════\n")

        num_batches = problems_per_subtopic // BATCH_SIZE

        for topic_name, meta in content_map.items():
            print(f"\n  📚 {topic_name}")
            for sub_name in meta["subtopics"]:
                subtopic_id = saved_subtopics[(topic_name, sub_name)]["id"]
                existing_count = get_problem_count(subtopic_id)

                if existing_count >= problems_per_subtopic:
                    stats["skipped_problems"] += existing_count
                    print(f"    ⏭ {sub_name}: {existing_count} problems already exist")
                    continue

                # Figure out which batches still need generating
                batches_done = existing_count // BATCH_SIZE
                batches_remaining = num_batches - batches_done

                if batches_remaining <= 0:
                    stats["skipped_problems"] += existing_count
                    print(f"    ⏭ {sub_name}: {existing_count} problems already exist")
                    continue

                print(f"    📝 {sub_name} ({existing_count} exist, generating {batches_remaining * BATCH_SIZE} more): ", end="", flush=True)

                # Generate remaining batches in parallel
                batch_tasks = []
                for b in range(batches_done, num_batches):
                    batch_tasks.append(
                        generate_problems_batch(
                            subtopic_name=sub_name,
                            topic_name=topic_name,
                            subtopic_id=subtopic_id,
                            batch_number=b,
                            batch_size=BATCH_SIZE,
                            start_order_index=b * BATCH_SIZE,
                            subject=subject_key,
                        )
                    )

                batch_results = await asyncio.gather(*batch_tasks, return_exceptions=True)

                # Save successful batches, log failures
                total_saved = 0
                for result in batch_results:
                    if isinstance(result, Exception):
                        print(f"✗", end="", flush=True)
                    else:
                        try:
                            saved = save_problems(result)
                            total_saved += len(saved)
                            print(f"█", end="", flush=True)
                        except Exception as e:
                            print(f"✗", end="", flush=True)

                stats["problems"] += total_saved
                print(f" ({total_saved} problems)")

        return stats
