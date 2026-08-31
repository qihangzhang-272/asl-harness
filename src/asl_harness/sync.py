from __future__ import annotations

import shutil
import subprocess
import tempfile
from contextlib import contextmanager
from pathlib import Path

import yaml

from .workspace import (
    GENERATED_DIRECTORIES,
    HarnessError,
    Workspace,
    load_yaml,
    package_fingerprint,
)


def _ignore_generated(_directory: str, names: list[str]) -> set[str]:
    return {name for name in names if name in GENERATED_DIRECTORIES or name == ".git"}


def _bind_mode(target: Workspace, mode_id: str, skill_id: str) -> None:
    path = target.modes[mode_id].path / "mode.yaml"
    document = load_yaml(path)
    document["spec"]["skills"].append(skill_id)
    path.write_text(
        yaml.safe_dump(document, allow_unicode=True, sort_keys=False),
        encoding="utf-8",
        newline="\n",
    )


def _replace_package(source: Path, destination: Path) -> None:
    with tempfile.TemporaryDirectory(
        prefix=f".{destination.name}.asl-sync-", dir=destination.parent
    ) as temporary:
        temporary_root = Path(temporary)
        staged = temporary_root / "incoming"
        previous = temporary_root / "previous"
        shutil.copytree(source, staged, symlinks=False, ignore=_ignore_generated)
        destination.rename(previous)
        try:
            staged.rename(destination)
        except OSError:
            previous.rename(destination)
            raise


def _git_status(root: Path, paths: list[str]) -> list[str]:
    if not paths:
        return []
    try:
        return subprocess.run(
            ["git", "-C", str(root), "status", "--short", "--", *paths],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.splitlines()
    except (OSError, subprocess.CalledProcessError):
        return []


def _remove_path(path: Path) -> None:
    if path.is_symlink():
        path.unlink()
    elif path.is_dir():
        shutil.rmtree(path)
    elif path.exists():
        path.unlink()


@contextmanager
def _rollback_paths(root: Path, relative_paths: list[str]):
    with tempfile.TemporaryDirectory(prefix=".asl-sync-rollback-", dir=root) as temporary:
        backup = Path(temporary)
        present: set[str] = set()
        for relative in relative_paths:
            source = root / relative
            if source.is_dir():
                shutil.copytree(source, backup / relative, symlinks=True)
                present.add(relative)
            elif source.is_file():
                destination = backup / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination)
                present.add(relative)
        try:
            yield
        except BaseException:
            for relative in reversed(relative_paths):
                _remove_path(root / relative)
                if relative in present:
                    source = backup / relative
                    destination = root / relative
                    destination.parent.mkdir(parents=True, exist_ok=True)
                    if source.is_dir():
                        shutil.copytree(source, destination, symlinks=True)
                    else:
                        shutil.copy2(source, destination)
            raise


def sync_environment(
    source_root: str | Path,
    target_root: str | Path,
    skill_id: str,
    *,
    mode_id: str | None = None,
    check: bool = False,
    replace: bool = False,
) -> dict:
    source = Workspace.open(source_root)
    target = Workspace.open(target_root)
    if skill_id not in source.skills:
        raise HarnessError("SYNC_SKILL_MISSING", f"Source Skill is missing: {skill_id}")
    if mode_id is not None and mode_id not in target.modes:
        raise HarnessError("SYNC_MODE_MISSING", f"Target Mode is missing: {mode_id}")
    missing_dependencies = [
        dependency
        for dependency in source.skills[skill_id].requires
        if dependency not in target.skills
    ]
    if missing_dependencies:
        raise HarnessError(
            "SYNC_DEPENDENCY_MISSING",
            "Target Environment is missing required Skills: "
            + ", ".join(missing_dependencies),
        )

    if skill_id not in target.skills:
        skill_action = "add"
    elif package_fingerprint(source.skills[skill_id].path) == package_fingerprint(
        target.skills[skill_id].path
    ):
        skill_action = "unchanged"
    else:
        skill_action = "replace" if replace else "conflict"
    mode_action = None
    if mode_id is not None:
        mode_action = (
            "unchanged"
            if skill_id in target.modes[mode_id].skill_roots
            else "add"
        )
    if skill_action == "conflict" and mode_action == "add":
        mode_action = "blocked"
    changed = skill_action in {"add", "replace"} or mode_action == "add"
    changed_paths: list[str] = []
    if skill_action in {"add", "replace"}:
        changed_paths.append(f"skills/{skill_id}")
    if mode_id is not None and mode_action == "add":
        changed_paths.append(f"modes/{mode_id}/mode.yaml")
    if changed:
        changed_paths.append("WORKSPACE.md")
    result = {
        "operation": "skill.import",
        "source": str(source.root),
        "sourceCommit": source.git_commit,
        "sourcePackageFingerprint": package_fingerprint(source.skills[skill_id].path),
        "target": str(target.root),
        "targetCommit": target.git_commit,
        "targetPackageFingerprint": (
            package_fingerprint(target.skills[skill_id].path)
            if skill_id in target.skills
            else None
        ),
        "skill": skill_id,
        "skillAction": skill_action,
        "mode": mode_id,
        "modeAction": mode_action,
        "changed": changed,
        "check": check,
        "changedPaths": changed_paths,
    }
    if check:
        return result

    if skill_action == "conflict":
        raise HarnessError(
            "SYNC_SKILL_CONFLICT",
            f"Target Skill has different local content: {skill_id}; use --replace to overwrite",
        )

    if changed:
        with _rollback_paths(target.root, changed_paths):
            if skill_action == "add":
                destination = target.root / "skills" / skill_id
                shutil.copytree(
                    source.skills[skill_id].path,
                    destination,
                    symlinks=False,
                    ignore=_ignore_generated,
                )
            elif skill_action == "replace":
                destination = target.root / "skills" / skill_id
                _replace_package(source.skills[skill_id].path, destination)
            if mode_id is not None and mode_action == "add":
                _bind_mode(target, mode_id, skill_id)
            refreshed = Workspace.open(target.root)
            refreshed.sync_workspace_view()
            Workspace.open(target.root)
        result["targetPackageFingerprint"] = package_fingerprint(
            target.root / "skills" / skill_id
        )
    result["gitStatus"] = _git_status(target.root, changed_paths)
    return result
