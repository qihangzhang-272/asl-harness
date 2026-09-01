from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path

from .workspace import GENERATED_DIRECTORIES, HarnessError, Workspace, package_fingerprint


MANAGED_START = "<!-- ASL:MODE START -->"
MANAGED_END = "<!-- ASL:MODE END -->"
COPY_MARKER = ".asl-projection.json"
PROJECTION_VERSION = 2
HOST_LAYOUTS = {
    "codex-app": {"skillRoot": ".agents/skills", "instructionFile": "AGENTS.md"},
    "claude-code": {"skillRoot": ".claude/skills", "instructionFile": "CLAUDE.md"},
    "deepseek-harness": {"skillRoot": ".dsh/skills", "instructionFile": "AGENTS.md"},
}
HOST_DISPLAY_NAMES = {
    "codex-app": "Codex App",
    "claude-code": "Claude Code",
    "deepseek-harness": "DeepSeek Harness",
}
RUNTIME_REQUIREMENTS = re.compile(r"(?m)^##[ \t]+运行依赖[ \t]*$")


def _layout(host_id: str) -> dict[str, str]:
    layout = HOST_LAYOUTS.get(host_id)
    if layout is None:
        raise HarnessError("HOST_UNSUPPORTED", f"unsupported Host adapter: {host_id}")
    return layout


def _contained(project: Path, relative: str) -> Path:
    authored = Path(relative)
    if authored.is_absolute() or ".." in authored.parts:
        raise HarnessError("PATH_ESCAPE", f"Host path escapes the project: {relative}")
    return project / authored


def _manifest_path(project: Path, host_id: str) -> Path:
    return project / ".asl" / "host-projections" / host_id / "current.json"


def _read_manifest(path: Path) -> dict | None:
    if not path.is_file():
        return None
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise HarnessError(
            "HOST_PROJECTION_INVALID", f"Host projection manifest is unreadable: {path}"
        ) from error
    if not isinstance(value, dict):
        raise HarnessError("HOST_PROJECTION_INVALID", "Host projection manifest is invalid")
    return value


def _is_junction(path: Path) -> bool:
    if sys.platform != "win32" or path.is_symlink():
        return False
    try:
        return bool(path.lstat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
    except (AttributeError, FileNotFoundError, OSError):
        return False


def _exists(path: Path) -> bool:
    try:
        path.lstat()
        return True
    except FileNotFoundError:
        return False


def _copy_marker(path: Path) -> dict | None:
    marker = path / COPY_MARKER
    try:
        value = json.loads(marker.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _ignore_generated(_directory: str, names: list[str]) -> set[str]:
    return {name for name in names if name in GENERATED_DIRECTORIES or name == ".git"}


def _managed_target_matches(project: Path, item: dict, environment: Path) -> bool:
    relative = item.get("nativePath")
    skill_id = item.get("skill")
    projection = item.get("projection")
    if not isinstance(relative, str) or not isinstance(skill_id, str):
        raise HarnessError("HOST_PROJECTION_INVALID", "Host projection entry is invalid")
    target = _contained(project, relative)
    if not _exists(target):
        return True
    source = environment / "skills" / skill_id
    marker = _copy_marker(target) if target.is_dir() else None
    return bool(
        projection == "link" and target.is_symlink() and target.resolve() == source.resolve()
        or projection == "junction"
        and _is_junction(target)
        and target.resolve() == source.resolve()
        or projection == "copy"
        and marker is not None
        and marker.get("environment") == str(environment)
        and marker.get("skill") == skill_id
    )


def _write_copy_marker(
    target: Path, workspace: Workspace, mode_id: str, skill_id: str, fingerprint: str
) -> None:
    value = {
        "environment": str(workspace.root),
        "mode": mode_id,
        "skill": skill_id,
        "skillFingerprint": fingerprint,
    }
    (target / COPY_MARKER).write_text(
        json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        + "\n",
        encoding="utf-8",
    )


def _project_skill(
    workspace: Workspace,
    project: Path,
    mode_id: str,
    host_id: str,
    skill_id: str,
    fingerprint: str,
) -> dict:
    layout = _layout(host_id)
    relative = f"{layout['skillRoot']}/{skill_id}"
    target = _contained(project, relative)
    if _exists(target):
        raise HarnessError(
            "HOST_PROJECTION_COLLISION", f"Host Skill path already exists: {target}"
        )
    source = workspace.skills[skill_id].path
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        target.symlink_to(source, target_is_directory=True)
        projection = "link"
    except OSError:
        projection = "copy"
        if sys.platform == "win32":
            result = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(target), str(source)],
                capture_output=True,
                text=True,
            )
            if result.returncode == 0 and _is_junction(target):
                projection = "junction"
        if projection == "copy":
            shutil.copytree(
                source, target, symlinks=False, ignore=_ignore_generated
            )
            _write_copy_marker(target, workspace, mode_id, skill_id, fingerprint)
    return {
        "skill": skill_id,
        "nativePath": relative,
        "projection": projection,
        "sourceFingerprint": fingerprint,
    }


def _mode_instructions(workspace: Workspace, mode_id: str) -> str:
    mode = workspace.modes[mode_id]
    if MANAGED_START in workspace.profile or MANAGED_END in workspace.profile:
        raise HarnessError("HOST_INSTRUCTION_COLLISION", "PROFILE.md contains ASL markers")
    if MANAGED_START in mode.document or MANAGED_END in mode.document:
        raise HarnessError("HOST_INSTRUCTION_COLLISION", "MODE.md contains ASL markers")
    return f"""## ASL current Mode: {mode_id}

Environment truth: `{workspace.root}`

### Compact Profile

{workspace.profile.strip()}

### Mode boundary

{mode.document.strip()}

### Hard rules

1. This Mode is a broad working environment and Skill subgraph, not a Workflow or fixed sequence.
2. Choose complete projected Skills dynamically from the user's Goal and current context. Read a Skill's full package before substantive use and satisfy its own completion standards even when it is one part of a larger task.
3. External Prompt, MCP, Agent, API, model, command, script, or remote Skill may be used only through a projected formal local Skill package. Follow that Skill's runtime dependency notes and use this Host's native MCP, login, permission, and plugin mechanisms; ASL does not add a second connection runtime. A user-directed source may be integrated directly after full review; Candidate and Trial are only for concrete uncertainty.
4. Keep one-off evidence, screenshots, drafts, and final Artifacts in the current Case or project; do not promote them into the Environment without an explicit maintenance task.
5. Record durable feedback only when the user clearly evaluates, corrects, or states a preference. Do not infer it from silence, timing, clicks, or other ambiguous behavior.
6. Do not infer durable Environment changes from ordinary work. When the user explicitly asks to add or change a long-term capability, use the Harness system maintenance path from the current Mode, change the smallest fitting truth, run deterministic validation, and leave a reviewable Git diff.
7. High-impact deletion, publication, payment, login, private-data access, messages, or external writes still require the current Host's native user-authorization boundary. Mode selection never grants that authority.

The current Host is the only executor. ASL Harness validates and projects this Mode; it does not route Skills, run a graph, or maintain a second Agent loop.
"""


def _instruction_fingerprint(block: str) -> str:
    return hashlib.sha256(block.strip().encode("utf-8")).hexdigest()


def _render_managed_block(existing: str, block: str, path: Path) -> str:
    if (
        existing.count(MANAGED_START) != existing.count(MANAGED_END)
        or existing.count(MANAGED_START) > 1
    ):
        raise HarnessError(
            "HOST_INSTRUCTION_COLLISION", f"managed instruction markers are invalid: {path}"
        )
    managed = f"{MANAGED_START}\n{block.strip()}\n{MANAGED_END}"
    if MANAGED_START in existing:
        before, remainder = existing.split(MANAGED_START, 1)
        _, after = remainder.split(MANAGED_END, 1)
        return before.rstrip() + ("\n\n" if before.strip() else "") + managed + after
    return existing.rstrip() + ("\n\n" if existing.strip() else "") + managed + "\n"


def _write_bytes_atomic(path: Path, content: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(content)
    try:
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def _replace_managed_block(path: Path, block: str) -> None:
    existing = path.read_text(encoding="utf-8") if path.is_file() else ""
    updated = _render_managed_block(existing, block, path)
    _write_bytes_atomic(path, updated.encode("utf-8"))


def _restore_file(path: Path, content: bytes | None) -> None:
    if content is None:
        if path.exists():
            path.unlink()
        return
    _write_bytes_atomic(path, content)


def _remove_projection_path(path: Path) -> None:
    if path.is_symlink():
        path.unlink()
    elif _is_junction(path):
        path.rmdir()
    elif path.is_dir():
        shutil.rmtree(path)
    elif _exists(path):
        path.unlink()


def project_mode(
    workspace: Workspace, project_root: str | Path, mode_id: str, *, host_id: str
) -> dict:
    project = Path(project_root).resolve()
    layout = _layout(host_id)
    if mode_id not in workspace.modes:
        raise HarnessError("MODE_NOT_ACTIVE", f"Mode is not active: {mode_id}")
    project.mkdir(parents=True, exist_ok=True)
    manifest_path = _manifest_path(project, host_id)
    old_manifest = _read_manifest(manifest_path)
    if old_manifest is not None and old_manifest.get("environment") != str(workspace.root):
        raise HarnessError(
            "HOST_PROJECTION_COLLISION",
            "Host project is already managed by a different ASL Environment",
        )
    fingerprint = workspace.source_fingerprint(mode_id)
    instruction = _contained(project, layout["instructionFile"])
    block = _mode_instructions(workspace, mode_id)
    existing_instruction = instruction.read_bytes() if instruction.is_file() else None
    _render_managed_block(
        existing_instruction.decode("utf-8") if existing_instruction is not None else "",
        block,
        instruction,
    )
    existing_manifest = manifest_path.read_bytes() if manifest_path.is_file() else None
    manifest_path.parent.mkdir(parents=True, exist_ok=True)

    old_items = [] if old_manifest is None else old_manifest.get("skillProjections")
    if not isinstance(old_items, list) or any(not isinstance(item, dict) for item in old_items):
        raise HarnessError("HOST_PROJECTION_INVALID", "Host projection manifest is invalid")
    old_paths = {item.get("nativePath") for item in old_items}
    for item in old_items:
        if not _managed_target_matches(project, item, workspace.root):
            raise HarnessError(
                "HOST_PROJECTION_COLLISION",
                "an existing Host projection is no longer owned by ASL",
            )

    with tempfile.TemporaryDirectory(
        prefix=".asl-project-", dir=manifest_path.parent
    ) as temporary:
        transaction = Path(temporary)
        staged_project = transaction / "staged"
        backup = transaction / "previous"
        projections = [
            _project_skill(
                workspace,
                staged_project,
                mode_id,
                host_id,
                skill_id,
                package_fingerprint(workspace.skills[skill_id].path),
            )
            for skill_id in workspace.mode_skill_ids(mode_id)
        ]
        for item in projections:
            relative = item["nativePath"]
            target = _contained(project, relative)
            if _exists(target) and relative not in old_paths:
                raise HarnessError(
                    "HOST_PROJECTION_COLLISION", f"Host Skill path already exists: {target}"
                )

        manifest = {
            "version": PROJECTION_VERSION,
            "operation": "mode.export",
            "environment": str(workspace.root),
            "environmentCommit": workspace.git_commit,
            "sourceFingerprint": fingerprint,
            "instructionFingerprint": _instruction_fingerprint(block),
            "mode": mode_id,
            "hostId": host_id,
            "skillProjections": projections,
            "managedSurfaces": [layout["instructionFile"]],
        }
        moved_old: list[tuple[Path, Path]] = []
        installed: list[Path] = []
        try:
            for item in old_items:
                target = _contained(project, item["nativePath"])
                if not _exists(target):
                    continue
                saved = _contained(backup, item["nativePath"])
                saved.parent.mkdir(parents=True, exist_ok=True)
                target.rename(saved)
                moved_old.append((saved, target))
            for item in projections:
                staged = _contained(staged_project, item["nativePath"])
                target = _contained(project, item["nativePath"])
                target.parent.mkdir(parents=True, exist_ok=True)
                staged.rename(target)
                installed.append(target)
            _replace_managed_block(instruction, block)
            _write_bytes_atomic(
                manifest_path,
                (
                    json.dumps(
                        manifest,
                        ensure_ascii=False,
                        sort_keys=True,
                        separators=(",", ":"),
                    )
                    + "\n"
                ).encode("utf-8"),
            )
        except BaseException:
            for target in reversed(installed):
                _remove_projection_path(target)
            for saved, target in reversed(moved_old):
                target.parent.mkdir(parents=True, exist_ok=True)
                saved.rename(target)
            _restore_file(instruction, existing_instruction)
            _restore_file(manifest_path, existing_manifest)
            raise
    return manifest


def verify_mode_projection(
    workspace: Workspace, project_root: str | Path, mode_id: str, *, host_id: str
) -> list[str]:
    project = Path(project_root).resolve()
    layout = _layout(host_id)
    if mode_id not in workspace.modes:
        raise HarnessError("MODE_NOT_ACTIVE", f"Mode is not active: {mode_id}")
    manifest = _read_manifest(_manifest_path(project, host_id))
    expected_keys = {
        "version",
        "operation",
        "environment",
        "environmentCommit",
        "sourceFingerprint",
        "instructionFingerprint",
        "mode",
        "hostId",
        "skillProjections",
        "managedSurfaces",
    }
    if (
        manifest is None
        or set(manifest) != expected_keys
        or manifest.get("version") != PROJECTION_VERSION
        or manifest.get("operation") != "mode.export"
        or manifest.get("environment") != str(workspace.root)
        or manifest.get("mode") != mode_id
        or manifest.get("hostId") != host_id
        or manifest.get("managedSurfaces") != [layout["instructionFile"]]
    ):
        raise HarnessError("HOST_PROJECTION_INVALID", "Host projection manifest is invalid")
    skill_ids = workspace.mode_skill_ids(mode_id)
    projections = manifest.get("skillProjections")
    if not isinstance(projections, list) or len(projections) != len(skill_ids):
        raise HarnessError("HOST_PROJECTION_INVALID", "Host projection manifest is invalid")
    for item, skill_id in zip(projections, skill_ids, strict=True):
        expected_path = f"{layout['skillRoot']}/{skill_id}"
        if (
            not isinstance(item, dict)
            or set(item)
            != {"skill", "nativePath", "projection", "sourceFingerprint"}
            or item.get("skill") != skill_id
            or item.get("nativePath") != expected_path
            or item.get("projection") not in {"link", "junction", "copy"}
            or not isinstance(item.get("sourceFingerprint"), str)
            or len(item["sourceFingerprint"]) != 64
        ):
            raise HarnessError("HOST_PROJECTION_INVALID", "Host projection entry is invalid")
        target = _contained(project, expected_path)
        source = workspace.skills[skill_id].path
        marker = _copy_marker(target) if target.is_dir() and not _is_junction(target) else None
        complete = (
            item["projection"] == "link"
            and target.is_symlink()
            and target.resolve() == source.resolve()
            or item["projection"] == "junction"
            and _is_junction(target)
            and target.resolve() == source.resolve()
            or item["projection"] == "copy"
            and marker is not None
            and marker.get("environment") == str(workspace.root)
            and marker.get("skill") == skill_id
            and marker.get("skillFingerprint") == item["sourceFingerprint"]
            and package_fingerprint(
                target, ignored_names=frozenset({COPY_MARKER})
            )
            == item["sourceFingerprint"]
        ) and (target / "SKILL.md").is_file()
        if not complete:
            raise HarnessError(
                "HOST_PROJECTION_INVALID", f"projected Skill is incomplete: {skill_id}"
            )
    instruction = _contained(project, layout["instructionFile"])
    try:
        text = instruction.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise HarnessError("HOST_PROJECTION_INVALID", "Host instructions are missing") from error
    if text.count(MANAGED_START) != 1 or text.count(MANAGED_END) != 1:
        raise HarnessError("HOST_PROJECTION_INVALID", "Host instructions are incomplete")
    managed = text.split(MANAGED_START, 1)[1].split(MANAGED_END, 1)[0]
    if _instruction_fingerprint(managed) != manifest["instructionFingerprint"]:
        raise HarnessError("HOST_PROJECTION_INVALID", "Host instructions were modified")

    warnings = []
    if manifest["sourceFingerprint"] != workspace.source_fingerprint(mode_id):
        warnings.append("Environment content changed after projection; run host.project again.")
    if manifest["environmentCommit"] != workspace.git_commit:
        warnings.append("Environment Git HEAD changed after projection; run host.project again.")
    return warnings


def activation_report(
    workspace: Workspace, project_root: str | Path, mode_id: str, *, host_id: str
) -> dict:
    project = Path(project_root).resolve()
    layout = _layout(host_id)
    runtime_skills = []
    for skill_id in workspace.mode_skill_ids(mode_id):
        text = (workspace.skills[skill_id].path / "SKILL.md").read_text(encoding="utf-8")
        if RUNTIME_REQUIREMENTS.search(text):
            runtime_skills.append(skill_id)

    next_steps = [f"Open {project} in {HOST_DISPLAY_NAMES[host_id]}."]
    if runtime_skills:
        next_steps.append(
            "Read runtime dependency notes in: " + ", ".join(runtime_skills) + "."
        )
    if host_id in {"codex-app", "claude-code"}:
        hook_integration = "asl-environment-host-plugin"
        hook_activation = "install-or-enable-in-host"
        next_steps.append(
            "Install or enable the asl-environment-host plugin for automatic checks; "
            "the Mode itself is already usable without Hooks."
        )
    else:
        hook_integration = "@deepseek-ai/dsh-hooks-codex"
        hook_activation = "included-by-deepseek-preset-export"
        next_steps.append(
            "For automatic checks, export this Mode as a DeepSeek Agent Preset; "
            "the preset includes the official Cordis Hook bridge."
        )

    return {
        "hostId": host_id,
        "openProject": str(project),
        "instructionFile": layout["instructionFile"],
        "skillRoot": layout["skillRoot"],
        "runtimeRequirementSkills": runtime_skills,
        "hookIntegration": hook_integration,
        "hookActivation": hook_activation,
        "nextSteps": next_steps,
    }
