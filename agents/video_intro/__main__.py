"""
End-to-end CLI for the video intro pipeline.

Single command:

  generate     Topic+subtopic → brief.json + audio.mp3 + manifest.json
               (everything needed for `npx remotion render` to produce an MP4)

Usage (env auto-loads from .env via _bootstrap_env below — no manual sourcing
needed):

    cd agents
    python -m video_intro generate \\
        --topic-slug algebra \\
        --subtopic-slug linear-equations-one-variable \\
        --topic-name "Algebra" \\
        --subtopic-name "Linear equations (one variable)" \\
        --out out/algebra_linear \\
        --remotion-root ../video-intro-remotion

Then render the MP4:

    cd video-intro-remotion
    npx remotion render src/index.ts IntroVideo out/algebra_linear.mp4 \\
        --props=./manifests/algebra_linear.json

Code-tier only — Veo / Runway generative-tier was removed in
remove/generative-tier (cost). Every beat renders via a deterministic
React/Remotion primitive or — if no primitive fits — as a black frame
with the narration + caption overlay. See brief_generator.py for the
primitive vocabulary.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

import os
from dotenv import load_dotenv

# Load API keys from .env BEFORE importing modules that snapshot them.
# Walks up from this file looking for .env at repo root + agents/.env,
# loading both so a single key can live in either place. The orchestrator
# is run standalone (no FastAPI lifecycle wrapping it), so it needs to
# bootstrap its own env — without this, ANTHROPIC_API_KEY / ELEVENLABS_*
# come back as None from os.environ.get() even when they're in .env. The
# parent agents/main.py FastAPI app loads dotenv on startup; this mirrors
# that behavior for the CLI entry path.
#
# We respect already-exported env vars (override=False) so a real shell
# export (e.g. a CI runner injecting a key) wins over the file. But we
# treat empty-string values as "unset" first — some sandboxes (Claude
# Code's bash tool) wipe sensitive vars to "" rather than unsetting
# them, which fools dotenv into thinking the var is set.
_SENSITIVE_KEYS = (
    "ANTHROPIC_API_KEY",
    "ELEVENLABS_API_KEY",
    "ELEVENLABS_VOICE_ID",
)


def _bootstrap_env() -> None:
    # Unset empty sensitive vars so dotenv will populate them.
    for key in _SENSITIVE_KEYS:
        if os.environ.get(key) == "":
            del os.environ[key]

    here = Path(__file__).resolve().parent
    loaded: list[Path] = []
    for _ in range(8):
        for candidate in (here / "agents" / ".env", here / ".env"):
            if candidate.is_file() and candidate not in loaded:
                load_dotenv(candidate, override=False)
                loaded.append(candidate)
        if here.parent == here:
            break
        here = here.parent


_bootstrap_env()

from .brief_generator import generate_brief
from .adapters.tts import apply_to_brief as apply_tts
from .config import Config
from .primitive_generator import (
    AuthoredPrimitive,
    author_primitive,
    author_primitive_living,
    author_primitive_static,
    derive_pascal_case,
    revise_primitive,
    sketch_composition,
)
from .patchers import (
    patch_intro_video,
    patch_manifest_types,
    patch_brief_enum,
    patch_brief_docs,
    revert_primitive,
)
from .sanity_render import sanity_render
from .visual_critique import capture_critique_frame, critique_primitive


def cmd_generate(args: argparse.Namespace) -> int:
    # Validate either --brief-file OR all four topic args. The topic
    # args are only used as inputs to generate_brief; when --brief-file
    # is set we skip that codepath entirely.
    if not args.brief_file:
        missing = [
            f"--{flag}"
            for flag, val in [
                ("topic-slug", args.topic_slug),
                ("subtopic-slug", args.subtopic_slug),
                ("topic-name", args.topic_name),
                ("subtopic-name", args.subtopic_name),
            ]
            if not val
        ]
        if missing:
            print(
                f"✗ missing required args: {', '.join(missing)}\n"
                f"  (either pass all four, or use --brief-file PATH to load a "
                f"hand-authored brief instead)",
                file=sys.stderr,
            )
            return 2

    out_dir: Path = args.out
    out_dir.mkdir(parents=True, exist_ok=True)

    brief_path = out_dir / "brief.json"
    audio_path = out_dir / "audio.mp3"
    manifest_path = out_dir / "manifest.json"

    # 1) Brief — either load a hand-authored one from disk or have Claude
    #    generate it. The --brief-file path is useful for seeding the
    #    primitive library deliberately (each `_new` block in the loaded
    #    brief gets authored), and for reproducibility on a known brief.
    if getattr(args, "brief_file", None):
        src = Path(args.brief_file).expanduser().resolve()
        print(f"→ loading brief from {src} (skipping Claude brief generation)")
        brief = json.loads(src.read_text())
        # Hand-authored briefs may omit `narration.word_timings` —
        # tolerate that, the realigner falls back to original timings.
        brief.setdefault("narration", {}).setdefault("word_timings", [])
        brief_path.write_text(json.dumps(brief, indent=2))
        print(f"  ✓ copied to {brief_path.name}: {len(brief['beats'])} beats")
    else:
        print("→ generating brief via Claude…")
        g = generate_brief(
            topic_slug=args.topic_slug,
            subtopic_slug=args.subtopic_slug,
            topic_name=args.topic_name,
            subtopic_name=args.subtopic_name,
            target_duration_s=args.target_duration_s,
            style_strategy_hint=args.style_strategy,
            role=args.role,
        )
        brief = g.brief
        brief_path.write_text(json.dumps(brief, indent=2))
        print(
            f"  ✓ wrote {brief_path.name}: "
            f"{len(brief['beats'])} beats, "
            f"{len(brief['narration']['script'].split())} narration words, "
            f"{brief['beats'][-1]['end_s']:.1f}s"
        )

    # 1.5) AI primitive author loop — for each beat that requested a NEW
    #      primitive (via `code._new`), author the .tsx, register it,
    #      sanity-render it. Up to 3 retries per primitive. On terminal
    #      failure, strip `code` from that beat (renders as black; QA
    #      gate flags it at final render). On success, strip `_new` so
    #      the manifest contains only the standard `code` shape.
    remotion_root_arg = getattr(args, "remotion_root", "video-intro-remotion")
    new_primitive_requests = _collect_new_primitive_requests(brief)
    if new_primitive_requests:
        if args.skip_primitive_author:
            print(
                f"→ skipping AI primitive author ({len(new_primitive_requests)} requests pending; "
                f"--skip-primitive-author)",
            )
        else:
            print(
                f"→ AI primitive author: {len(new_primitive_requests)} new primitive(s) "
                f"requested by the brief",
            )
            agents_root = Path(__file__).resolve().parent.parent
            remotion_root_abs = Path(remotion_root_arg).resolve()
            for code_block in new_primitive_requests:
                name = code_block["primitive"]
                spec = code_block["_new"]
                ok, err = _author_one_primitive(
                    name=name,
                    description=spec.get("description", ""),
                    use_case=spec.get("use_case", ""),
                    props_schema=spec.get("props_schema", {}),
                    example_props=code_block.get("props", {}),
                    remotion_root=remotion_root_abs,
                    agents_root=agents_root,
                    max_retries=3,
                    skip_visual_critique=args.skip_visual_critique,
                )
                # Always strip _new from the manifest (metadata, not for
                # the renderer).
                del code_block["_new"]
                if not ok:
                    print(
                        f"  ✗ {name} authoring failed after retries: {err.splitlines()[0] if err else 'no detail'}",
                    )
                    # Strip the code field entirely so the beat falls
                    # back to caption-on-black; QA will flag it.
                    code_block.clear()
                    # Also strip any OTHER beats in the brief that
                    # reference the same primitive name. The brief LLM
                    # sometimes declares a primitive via `_new` in one
                    # beat and reuses it in another without `_new` —
                    # those siblings survive the loop above because they
                    # weren't in `new_primitive_requests`. Without this
                    # sweep, the manifest ends up with dangling references
                    # to a primitive that no longer exists on disk,
                    # which renders as the "primitive not implemented"
                    # debug marker.
                    for sibling_beat in brief.get("beats", []):
                        sibling_code = (
                            sibling_beat.get("visual", {})
                            .get("renderer_hint", {})
                            .get("code")
                        )
                        if (
                            isinstance(sibling_code, dict)
                            and sibling_code is not code_block
                            and sibling_code.get("primitive") == name
                        ):
                            sibling_code.clear()
                            print(
                                f"    (also cleared dangling reference in beat "
                                f"{sibling_beat.get('id', '?')!r})"
                            )
        # Re-write the brief.json so it reflects the post-author state.
        brief_path.write_text(json.dumps(brief, indent=2))

    # 2) TTS — only if --skip-tts is not set (useful when iterating on brief alone)
    if args.skip_tts:
        print("→ skipping TTS (--skip-tts)")
    else:
        print("→ synthesizing narration via ElevenLabs…")
        apply_tts(brief, audio_path)
        print(
            f"  ✓ wrote {audio_path.name}: "
            f"{brief['narration']['audio_duration_s']:.2f}s, "
            f"{len(brief['narration']['word_timings'])} word timings"
        )
        brief_path.write_text(json.dumps(brief, indent=2))

    # 3) Manifest — same shape as brief plus a `render` block for Remotion
    manifest = dict(brief)
    manifest["render"] = {
        "audio_path_local": audio_path.name if not args.skip_tts else None,
        "duration_s": brief["beats"][-1]["end_s"],
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    print(f"  ✓ wrote {manifest_path.name}")

    # 4) Copy audio + manifest into the Remotion project so it's ready
    #    to render. Audio is only staged when TTS ran; the manifest is
    #    staged either way so --skip-tts (or --brief-file with skip-tts)
    #    still produces a renderable manifest. Skipping the manifest
    #    stage caused a subtle bug: Remotion's defaultProps fallback
    #    (ex1-stub) would render in place of the intended manifest
    #    because `--props=<bare-brief>` doesn't override defaultProps
    #    when the prop name `manifest` isn't in the props blob.
    if args.remotion_root:
        remotion = Path(args.remotion_root)
        public = remotion / "public"
        manifests = remotion / "manifests"
        public.mkdir(parents=True, exist_ok=True)
        manifests.mkdir(parents=True, exist_ok=True)
        if not args.skip_tts:
            dest_audio = public / audio_path.name
            shutil.copy2(audio_path, dest_audio)
            # Rewrite audio_path_local relative to public/ AND clear
            # narration.audio_url (the latter would otherwise contain a
            # Python-side filesystem path that Remotion would 404 on
            # when treated as a URL).
            manifest["render"]["audio_path_local"] = audio_path.name
            manifest["narration"]["audio_url"] = None
        dest_manifest = manifests / f"{out_dir.name}.json"
        # IMPORTANT: Remotion's --props merges at the top level. The
        # component expects a single `manifest` prop, so we must wrap
        # the JSON. Without this wrap, Remotion sees a flat props blob
        # that doesn't override defaultProps.manifest, and falls back
        # to the ex1-stub manifest hardcoded in Root.tsx.
        dest_manifest.write_text(json.dumps({"manifest": manifest}, indent=2))
        print(f"  ✓ staged for Remotion: {dest_manifest}")
        print()
        print(f"    Render with:")
        print(
            f"      cd {remotion}"
            f" && npx remotion render src/index.ts IntroVideo "
            f"out/{out_dir.name}.mp4 --props=./manifests/{out_dir.name}.json"
        )

    return 0


def cmd_render(args: argparse.Namespace) -> int:
    """Run `npx remotion render` then qa_gate.py on the output. One command
    so every code-tier render gets a brightness/dead-frame check — critical
    now that the generative tier is gone and beats without a fitting
    primitive render as black.

    The QA report is written as a sidecar `.qa.json` next to the MP4 so
    the /dev/lesson-intros preview page can surface PASS/FAIL.
    """
    remotion = Path(args.remotion_root).resolve()
    if not remotion.is_dir():
        print(f"✗ remotion root not found: {remotion}", file=sys.stderr)
        return 2

    manifest_path = remotion / "manifests" / f"{args.name}.json"
    if not manifest_path.is_file():
        print(f"✗ manifest not found: {manifest_path}", file=sys.stderr)
        return 2

    out_path = remotion / "out" / f"{args.name}.mp4"
    out_path.parent.mkdir(parents=True, exist_ok=True)

    # 1) Remotion render.
    print(f"→ rendering {manifest_path.name} → {out_path.relative_to(remotion)}")
    render = subprocess.run(
        [
            "npx",
            "remotion",
            "render",
            "src/index.ts",
            "IntroVideo",
            f"out/{args.name}.mp4",
            f"--props=./manifests/{args.name}.json",
        ],
        cwd=remotion,
    )
    if render.returncode != 0:
        print(f"✗ remotion render failed (exit {render.returncode})", file=sys.stderr)
        return render.returncode

    # 2) QA gate — writes the sidecar + exits 0/1 on PASS/FAIL.
    qa_script = remotion / "scripts" / "qa_gate.py"
    qa_report = out_path.with_suffix(".qa.json")
    print(f"→ running QA gate (brightness + dead-frame check)")
    qa = subprocess.run(
        [
            sys.executable,
            str(qa_script),
            str(out_path),
            "--report",
            str(qa_report),
            "--max-dead-frame-seconds",
            str(args.max_dead_frame_seconds),
        ],
    )
    print(f"  ✓ wrote {qa_report.relative_to(remotion)}")

    if qa.returncode != 0 and not args.allow_qa_fail:
        print(
            f"\n✗ QA FAILED. The rendered MP4 has a dead-frame run longer "
            f"than {args.max_dead_frame_seconds}s while audio is active — "
            f"meaning one or more beats fell through to black with no "
            f"visual. Common causes:\n"
            f"  - Brief author omitted `code` on a beat with narration\n"
            f"  - A primitive raised at runtime (check the render logs)\n"
            f"  - Beat boundaries are misaligned with the actual audio\n"
            f"\nRe-run with --allow-qa-fail to keep the MP4 anyway.",
            file=sys.stderr,
        )
        return qa.returncode

    return 0


def _collect_new_primitive_requests(brief: dict) -> list[dict]:
    """Walk the brief's beats and return every `code` block that has a
    `_new` field — those are the AI-author requests. The returned list
    contains references to the actual dicts inside the brief, so
    mutating them (deleting `_new`, clearing on failure) updates the
    brief in place."""
    out: list[dict] = []
    for beat in brief.get("beats", []):
        code = beat.get("visual", {}).get("renderer_hint", {}).get("code")
        if isinstance(code, dict) and isinstance(code.get("_new"), dict):
            out.append(code)
    return out


def _author_one_primitive(
    *,
    name: str,
    description: str,
    use_case: str,
    props_schema: dict,
    example_props: dict,
    remotion_root: Path,
    agents_root: Path,
    max_retries: int,
    skip_visual_critique: bool = False,
) -> tuple[bool, str]:
    """Author + register + sanity-render one primitive in three phases:
      0. sketch_composition — commit to a layout up front
      1. author_primitive_static — write static SVG matching the sketch
      2. author_primitive_living — layer in shimmer / jitter / reveals

    Each phase retries on sanity-render / visual-critique failure up to
    `max_retries` times. Phase 1 failure terminally reverts. Phase 2
    failure falls back to the (already-on-spec) static version — the
    composition is the must-have; living treatment is nice-to-have.

    Returns (ok, error_log)."""
    print(f"  → authoring `{name}`: {description.splitlines()[0][:80]}")

    component_name = derive_pascal_case(name)
    component_file = remotion_root / "src" / "primitives" / f"{component_name}.tsx"

    # ── Phase 0: composition sketch (no retries — cheap, planning only) ──
    print(f"    → composition sketch …", flush=True)
    try:
        sketch = sketch_composition(
            name=name,
            description=description,
            use_case=use_case,
            props_schema=props_schema,
            example_props=example_props,
            remotion_root=remotion_root,
        )
    except Exception as exc:
        return False, f"sketch_composition failed: {exc}"
    print(f"      focal: {sketch.focal_point[:90]}")
    print(f"      shapes: {len(sketch.shape_inventory)} elements")

    # ── Phase 1: static SVG ──
    static_source: str | None = None
    last_error = ""
    authored: AuthoredPrimitive | None = None
    for attempt in range(max_retries + 1):
        try:
            if attempt == 0:
                print(f"    → static author (attempt {attempt + 1}/{max_retries + 1}) …", flush=True)
                authored = author_primitive_static(
                    name=name,
                    description=description,
                    use_case=use_case,
                    props_schema=props_schema,
                    example_props=example_props,
                    sketch=sketch,
                    remotion_root=remotion_root,
                )
            else:
                assert authored is not None
                print(f"    → static revise (attempt {attempt + 1}/{max_retries + 1}) …", flush=True)
                authored = revise_primitive(
                    name=name,
                    component_name=authored.component_name,
                    previous_source=authored.source_tsx,
                    error_log=last_error,
                    remotion_root=remotion_root,
                )
        except Exception as exc:
            return False, f"static author phase failed: {exc}"

        ok, err = _write_register_validate(
            authored=authored,
            name=name,
            description=description,
            use_case=use_case,
            props_schema=props_schema,
            example_props=example_props,
            component_file=component_file,
            remotion_root=remotion_root,
            agents_root=agents_root,
            attempt=attempt,
            max_retries=max_retries,
            skip_visual_critique=skip_visual_critique,
            phase_label="static",
        )
        if ok:
            static_source = authored.source_tsx
            break
        last_error = err
    else:
        # Phase 1 retries exhausted without success.
        _revert_primitive_full(
            name=name,
            component_name=component_name,
            remotion_root=remotion_root,
            agents_root=agents_root,
        )
        return False, last_error

    assert static_source is not None
    assert authored is not None
    static_component_name = authored.component_name

    # ── Phase 2: living treatment ──
    last_error = ""
    living_authored: AuthoredPrimitive | None = None
    for attempt in range(max_retries + 1):
        try:
            if attempt == 0:
                print(f"    → living author (attempt {attempt + 1}/{max_retries + 1}) …", flush=True)
                living_authored = author_primitive_living(
                    name=name,
                    component_name=static_component_name,
                    static_source=static_source,
                    sketch=sketch,
                    remotion_root=remotion_root,
                )
            else:
                assert living_authored is not None
                print(f"    → living revise (attempt {attempt + 1}/{max_retries + 1}) …", flush=True)
                living_authored = revise_primitive(
                    name=name,
                    component_name=static_component_name,
                    previous_source=living_authored.source_tsx,
                    error_log=last_error,
                    remotion_root=remotion_root,
                )
        except Exception as exc:
            # Living-phase author errored. Static version is already on
            # disk + on-spec; ship it as the final.
            print(f"    ⚠ living author errored ({exc}); keeping static-only as final")
            component_file.write_text(static_source)
            return True, ""

        ok, err = _write_register_validate(
            authored=living_authored,
            name=name,
            description=description,
            use_case=use_case,
            props_schema=props_schema,
            example_props=example_props,
            component_file=component_file,
            remotion_root=remotion_root,
            agents_root=agents_root,
            attempt=attempt,
            max_retries=max_retries,
            skip_visual_critique=skip_visual_critique,
            phase_label="living",
        )
        if ok:
            return True, ""
        last_error = err

    # Phase 2 retries exhausted. Roll the file back to the static-only
    # version we know passes critique. The composition is still on-spec;
    # it just won't have shimmer / jitter / reveal animations.
    print(f"    ⚠ living phase failed after {max_retries + 1} attempts; rolling back to static")
    component_file.write_text(static_source)
    return True, ""


def _revert_primitive_full(
    *,
    name: str,
    component_name: str,
    remotion_root: Path,
    agents_root: Path,
) -> None:
    """Strip registrations + delete component file + drop in-memory
    state. Shared between the orchestrator's failure path and the
    phase-1 exhaust path in _author_one_primitive."""
    revert_primitive(
        name=name,
        component_name=component_name,
        remotion_root=remotion_root,
        agents_root=agents_root,
    )
    from . import brief_generator as bg_module
    if name in bg_module.KNOWN_PRIMITIVES:
        bg_module.KNOWN_PRIMITIVES.remove(name)
    bg_module._BUILTIN_PRIMITIVE_DOCS.pop(name, None)


def _write_register_validate(
    *,
    authored: AuthoredPrimitive,
    name: str,
    description: str,
    use_case: str,
    props_schema: dict,
    example_props: dict,
    component_file: Path,
    remotion_root: Path,
    agents_root: Path,
    attempt: int,
    max_retries: int,
    skip_visual_critique: bool,
    phase_label: str,
) -> tuple[bool, str]:
    """Per-attempt inner cycle: write the .tsx, run idempotent patchers,
    sanity-render, and visual-critique. Returns (ok, error_log_for_revise).

    Shared between phase 1 (static) and phase 2 (living). The phase_label
    only affects log messages — both phases use the same validation
    gates because the gates check the rendered output, not the source
    structure."""
    # Write the .tsx (overwrites any previous attempt).
    component_file.parent.mkdir(parents=True, exist_ok=True)
    component_file.write_text(authored.source_tsx)

    # Register in all 4 sites. Idempotent — second-pass writes are no-ops.
    # CRITICAL: must run before sanity_render. Otherwise the synthetic
    # manifest's `primitive: <name>` falls through IntroVideo.tsx's switch
    # default ("[primitive not implemented: <name>]") and sanity_render
    # passes anyway because the placeholder renders to a valid MP4.
    patch_intro_video(
        name=name,
        component_name=authored.component_name,
        remotion_root=remotion_root,
    )
    patch_manifest_types(
        name=name,
        props_type_snippet=authored.props_type_snippet,
        remotion_root=remotion_root,
    )
    patch_brief_enum(name=name, agents_root=agents_root)
    patch_brief_docs(
        name=name,
        doc=authored.brief_doc,
        agents_root=agents_root,
    )

    # In-memory updates so subsequent generate_brief calls in the same
    # process see the new vocabulary + real prop docs.
    from . import brief_generator as bg_module
    if name not in bg_module.KNOWN_PRIMITIVES:
        bg_module.KNOWN_PRIMITIVES.append(name)
    bg_module._BUILTIN_PRIMITIVE_DOCS[name] = authored.brief_doc

    # Sanity-render: tsc + 5-frame render.
    print(
        f"    → sanity render ({phase_label}, attempt {attempt + 1}/{max_retries + 1})…",
        flush=True,
    )
    result = sanity_render(
        name=name,
        example_props=example_props,
        remotion_root=remotion_root,
    )
    if not result.ok:
        print(
            f"    ✗ sanity failed ({result.stage}); "
            f"{len(result.stderr)} chars of stderr captured"
        )
        return False, result.stderr

    # Sanity passed. If visual critique is enabled, render one mid-beat
    # frame and run a vision-based composition check before declaring
    # success. The critic catches primitives that compile + render but
    # look like AI-art mess (broken shapes, floating fragments, attempted
    # figures that read as garbled).
    if skip_visual_critique:
        print(
            f"    ✓ sanity passed; saved {component_file.relative_to(remotion_root)} "
            f"({phase_label}, visual critique skipped)"
        )
        return True, ""

    print(
        f"    → visual critique ({phase_label}, attempt {attempt + 1}/{max_retries + 1})…",
        flush=True,
    )
    frame_path = capture_critique_frame(
        name=name,
        example_props=example_props,
        remotion_root=remotion_root,
    )
    if frame_path is None:
        # Critique frame render failed — don't fail the primitive on a
        # transient render issue. Sanity already passed.
        print(
            f"    ⚠ critique frame render failed; accepting on sanity-pass alone "
            f"({phase_label})"
        )
        return True, ""

    try:
        critique = critique_primitive(
            name=name,
            description=description,
            use_case=use_case,
            props_schema=props_schema,
            frame_path=frame_path,
        )
    except Exception as exc:
        # Critique call itself errored (network, model glitch). Don't
        # fail the primitive on infrastructure issues.
        print(
            f"    ⚠ critique call errored ({exc}); accepting on sanity-pass alone "
            f"({phase_label})"
        )
        try:
            frame_path.unlink()
        except FileNotFoundError:
            pass
        return True, ""

    if critique.ok:
        print(f"    ✓ critique passed ({phase_label}): {critique.rationale}")
        try:
            frame_path.unlink()
        except FileNotFoundError:
            pass
        return True, ""

    # Critique failed — return the rationale so the caller's retry loop
    # can feed it to revise_primitive. Keep the frame on disk so the
    # user can inspect it from logs.
    cats = ", ".join(critique.failure_categories) or "(no categories)"
    print(f"    ✗ critique failed [{cats}]: {critique.rationale}")
    print(f"    (rendered frame retained at {frame_path})")
    err_msg = (
        f"VISUAL CRITIQUE FAILURE ({phase_label} phase) — your primitive "
        "compiled and rendered, but the rendered frame violates the "
        f"composition rules in the system prompt. Failure categories: "
        f"{cats}. Specific critique:\n\n{critique.rationale}\n\n"
        "Revise the primitive to address this critique. Simplify the "
        "composition if needed — a clean abstraction is always better "
        "than a complex scene that reads as broken."
    )
    return False, err_msg


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="video_intro")
    sub = parser.add_subparsers(dest="cmd", required=True)

    g = sub.add_parser("generate", help="topic → brief + audio + manifest")
    # These four are required for Claude brief generation. When loading
    # a hand-authored brief via --brief-file, they're ignored — the
    # brief carries its own topic + concept fields.
    g.add_argument("--topic-slug", required=False)
    g.add_argument("--subtopic-slug", required=False)
    g.add_argument("--topic-name", required=False)
    g.add_argument("--subtopic-name", required=False)
    g.add_argument("--target-duration-s", type=float, default=30.0)
    g.add_argument(
        "--brief-file",
        type=Path,
        help=(
            "Load a hand-authored brief from disk instead of asking "
            "Claude to generate one. The brief still flows through the "
            "primitive-author + TTS + manifest pipeline as usual — "
            "useful for deliberately seeding the primitive library "
            "with specific `_new` requests, or reproducing a known brief."
        ),
    )
    g.add_argument(
        "--style-strategy",
        choices=["applied", "metaphorical", "literal"],
        default=None,
        help=(
            "Hint passed to the brief LLM. If omitted, auto-picks "
            "'applied' for --role intro and 'metaphorical' for "
            "--role wrap-up."
        ),
    )
    g.add_argument(
        "--role",
        choices=["intro", "wrap-up"],
        default="intro",
        help=(
            "Which kind of video to author. 'intro' (default) hooks "
            "BEFORE the lesson with real-world stakes. 'wrap-up' plays "
            "AFTER the lesson and locks the concept into memory via "
            "ONE sustained embodied analogy. Ignored when --brief-file "
            "is set (the brief carries its own role in _meta)."
        ),
    )
    g.add_argument(
        "--out",
        type=Path,
        required=True,
        help="Output directory (will be created)",
    )
    g.add_argument(
        "--skip-tts",
        action="store_true",
        help="Skip ElevenLabs synthesis (useful when iterating on the brief prompt only)",
    )
    g.add_argument(
        "--skip-primitive-author",
        action="store_true",
        help=(
            "Skip the AI primitive author loop. If the brief requests "
            "new primitives via `_new`, beats fall back to caption-on-"
            "black (QA will flag them). Useful when iterating on the "
            "brief prompt without burning Claude credits on primitive "
            "authoring."
        ),
    )
    g.add_argument(
        "--skip-visual-critique",
        action="store_true",
        help=(
            "Skip the post-sanity-render visual critique step for AI-"
            "authored primitives. The critique adds ~10s + one Claude "
            "vision call (~$0.02-0.05) per primitive, in exchange for "
            "catching primitives that compile + render but look like "
            "broken AI art. Use this flag when iterating on the brief "
            "prompt and you don't want the critique latency / cost."
        ),
    )
    g.add_argument(
        "--remotion-root",
        default="video-intro-remotion",
        help="Path to the Remotion project; audio + manifest are staged here",
    )
    g.set_defaults(func=cmd_generate)

    # render: wraps `npx remotion render` + QA gate (brightness check).
    # `--name` is the manifest stem; assumes manifests/<name>.json exists
    # in the remotion project (which is what `generate` stages by default).
    r = sub.add_parser(
        "render",
        help="render staged manifest via Remotion + run QA gate on the MP4",
    )
    r.add_argument(
        "--name",
        required=True,
        help="Manifest stem (matches --out dirname from `generate`)",
    )
    r.add_argument(
        "--remotion-root",
        default="../video-intro-remotion",
        help="Path to the Remotion project (default assumes you're in agents/)",
    )
    r.add_argument(
        "--max-dead-frame-seconds",
        type=float,
        default=1.0,
        help="Fail QA if any contiguous dead-frame run exceeds this many seconds",
    )
    r.add_argument(
        "--allow-qa-fail",
        action="store_true",
        help="Keep the MP4 even if QA fails (default: surface the failure as a non-zero exit)",
    )
    r.set_defaults(func=cmd_render)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
