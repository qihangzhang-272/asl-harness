from __future__ import annotations

import shutil
import subprocess
import tempfile
import os
import hashlib
import threading
from dataclasses import replace as replace_record
from contextlib import contextmanager, ExitStack
from pathlib import Path

import yaml

from .workspace import (
    GENERATED_DIRECTORIES,
    HarnessError,
    Workspace,
    load_yaml,
    package_fingerprint,
    safe_write_path,
    _read_skill,
    _scan_authored_material,
)


_held_locks = threading.local()


@contextmanager
def environment_write_lock(root: str | Path):
    """Cooperating CLI writers only; not a filesystem sandbox or crash journal."""
    key = os.path.normcase(str(Path(root).resolve()))
    held = getattr(_held_locks, 'paths', set())
    if key in held:
        yield
        return
    # ponytail: one nonblocking Environment lock includes rendering; stage outside it only if write contention warrants it.
    directory = Path(tempfile.gettempdir()).resolve() / 'asl-harness-locks'
    directory.mkdir(exist_ok=True)
    file = directory / (hashlib.sha256(key.encode('utf-8')).hexdigest() + '.lock')
    safe_write_path(directory.resolve(), file)
    with file.open('a+b') as stream:
        if stream.tell() == 0:
            stream.write(b'0')
            stream.flush()
        stream.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise HarnessError('ENVIRONMENT_BUSY', '此工作环境正在保存另一项修改；请稍后重读并重试') from error
        _held_locks.paths = held | {key}
        try:
            yield
        finally:
            _held_locks.paths = held
            stream.seek(0)
            if os.name == 'nt':
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def _environment_fingerprints(workspace: Workspace) -> dict[Path, str | None]:
    paths = [workspace.root / 'WORKSPACE.md', workspace.root / 'PROFILE.md',
             *(s.path for s in workspace.skills.values()), *(m.path for m in workspace.modes.values())]
    return {path: package_fingerprint(path) if path.is_dir() else hashlib.sha256(path.read_bytes()).hexdigest()
            for path in paths}


def _require_unchanged(observed: dict[Path, str | None], code: str) -> None:
    for path, digest in observed.items():
        current = (package_fingerprint(path) if path.is_dir() else hashlib.sha256(path.read_bytes()).hexdigest()) if path.exists() else None
        if current != digest:
            raise HarnessError(code, '验收期间内容已改变，请重新读取并提交；未覆盖新内容')


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


def _replace_package(source: Path, destination: Path, *, expected: str | None = None) -> None:
    with tempfile.TemporaryDirectory(
        prefix=f".{destination.name}.asl-sync-", dir=destination.parent.parent
    ) as temporary:
        temporary_root = Path(temporary)
        staged = temporary_root / "incoming"
        previous = temporary_root / "previous"
        shutil.copytree(source, staged, symlinks=False, ignore=_ignore_generated)
        if expected is not None and package_fingerprint(staged) != expected:
            raise HarnessError('ADOPTION_STALE', f'采用时的字节与已验收候选不一致，请重新验收；未替换正式包：{destination}')
        existed = destination.exists()
        if existed:
            destination.rename(previous)
        try:
            staged.rename(destination)
        except OSError:
            if existed:
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
    for relative in relative_paths:
        safe_write_path(root, root / relative)
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


def sync_environment(source_root: str | Path, target_root: str | Path, skill_id: str, *,
                     mode_id: str | None = None, check: bool = False, replace: bool = False) -> dict:
    with ExitStack() as drafts:
        if not check:
            drafts.enter_context(environment_write_lock(target_root))
        return _sync_environment(source_root, target_root, skill_id, mode_id=mode_id, check=check, replace=replace, drafts=drafts)


def _sync_environment(
    source_root: str | Path,
    target_root: str | Path,
    skill_id: str,
    *,
    mode_id: str | None = None,
    check: bool = False,
    replace: bool = False,
    drafts: ExitStack,
) -> dict:
    source = Workspace.open(source_root)
    target = Workspace.open(target_root)
    observed = _environment_fingerprints(target)
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
    from .mermaid import validate_packages
    adopted_source = None
    adopted_fingerprint = None
    if skill_action in {'add', 'replace'}:
        safe_write_path(target.root, target.root / 'skills' / skill_id)
        temporary = drafts.enter_context(tempfile.TemporaryDirectory(prefix='asl-sync-skill-'))
        adopted_source = Path(temporary) / skill_id
        shutil.copytree(source.skills[skill_id].path, adopted_source, symlinks=False, ignore=_ignore_generated)
        if package_fingerprint(adopted_source) != result['sourcePackageFingerprint']:
            raise HarnessError('SYNC_STALE', '复制来源期间内容已改变，请重新预览；未写入正式库')
        adopted_fingerprint = result['sourcePackageFingerprint']
        _scan_authored_material(adopted_source, [adopted_source])
        incoming = _read_skill(adopted_source, skill_id, Path(temporary))
        future_modes = dict(target.modes)
        if mode_id is not None and mode_action == 'add':
            mode = future_modes[mode_id]
            future_modes[mode_id] = replace_record(mode, skill_roots=(*mode.skill_roots, skill_id))
        replace_record(target, skills={**target.skills, skill_id: incoming}, modes=future_modes)._validate_graph()
        result['diagrams'] = validate_packages([incoming.path], file_roots={incoming.path: str(source.skills[skill_id].path)})
    if check:
        return result

    if skill_action == "conflict":
        raise HarnessError(
            "SYNC_SKILL_CONFLICT",
            f"Target Skill has different local content: {skill_id}; use --replace to overwrite",
        )

    if changed:
        observed[source.skills[skill_id].path] = result['sourcePackageFingerprint']
        _require_unchanged(observed, 'SYNC_STALE')
        with _rollback_paths(target.root, changed_paths):
            if skill_action in {'add', 'replace'}:
                destination = target.root / "skills" / skill_id
                _replace_package(adopted_source, destination, expected=adopted_fingerprint)
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
