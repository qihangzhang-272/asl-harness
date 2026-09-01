from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

from .adapters import verify_mode_projection
from .workspace import HarnessError, Workspace


EDIT_EVENTS = {"PostToolUse"}
EDIT_TOOLS = {"apply_patch", "Edit", "Write", "edit", "write"}
MANAGED_AREAS = {
    "PROFILE.md",
    "WORKSPACE.md",
    "skills",
    "modes",
    "candidates",
    "trials",
    "feedback",
    "archive",
}
PATCH_PATH = re.compile(r"(?m)^\*\*\* (?:Add|Update|Delete) File: (.+)$")


def hook_config(command: str = "asl-harness-hook") -> dict:
    return {
        "description": "ASL Environment checks for projected projects.",
        "hooks": {
            "SessionStart": [
                {
                    "matcher": "startup|resume|compact",
                    "hooks": [
                        {
                            "type": "command",
                            "command": command,
                            "timeout": 5,
                            "statusMessage": "Reading the active ASL Mode",
                        }
                    ],
                }
            ],
            "PostToolUse": [
                {
                    "matcher": "apply_patch|Edit|Write|edit|write",
                    "hooks": [
                        {
                            "type": "command",
                            "command": command,
                            "timeout": 10,
                            "statusMessage": "Checking the ASL Environment",
                        }
                    ],
                }
            ],
            "Stop": [
                {
                    "hooks": [
                        {
                            "type": "command",
                            "command": command,
                            "timeout": 10,
                            "statusMessage": "Checking ASL projection drift",
                        }
                    ]
                }
            ],
        },
    }


def _absolute(path: Path) -> Path:
    return Path(os.path.abspath(path))


def _is_within(path: Path, root: Path) -> bool:
    try:
        _absolute(path).relative_to(_absolute(root))
    except ValueError:
        return False
    return True


def _find_projection(cwd: Path, host_id: str) -> tuple[Path, dict] | None:
    start = cwd if cwd.is_dir() else cwd.parent
    for project in (start, *start.parents):
        path = project / ".asl" / "host-projections" / host_id / "current.json"
        if not path.is_file():
            continue
        try:
            manifest = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            return project, {}
        return project, manifest if isinstance(manifest, dict) else {}
    return None


def _event_name(payload: dict) -> str:
    value = payload.get("hook_event_name", payload.get("hookEventName", ""))
    return value if isinstance(value, str) else ""


def _collect_paths(value: object, cwd: Path, key: str = "") -> list[Path]:
    paths: list[Path] = []
    if isinstance(value, dict):
        for child_key, child in value.items():
            paths.extend(_collect_paths(child, cwd, str(child_key)))
    elif isinstance(value, list):
        for child in value:
            paths.extend(_collect_paths(child, cwd, key))
    elif isinstance(value, str):
        if key.lower() in {"path", "file", "file_path", "filepath", "target_path"}:
            candidate = Path(value)
            paths.append(candidate if candidate.is_absolute() else cwd / candidate)
        for matched in PATCH_PATH.findall(value):
            candidate = Path(matched.strip())
            paths.append(candidate if candidate.is_absolute() else cwd / candidate)
    return paths


def _managed_write(
    paths: list[Path], project: Path, environment: Path, manifest: dict
) -> bool:
    environment_targets = [environment / name for name in MANAGED_AREAS]
    project_targets = [
        project / ".asl" / "host-projections" / str(manifest.get("hostId", ""))
    ]
    for relative in manifest.get("managedSurfaces", []):
        if isinstance(relative, str):
            project_targets.append(project / relative)
    for item in manifest.get("skillProjections", []):
        if isinstance(item, dict) and isinstance(item.get("nativePath"), str):
            project_targets.append(project / item["nativePath"])
    return any(
        any(_is_within(path, target) for target in (*environment_targets, *project_targets))
        for path in paths
    )


def _check(project: Path, manifest: dict) -> tuple[Workspace, list[str]]:
    environment = manifest.get("environment")
    mode = manifest.get("mode")
    host_id = manifest.get("hostId")
    if not all(isinstance(value, str) and value for value in (environment, mode, host_id)):
        raise HarnessError("HOST_PROJECTION_INVALID", "Host projection manifest is invalid")
    workspace = Workspace.open(environment)
    warnings = verify_mode_projection(workspace, project, mode, host_id=host_id)
    return workspace, warnings


def _format_error(error: HarnessError) -> str:
    return f"ASL {error.code}: {error}"


def run_hook(payload: dict, *, host_id: str) -> tuple[int, str]:
    cwd_value = payload.get("cwd")
    cwd = Path(cwd_value) if isinstance(cwd_value, str) and cwd_value else Path.cwd()
    located = _find_projection(cwd.resolve(), host_id)
    if located is None:
        return 0, ""
    project, manifest = located
    event = _event_name(payload)

    if event == "SessionStart":
        try:
            workspace, warnings = _check(project, manifest)
        except HarnessError as error:
            return 0, _format_error(error)
        mode = manifest["mode"]
        count = len(workspace.mode_skill_ids(mode))
        message = f"ASL Mode {mode} is active with {count} projected Skills."
        if warnings:
            message += " " + " ".join(f"Warning: {item}" for item in warnings)
        return 0, message

    if event in EDIT_EVENTS:
        tool_name = payload.get("tool_name", payload.get("toolName", ""))
        if tool_name not in EDIT_TOOLS:
            return 0, ""
        environment = manifest.get("environment")
        if not isinstance(environment, str) or not environment:
            return 2, "ASL HOST_PROJECTION_INVALID: Host projection manifest is invalid"
        paths = _collect_paths(payload.get("tool_input", payload.get("toolInput", {})), cwd)
        if not _managed_write(paths, project, Path(environment), manifest):
            return 0, ""
        try:
            _, warnings = _check(project, manifest)
        except HarnessError as error:
            return 2, _format_error(error)
        return 0, " ".join(f"ASL warning: {item}" for item in warnings)

    if event == "Stop":
        try:
            _, warnings = _check(project, manifest)
        except HarnessError as error:
            return 0, _format_error(error)
        return 0, " ".join(f"ASL warning: {item}" for item in warnings)

    return 0, ""


def _detect_host_id() -> str | None:
    explicit = os.environ.get("ASL_HOST_ID")
    if explicit:
        return explicit
    if os.environ.get("PLUGIN_ROOT"):
        return "codex-app"
    if os.environ.get("CLAUDE_PROJECT_DIR") or os.environ.get("CLAUDE_PLUGIN_ROOT"):
        return "claude-code"
    return None


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="asl-harness-hook")
    parser.add_argument(
        "--host-id", choices=("codex-app", "claude-code", "deepseek-harness")
    )
    args = parser.parse_args(argv)
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError, TypeError):
        return 0
    if not isinstance(payload, dict):
        return 0
    host_id = args.host_id or _detect_host_id()
    if host_id is None:
        return 0
    code, message = run_hook(payload, host_id=host_id)
    if message:
        print(message, file=sys.stderr if code == 2 else sys.stdout)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
