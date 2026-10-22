from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from datetime import datetime, timezone
import tempfile

from .adapters import verify_mode_projection
from .workspace import HarnessError, Workspace, safe_write_path


EDIT_EVENTS = {"PostToolUse"}
EDIT_TOOLS = {"apply_patch", "Edit", "Write", "edit", "write"}
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
        if not path.is_file() and host_id == "deepseek-harness":
            from .deepseek import PRESET_MARKER
            path = project / PRESET_MARKER
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
    selected = manifest.get("skills", []) if "basePreset" in manifest else [
        item.get("skill") for item in manifest.get("skillProjections", []) if isinstance(item, dict)
    ]
    environment_targets = [environment / "PROFILE.md", environment / "WORKSPACE.md",
                           environment / "modes" / str(manifest.get("mode", ""))]
    environment_targets.extend(environment / "skills" / name for name in selected if isinstance(name, str))
    project_targets = [
        project / ".asl" / "host-projections" / str(manifest.get("hostId", ""))
    ]
    if "basePreset" in manifest:
        project_targets.append(project)
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
    workspace = Workspace.open(environment, mode_id=mode)
    if host_id == "deepseek-harness" and "basePreset" in manifest:
        from .deepseek import verify_preset
        warnings = verify_preset(workspace, mode, project)
    else:
        warnings = verify_mode_projection(workspace, project, mode, host_id=host_id)
    return workspace, warnings


def _format_error(error: HarnessError) -> str:
    return f"ASL {error.code}: {error}"


def _receipt_path(project: Path, host: str) -> Path:
    if host not in {'codex-app', 'claude-code', 'deepseek-harness'}:
        raise ValueError('Unsupported hook host')
    path = project / '.asl' / f'last-hook-check-{host}.json'
    safe_write_path(project, path)
    return path


def last_hook_check(project: Path, host: str, mode: str, fingerprint: str) -> dict | None:
    try:
        path = _receipt_path(project, host)
        if path.stat().st_size > 4096:
            return None
        data = json.loads(path.read_text(encoding='utf-8'))
        if (not isinstance(data, dict) or data.get('host') != host or data.get('mode') != mode
                or data.get('event') not in {'SessionStart', 'PostToolUse', 'Stop'}
                or data.get('state') not in {'passed', 'warning', 'error'}
                or not isinstance(data.get('at'), str) or len(data['at']) > 40
                or type(data.get('warningCount')) is not int or not 0 <= data['warningCount'] <= 10000
                or not isinstance(data.get('errorCode'), str) or not re.fullmatch(r'[A-Z_0-9]{0,80}', data['errorCode'])):
            return None
        datetime.fromisoformat(data['at'])
        return {key: data[key] for key in ('at', 'event', 'state', 'warningCount', 'errorCode')} | {'stale': data.get('sourceFingerprint') != fingerprint}
    except (OSError, ValueError, UnicodeError, HarnessError):
        return None


def _record_check(project: Path, host: str, manifest: dict, event: str, *, warnings=(), error=None) -> None:
    temporary = None
    try:
        path = _receipt_path(project, host)
        mode = manifest.get('mode')
        if not isinstance(mode, str) or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]{0,140}', mode):
            return
        fingerprint = manifest.get('sourceFingerprint')
        if not isinstance(fingerprint, str) or not re.fullmatch(r'[a-f0-9]{64}', fingerprint):
            fingerprint = None
        data = {'at': datetime.now(timezone.utc).isoformat(), 'host': host, 'mode': mode, 'event': event,
                'state': 'error' if error else 'warning' if warnings else 'passed',
                'sourceFingerprint': fingerprint, 'warningCount': len(warnings),
                'errorCode': error.code if error else ''}
        path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent, delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(data, stream, ensure_ascii=False)
        safe_write_path(project, path)
        os.replace(temporary, path)
    except (OSError, ValueError, HarnessError):
        pass  # A receipt failure must never change the Hook's validation result.
    finally:
        if temporary is not None:
            try:
                temporary.unlink(missing_ok=True)
            except OSError:
                pass


def run_hook(payload: dict, *, host_id: str, preset: Path | None = None) -> tuple[int, str]:
    cwd_value = payload.get("cwd")
    cwd = Path(cwd_value) if isinstance(cwd_value, str) and cwd_value else Path.cwd()
    if preset is not None:
        from .deepseek import _read_marker
        preset = preset.resolve()
        manifest = _read_marker(preset)
        located = (preset, manifest) if manifest is not None else None
    else:
        located = _find_projection(cwd.resolve(), host_id)
    if located is None:
        return 0, "ASL preset marker is missing; re-export the preset." if preset is not None else ""
    project, manifest = located
    event = _event_name(payload)

    if event == "SessionStart":
        try:
            workspace, warnings = _check(project, manifest)
        except HarnessError as error:
            _record_check(project, host_id, manifest, event, error=error)
            return 0, _format_error(error)
        mode = manifest["mode"]
        count = len(workspace.mode_skill_ids(mode))
        message = f"ASL Mode {mode} is projected with {count} projected Skills."
        if warnings:
            message += " " + " ".join(f"Warning: {item}" for item in warnings)
        _record_check(project, host_id, manifest, event, warnings=warnings)
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
            _record_check(project, host_id, manifest, event, error=error)
            return 2, _format_error(error)
        _record_check(project, host_id, manifest, event, warnings=warnings)
        return 0, " ".join(f"ASL warning: {item}" for item in warnings)

    if event == "Stop":
        try:
            _, warnings = _check(project, manifest)
        except HarnessError as error:
            _record_check(project, host_id, manifest, event, error=error)
            return 0, _format_error(error)
        _record_check(project, host_id, manifest, event, warnings=warnings)
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
    parser.add_argument("--preset", type=Path, help="DeepSeek preset containing the existing ASL marker")
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
    if args.preset is not None and host_id != "deepseek-harness":
        parser.error("--preset requires --host-id deepseek-harness")
    code, message = run_hook(payload, host_id=host_id, preset=args.preset)
    if message:
        print(message, file=sys.stderr if code == 2 else sys.stdout)
    return code


if __name__ == "__main__":
    raise SystemExit(main())
