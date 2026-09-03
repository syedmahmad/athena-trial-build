"""
Section-marker file patchers for the AI primitive author loop.

Each registration file (IntroVideo.tsx, manifest.ts, brief_generator.py)
has a pair of `// ── PRIMITIVE_REGISTRATIONS:start ──` and
`── PRIMITIVE_REGISTRATIONS:end ──` comment markers. The functions in
this module insert new entries between those markers — idempotent (if
the new entry's name is already present in the slot, it's a no-op).

Why regex / marker-based instead of AST: the registration sites are
small, well-bounded, and only mutated by this module. Markers stay
visible in source so a human reviewer can see exactly where AI edits
landed and revert them with a normal text edit. AST manipulation would
be more robust but adds a TS-compiler / tree-sitter dependency for
maybe 60 lines of mutation logic — not worth it at this scale.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import NamedTuple


class PatchResult(NamedTuple):
    """Result of a single patch. `inserted=False` means the entry was
    already present (idempotent no-op)."""

    file: Path
    inserted: bool
    snippet: str


_TS_IMPORTS_MARKER_RE = re.compile(
    r"(// ── PRIMITIVE_IMPORTS:start ──+[^\n]*\n)(.*?)(// ── PRIMITIVE_IMPORTS:end ──+[^\n]*\n)",
    re.DOTALL,
)
_TS_REG_MARKER_RE = re.compile(
    r"(// ── PRIMITIVE_REGISTRATIONS:start ──+[^\n]*\n)(.*?)(// ── PRIMITIVE_REGISTRATIONS:end ──+[^\n]*\n)",
    re.DOTALL,
)
_PY_REG_MARKER_RE = re.compile(
    r"(#[ ]*── PRIMITIVE_REGISTRATIONS:start ──+[^\n]*\n)(.*?)(#[ ]*── PRIMITIVE_REGISTRATIONS:end ──+[^\n]*\n)",
    re.DOTALL,
)
_PY_DOCS_MARKER_RE = re.compile(
    r"(#[ ]*── PRIMITIVE_DOCS:start ──+[^\n]*\n)(.*?)(#[ ]*── PRIMITIVE_DOCS:end ──+[^\n]*\n)",
    re.DOTALL,
)


def _replace_between_markers(
    content: str,
    marker_re: re.Pattern[str],
    new_inside: str,
    must_contain: str,
) -> tuple[str, bool]:
    """Replace the text BETWEEN start/end markers, preserving the markers
    themselves. Returns (new_content, inserted). If the inside already
    contains `must_contain` (exact substring), the patch is a no-op
    and returns (content_unchanged, False)."""
    m = marker_re.search(content)
    if not m:
        raise RuntimeError(
            f"PRIMITIVE_REGISTRATIONS markers not found in target file"
        )
    inside = m.group(2)
    if must_contain in inside:
        return content, False
    new_text = m.group(1) + inside + new_inside + m.group(3)
    return content[: m.start()] + new_text + content[m.end() :], True


def patch_intro_video(
    *,
    name: str,
    component_name: str,
    remotion_root: Path,
) -> tuple[PatchResult, PatchResult]:
    """Add the import + switch case for `name` (snake_case primitive
    identifier) → `component_name` (PascalCase React component).

    `remotion_root` is the path to `video-intro-remotion/`. The file
    edited is `<remotion_root>/src/IntroVideo.tsx`.

    Two edits — the imports section and the switch section — returned
    as separate PatchResults.
    """
    target = remotion_root / "src" / "IntroVideo.tsx"
    content = target.read_text()

    # 1) Import.
    import_line = (
        f'import {{ {component_name} }} from "./primitives/{component_name}";\n'
    )
    new_content, import_inserted = _replace_between_markers(
        content,
        _TS_IMPORTS_MARKER_RE,
        import_line,
        must_contain=f'from "./primitives/{component_name}"',
    )

    # 2) Switch case.
    case_block = (
        f'    case "{name}":\n'
        f"      return (\n"
        f"        <{component_name}\n"
        f"          {{...prim.props}}\n"
        f"          beatDurationFrames={{beatDurationFrames}}\n"
        f"        />\n"
        f"      );\n"
    )
    new_content, case_inserted = _replace_between_markers(
        new_content,
        _TS_REG_MARKER_RE,
        case_block,
        must_contain=f'case "{name}"',
    )

    if import_inserted or case_inserted:
        target.write_text(new_content)

    return (
        PatchResult(file=target, inserted=import_inserted, snippet=import_line),
        PatchResult(file=target, inserted=case_inserted, snippet=case_block),
    )


def patch_manifest_types(
    *,
    name: str,
    props_type_snippet: str,
    remotion_root: Path,
) -> PatchResult:
    """Add a discriminated-union member to CodePrimitive in manifest.ts.

    `props_type_snippet` is the TypeScript shape for props (without the
    outer braces or `primitive:` field), e.g.:

        x_range?: [number, number];
        y_range?: [number, number];

    The function wraps it in the standard discriminated-union member
    shape and inserts it between the PRIMITIVE_REGISTRATIONS markers.
    """
    target = remotion_root / "src" / "types" / "manifest.ts"
    content = target.read_text()

    union_member = (
        f"  | {{\n"
        f'      primitive: "{name}";\n'
        f"      props: {{\n"
        + "\n".join(f"        {ln.strip()}" for ln in props_type_snippet.strip().splitlines() if ln.strip())
        + "\n"
        f"      }};\n"
        f"      anchor_id?: string;\n"
        f"    }}\n"
    )

    new_content, inserted = _replace_between_markers(
        content,
        _TS_REG_MARKER_RE,
        union_member,
        must_contain=f'primitive: "{name}"',
    )

    if inserted:
        target.write_text(new_content)

    return PatchResult(file=target, inserted=inserted, snippet=union_member)


def patch_brief_enum(*, name: str, agents_root: Path) -> PatchResult:
    """Add a string to the KNOWN_PRIMITIVES list in brief_generator.py
    (which feeds the per-request system prompt via build_system_prompt).

    `agents_root` is the path to `agents/`. The file edited is
    `<agents_root>/video_intro/brief_generator.py`.
    """
    target = agents_root / "video_intro" / "brief_generator.py"
    content = target.read_text()

    # KNOWN_PRIMITIVES is a top-level list — entries are 4-space indented.
    indent = " " * 4
    new_entry = f'{indent}"{name}",\n'

    new_content, inserted = _replace_between_markers(
        content,
        _PY_REG_MARKER_RE,
        new_entry,
        # Search for the quoted name within the list to dedupe.
        must_contain=f'"{name}"',
    )

    if inserted:
        target.write_text(new_content)

    return PatchResult(file=target, inserted=inserted, snippet=new_entry)


def patch_brief_docs(*, name: str, doc: str, agents_root: Path) -> PatchResult:
    """Insert a `_BUILTIN_PRIMITIVE_DOCS` entry for an AI-authored primitive
    between the `PRIMITIVE_DOCS:start/end` markers in brief_generator.py.

    `doc` is a single-sentence natural-language description matching the
    shape of the hand-written entries (one sentence describing the
    primitive + a `Props: …` enumeration). The author LLM produces this
    as part of its tool-use output so the brief generator sees the
    primitive's real prop schema on subsequent calls.

    The dict literal we're patching uses 4-space indentation; we match
    that. The doc string is JSON-encoded so backticks, quotes, and
    newlines survive the round-trip into a Python source file.
    """
    target = agents_root / "video_intro" / "brief_generator.py"
    content = target.read_text()

    indent = " " * 4
    # `json.dumps` gives us a properly-escaped Python-compatible string
    # literal (double-quoted, with \n / \" / \\ as needed). Collapse any
    # CR-LF the LLM might have emitted so the dict literal stays flat
    # (one entry per line).
    encoded = json.dumps(doc.replace("\r\n", "\n").replace("\n", " ").strip())
    new_entry = f'{indent}"{name}": {encoded},\n'

    new_content, inserted = _replace_between_markers(
        content,
        _PY_DOCS_MARKER_RE,
        new_entry,
        must_contain=f'"{name}":',
    )

    if inserted:
        target.write_text(new_content)

    return PatchResult(file=target, inserted=inserted, snippet=new_entry)


def revert_primitive(
    *,
    name: str,
    component_name: str,
    remotion_root: Path,
    agents_root: Path,
) -> list[PatchResult]:
    """Best-effort revert: strip the import / case / type / enum entries
    for `name` from all 4 registration sites + delete the primitive
    component file. Used when sanity-render fails and we want to leave
    the tree clean for a retry.

    Idempotent: missing entries are silently skipped.
    """
    results: list[PatchResult] = []

    intro_video = remotion_root / "src" / "IntroVideo.tsx"
    intro_content = intro_video.read_text()
    # Strip import line (handle either single- or multi-import block).
    import_re = re.compile(
        rf'import\s*{{\s*{re.escape(component_name)}\s*}}\s*from\s*"\./primitives/{re.escape(component_name)}";\n',
    )
    new_intro = import_re.sub("", intro_content)
    # Strip switch case block.
    case_re = re.compile(
        rf'    case "{re.escape(name)}":\n'
        rf"      return \(\n"
        rf"        <{re.escape(component_name)}\n"
        rf"          \{{\.\.\.prim\.props\}}\n"
        rf"          beatDurationFrames=\{{beatDurationFrames\}}\n"
        rf"        />\n"
        rf"      \);\n",
    )
    new_intro = case_re.sub("", new_intro)
    if new_intro != intro_content:
        intro_video.write_text(new_intro)
        results.append(PatchResult(file=intro_video, inserted=False, snippet=""))

    manifest_ts = remotion_root / "src" / "types" / "manifest.ts"
    manifest_content = manifest_ts.read_text()
    member_re = re.compile(
        rf'  \| \{{\n      primitive: "{re.escape(name)}";\n      props: \{{[^}}]*\}};\n      anchor_id\?: string;\n    \}}\n',
        re.DOTALL,
    )
    new_manifest = member_re.sub("", manifest_content)
    if new_manifest != manifest_content:
        manifest_ts.write_text(new_manifest)
        results.append(PatchResult(file=manifest_ts, inserted=False, snippet=""))

    brief_py = agents_root / "video_intro" / "brief_generator.py"
    brief_content = brief_py.read_text()
    # Strip KNOWN_PRIMITIVES entry (a bare string in a list).
    enum_re = re.compile(rf'^[ ]+"{re.escape(name)}",\n', re.MULTILINE)
    new_brief = enum_re.sub("", brief_content)
    # Strip _BUILTIN_PRIMITIVE_DOCS entry (a dict member: "name": "doc").
    # Match the whole line greedily but stop at the trailing comma+newline.
    docs_re = re.compile(rf'^[ ]+"{re.escape(name)}":[^\n]*,\n', re.MULTILINE)
    new_brief = docs_re.sub("", new_brief)
    if new_brief != brief_content:
        brief_py.write_text(new_brief)
        results.append(PatchResult(file=brief_py, inserted=False, snippet=""))

    component_file = remotion_root / "src" / "primitives" / f"{component_name}.tsx"
    if component_file.exists():
        component_file.unlink()
        results.append(PatchResult(file=component_file, inserted=False, snippet=""))

    return results
