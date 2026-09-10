"""One selected Mode in a host's native user scope; no global skill registry."""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
from contextlib import ExitStack
from pathlib import Path

from .adapters import (
    MANAGED_START, MANAGED_END, _mode_instructions, _render_managed_block,
    _write_bytes_atomic, _is_junction,
)
from .sync import _rollback_paths, _ignore_generated
from .workspace import HarnessError, Workspace, package_fingerprint


def locations(host: str, *, home: Path | None = None, env: dict | None = None) -> dict:
    home = (home or Path.home()).resolve()
    env = os.environ if env is None else env
    if host == "codex-app":
        config = Path(env.get("CODEX_HOME") or home / ".codex").resolve()
        skills, instructions = home / ".agents" / "skills", config / "AGENTS.md"
    elif host == "claude-code":
        config = Path(env.get("CLAUDE_CONFIG_DIR") or home / ".claude").resolve()
        skills, instructions = config / "skills", config / "CLAUDE.md"
    else:
        raise HarnessError("HOST_UNSUPPORTED", "这个 Agent 不支持当前用户级同步")
    return {"skills": skills.resolve(), "instructions": instructions,
            "manifest": config / ".asl" / "user-mode.json"}


def _read_record(path: Path) -> dict | None:
    if not path.exists():
        return None
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(record, dict) or record.get("version") != 1:
            raise ValueError()
        entries = record["skills"]
        if not isinstance(entries, dict) or any(
            not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", k)
            or not isinstance(v, str) or not re.fullmatch(r"[0-9a-f]{64}", v)
            for k, v in entries.items()
        ):
            raise ValueError()
        return record
    except (ValueError, KeyError, TypeError, OSError) as error:
        raise HarnessError("HOST_PROJECTION_INVALID", "用户级同步记录无法读取，请保留文件并检查") from error


def _content(path: Path) -> bytes:
    if path.is_symlink() or _is_junction(path):
        raise HarnessError("HOST_PROJECTION_COLLISION", f"配置文件是链接，请在原位置处理：{path}")
    return path.read_bytes() if path.exists() else b""


def sync_user(workspace: Workspace, mode_id: str, host: str, *, check: bool = False,
              expected: str | None = None, home: Path | None = None, env: dict | None = None,
              remove: bool = False, skills_dir: Path | None = None) -> dict:
    paths = locations(host, home=home, env=env)
    default_skills = paths["skills"]
    if skills_dir:
        paths["skills"] = Path(skills_dir).resolve()
    skills_root = paths["skills"]
    source_root = workspace.root / "skills"
    if skills_root.is_relative_to(source_root) or source_root.is_relative_to(skills_root):
        raise HarnessError("HOST_PROJECTION_COLLISION", "技能源和 Agent 目标目录不能重叠")
    old = _read_record(paths["manifest"])
    if old and (old.get("host") != host or (old.get("skillRoot") != str(skills_root) and (old.get("mode") or old["skills"]))):
        raise HarnessError("HOST_PROJECTION_INVALID", "原目录还有受管模式，请先在原目录停用，再选择新目录")
    old_skills = old["skills"] if old else {}
    if remove and old and old.get("mode") not in {None, mode_id}:
        raise HarnessError("EDIT_STALE", "当前默认模式已经改变，请刷新后再停用")
    wanted = {} if remove else {key: package_fingerprint(workspace.skills[key].path)
                               for key in workspace.mode_skill_ids(mode_id)}
    items, conflicts, current = [], [], {}
    for key in sorted(old_skills.keys() | wanted.keys()):
        target = skills_root / key
        present = target.exists() or target.is_symlink()
        linked = target.is_symlink() or _is_junction(target)
        fingerprint = package_fingerprint(target) if present and target.is_dir() and not linked else None
        current[key] = {"present": present, "linked": linked, "fingerprint": fingerprint}
        if present and (key not in old_skills or linked or fingerprint != old_skills[key]):
            action = "conflict"
            conflicts.append(f"{key}：已有内容不归 ASL 管理，或已被修改；本次不会覆盖")
        elif key not in wanted:
            action = "remove" if present else "unchanged"
        elif not present:
            action = "add"
        else:
            action = "unchanged" if fingerprint == wanted[key] else "update"
        items.append({"skill": key, "action": action, "path": str(target)})
    instruction_bytes = _content(paths["instructions"])
    instructions = instruction_bytes.decode("utf-8")
    if MANAGED_START in instructions:
        if old is None or instructions.count(MANAGED_START) != 1 or instructions.count(MANAGED_END) != 1:
            conflicts.append("已有 ASL 说明缺少对应同步记录，请先处理后再应用")
        else:
            block = instructions.split(MANAGED_START, 1)[1].split(MANAGED_END, 1)[0].strip()
            if hashlib.sha256(block.encode()).hexdigest() != old.get("instructionFingerprint"):
                conflicts.append("用户级 Mode 说明已被修改，本次不会覆盖")
    elif old and old.get("mode"):
        conflicts.append("用户级 Mode 说明已移除，请先确认原来的本地修改")
    block = (
        "## ASL default Mode for this user\n\n"
        "This is a default, not a command to override a project's explicit ASL Mode or the user's current request. "
        "Other native skills and host configuration remain available.\n\n"
        + _mode_instructions(workspace, mode_id)
    )
    rendered = _render_managed_block(instructions, block, paths["instructions"])
    if remove:
        rendered = re.sub(re.escape(MANAGED_START) + r".*?" + re.escape(MANAGED_END), "", instructions, flags=re.S).rstrip() + "\n"
    source_fingerprint = workspace.source_fingerprint(mode_id)
    fingerprint = hashlib.sha256(json.dumps(
        [old, current, source_fingerprint, str(paths), instructions, remove], sort_keys=True,
    ).encode()).hexdigest()
    report = {"scope": "user", "host": host, "mode": mode_id,
              "paths": {key: str(value) for key, value in paths.items()},
              "defaultSkills": str(default_skills),
              "discovery": "native-directory" if skills_root == default_skills else "requires-connection",
              "items": items, "conflicts": conflicts, "fingerprint": fingerprint,
              "previousMode": old.get("mode") if old else None,
              "needsSync": not old or old.get("mode") != mode_id or (remove and bool(old.get("mode")))
              or old.get("environment") != str(workspace.root)
              or old.get("sourceFingerprint") != source_fingerprint
              or any(i["action"] != "unchanged" for i in items) or bool(conflicts),
              "status": "preview", "remove": remove}
    if check:
        return report
    if expected and expected != fingerprint:
        raise HarnessError("EDIT_STALE", "文件或技能源已变化，请重新查看同步预览")
    if conflicts:
        raise HarnessError("HOST_PROJECTION_COLLISION", "\n".join(conflicts))
    if not report["needsSync"]:
        return {**report, "status": "synced"}
    record = {"version": 1, "host": host, "mode": None if remove else mode_id,
              "environment": str(workspace.root), "skillRoot": str(skills_root),
              "sourceFingerprint": source_fingerprint, "skills": wanted,
              "instructionFingerprint": hashlib.sha256(block.strip().encode()).hexdigest()}
    changed = [item for item in items if item["action"] != "unchanged"]
    skills_root.mkdir(parents=True, exist_ok=True)
    paths["instructions"].parent.mkdir(parents=True, exist_ok=True)
    paths["manifest"].parent.mkdir(parents=True, exist_ok=True)
    with ExitStack() as rollback:
        rollback.enter_context(_rollback_paths(skills_root, [i["skill"] for i in changed]))
        rollback.enter_context(_rollback_paths(paths["instructions"].parent, [paths["instructions"].name]))
        rollback.enter_context(_rollback_paths(paths["manifest"].parent, [paths["manifest"].name]))
        for item in changed:
            target = skills_root / item["skill"]
            if target.exists():
                shutil.rmtree(target)
            if item["action"] != "remove":
                shutil.copytree(workspace.skills[item["skill"]].path, target, ignore=_ignore_generated)
        _write_bytes_atomic(paths["instructions"], rendered.encode("utf-8"))
        _write_bytes_atomic(paths["manifest"], (json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode())
    return {**report, "status": "removed" if remove else "synced", "needsSync": False}


def inspect_user(workspace: Workspace, mode_id: str, host: str, **kwargs) -> dict:
    return sync_user(workspace, mode_id, host, check=True, **kwargs)
