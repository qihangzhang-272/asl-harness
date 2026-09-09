"""User-directed content management. No scheduler, registry database or background work."""

from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path
import re
import os
import stat
import shutil
import tempfile
from uuid import uuid4

import yaml

from .dependencies import describe_dependencies
from .sync import _rollback_paths
from .sync import _ignore_generated
from .workspace import (
    HarnessError,
    Mode,
    Workspace,
    MODE_API_VERSION,
    _read_skill,
    _safe_id,
    package_fingerprint,
)


def _title(text: str, fallback: str) -> str:
    match = re.search(r"^#\s+(.+)$", text, re.M)
    return match.group(1).strip() if match else fallback


def catalog(root: str | Path) -> dict:
    workspace = Workspace.open(root)
    report = workspace.summary()
    for item in report["modes"]:
        mode = workspace.modes[item["id"]]
        item.update(
            title=_title(mode.document, mode.id),
            roots=list(mode.skill_roots),
            fingerprint=package_fingerprint(mode.path),
            path=str(mode.path),
        )
    for item in report["skills"]:
        skill = workspace.skills[item["id"]]
        document = (skill.path / "SKILL.md").read_text(encoding="utf-8")
        source = (skill.path / "SOURCE.md").read_text(encoding="utf-8")
        origin = re.search(r"^-\s+Origin:\s*(.+)$", source, re.M)
        manifests = {
            str(path.relative_to(skill.path)).replace("\\", "/"): path.read_bytes()
            for path in skill.files
            if path.name.lower()
            in {
                "package.json",
                "pyproject.toml",
                "requirements.txt",
                "mcp.json",
                ".mcp.json",
            }
            and path.stat().st_size <= 2 * 1024 * 1024
        }
        item.update(
            title=_title(document, skill.id),
            fingerprint=package_fingerprint(skill.path),
            usedBy=[
                m.id
                for m in workspace.modes.values()
                if skill.id in workspace.mode_skill_ids(m.id)
            ],
            source=origin.group(1).strip() if origin else "",
            path=str(skill.path),
            dependencies=describe_dependencies(manifests),
            fileCount=len(skill.files),
        )
    return report


def _text(request: dict, key: str) -> str:
    value = request.get(key)
    if (
        not isinstance(value, str)
        or not value.strip()
        or len(value.encode("utf-8")) > 1024 * 1024
    ):
        raise HarnessError("EDIT_INVALID", f"{key} 不能为空或超过 1 MB")
    return value.rstrip() + "\n"


def _linked(path: Path) -> bool:
    return path.is_symlink() or bool(
        getattr(path.lstat(), "st_file_attributes", 0)
        & stat.FILE_ATTRIBUTE_REPARSE_POINT
    )


def edit(root: str | Path, request: dict, *, check: bool = False) -> dict:
    if not isinstance(request, dict):
        raise HarnessError("EDIT_INVALID", "修改请求必须是对象")
    operation = request.get("operation")
    fields = {
        "mode.save": {"operation", "id", "expected", "document", "skills"},
        "mode.archive": {"operation", "id", "expected"},
        "skill.save": {"operation", "id", "expected", "document", "sourceDocument"},
        "skill.archive": {"operation", "id", "expected"},
        "skill.import": {
            "operation",
            "id",
            "expected",
            "source",
            "mode",
            "expectedSource",
        },
    }
    if operation not in fields or set(request) - fields[operation]:
        raise HarnessError("EDIT_INVALID", "不支持的修改操作或字段")
    identifier = _safe_id(request.get("id"), "对象名称")
    workspace = Workspace.open(root)
    kind = "mode" if operation.startswith("mode.") else "skill"
    collection = workspace.modes if kind == "mode" else workspace.skills
    existing = collection.get(identifier)
    if existing and request.get("expected") != package_fingerprint(existing.path):
        raise HarnessError("EDIT_STALE", "内容已被修改，请刷新后重新保存")
    if not existing and request.get("expected"):
        raise HarnessError("EDIT_STALE", "内容已被移出，请刷新后重试")
    relative = f"{kind}s/{identifier}"
    target = workspace.root / relative
    # Never mutate a linked folder outside the selected library.
    if target.exists() and (
        _linked(target) or not target.resolve().is_relative_to(workspace.root)
    ):
        raise HarnessError("EDIT_LINKED", "此内容链接到外部目录，请在原位置编辑")
    if operation.endswith(".save"):
        for name in (
            ("MODE.md", "mode.yaml") if kind == "mode" else ("SKILL.md", "SOURCE.md")
        ):
            file = target / name
            if file.exists() and _linked(file):
                raise HarnessError(
                    "EDIT_LINKED", "内容文件是链接，请在原位置编辑：" + name
                )
    changed_paths = [relative, "WORKSPACE.md"]
    affected = (
        [identifier]
        if kind == "mode"
        else [
            m.id
            for m in workspace.modes.values()
            if identifier in workspace.mode_skill_ids(m.id)
        ]
    )
    report = {
        "operation": operation,
        "id": identifier,
        "check": check,
        "changed": True,
        "changedPaths": changed_paths,
        "affectedModes": affected,
    }
    archive = None
    source = None
    document = None
    source_document = None
    mode_data = None
    binding = None
    if operation == "mode.save":
        document = _text(request, "document")
        roots = request.get("skills")
        if (
            not isinstance(roots, list)
            or not roots
            or any(not isinstance(x, str) or x not in workspace.skills for x in roots)
            or len(set(roots)) != len(roots)
        ):
            raise HarnessError("EDIT_INVALID", "请选择至少一个本地技能，且不能重复")
        mode = Mode(identifier, target, document, tuple(roots))
        replace(
            workspace, modes={**workspace.modes, identifier: mode}
        )._validate_graph()
        mode_data = {
            "apiVersion": MODE_API_VERSION,
            "kind": "ModeProjection",
            "metadata": {"id": identifier},
            "spec": {"skills": roots},
        }
    elif operation == "skill.save":
        document = _text(request, "document")
        source_document = (
            (existing.path / "SOURCE.md").read_text(encoding="utf-8")
            if existing
            else _text(request, "sourceDocument")
        )
        if existing and "sourceDocument" in request:
            source_document = _text(request, "sourceDocument")
        with tempfile.TemporaryDirectory(prefix="asl-edit-check-") as temp:
            path = Path(temp) / identifier
            path.mkdir()
            (path / "SKILL.md").write_text(document, encoding="utf-8")
            (path / "SOURCE.md").write_text(source_document, encoding="utf-8")
            skill = _read_skill(path, identifier, Path(temp))
            replace(
                workspace, skills={**workspace.skills, identifier: skill}
            )._validate_graph()
    elif operation == "skill.import":
        source = Path(_text(request, "source").strip()).resolve()
        if (
            not source.is_dir()
            or source == target.resolve()
            or source.is_relative_to(workspace.root)
        ):
            raise HarnessError("EDIT_INVALID", "请选择技能库以外的完整技能目录")
        for directory, dirs, files in os.walk(source, followlinks=False):
            ignored = _ignore_generated(directory, dirs + files)
            dirs[:] = [name for name in dirs if name not in ignored]
            for name in dirs + [name for name in files if name not in ignored]:
                if _linked(Path(directory) / name):
                    raise HarnessError(
                        "EDIT_LINKED", "请先将技能包中的链接展开为本地文件后再导入"
                    )
        skill = _read_skill(source, identifier, source)
        replace(
            workspace, skills={**workspace.skills, identifier: skill}
        )._validate_graph()
        report["source"] = str(source)
        report["sourceFingerprint"] = package_fingerprint(source)
        if (
            request.get("expectedSource")
            and request["expectedSource"] != report["sourceFingerprint"]
        ):
            raise HarnessError("EDIT_STALE", "导入来源已变化，请重新预览")
        if request.get("mode"):
            binding = workspace.modes.get(request["mode"])
            if binding is None:
                raise HarnessError("EDIT_INVALID", "目标 Mode 不存在")
            if binding.id not in affected:
                affected = sorted(set(affected + [binding.id]))
                report["affectedModes"] = affected
            changed_paths.append(f"modes/{binding.id}/mode.yaml")
    else:
        if not existing:
            raise HarnessError("EDIT_INVALID", "对象不存在")
        if kind == "skill":
            references = [
                s.id for s in workspace.skills.values() if identifier in s.requires
            ]
            if affected or references:
                raise HarnessError(
                    "EDIT_REFERENCED",
                    "技能仍被引用：" + "、".join(affected + references),
                )
            if len(workspace.skills) == 1:
                raise HarnessError("EDIT_INVALID", "不能归档技能库中最后一个技能")
        elif len(workspace.modes) == 1:
            raise HarnessError(
                "EDIT_INVALID", "不能归档最后一个 Mode；可以编辑或复制它"
            )
        archive = (
            workspace.root
            / "archive"
            / f"{kind}-{identifier}-{datetime.now(timezone.utc):%Y%m%dT%H%M%S}-{uuid4().hex[:6]}"
        )
        report["archivePath"] = str(archive)
        changed_paths.append(
            str(archive.relative_to(workspace.root)).replace("\\", "/")
        )
    if check:
        return report
    with _rollback_paths(workspace.root, changed_paths):
        if archive:
            archive.parent.mkdir(exist_ok=True)
            target.rename(archive)
        elif source:
            if target.exists():
                # Backup is owned by this transaction; preserve the complete previous package on failure.
                shutil.rmtree(target)
            shutil.copytree(source, target, symlinks=False, ignore=_ignore_generated)
            if binding and identifier not in binding.skill_roots:
                binding_data = {
                    "apiVersion": MODE_API_VERSION,
                    "kind": "ModeProjection",
                    "metadata": {"id": binding.id},
                    "spec": {"skills": [*binding.skill_roots, identifier]},
                }
                (binding.path / "mode.yaml").write_text(
                    yaml.safe_dump(binding_data, allow_unicode=True, sort_keys=False),
                    encoding="utf-8",
                )
        else:
            target.mkdir(parents=True, exist_ok=True)
            (target / ("MODE.md" if kind == "mode" else "SKILL.md")).write_text(
                document, encoding="utf-8"
            )
            if mode_data:
                (target / "mode.yaml").write_text(
                    yaml.safe_dump(mode_data, allow_unicode=True, sort_keys=False),
                    encoding="utf-8",
                )
            if source_document:
                (target / "SOURCE.md").write_text(source_document, encoding="utf-8")
        Workspace.open(workspace.root).sync_workspace_view()
    return report
