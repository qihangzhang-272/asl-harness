"""Portable Mode snapshots: Agent Plugins layout, no installer or agent runtime.

Format: https://agent-plugins.org/specification (v1.0.0).
Design reference: Hermes plugin_packs.py (preview, no credentials or consent).
This is an ASL snapshot reader/writer, not a general Agent Plugins runtime.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import stat
import tempfile
import zipfile
from contextlib import contextmanager
from pathlib import Path, PurePosixPath

from .sync import _git_status, _replace_package, _rollback_paths
from .workspace import GENERATED_DIRECTORIES, LIFECYCLE_AREAS, HarnessError, Workspace, package_fingerprint

NAMESPACE = "io.github.qihangzhang-272.asl"
SCHEMA = "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
OMIT = GENERATED_DIRECTORIES | {".git", ".venv", "venv", ".asl"}
MAX_BYTES = 512 * 1024 * 1024
MAX_FILES = 10000
DEPENDENCY_NAMES = {"package.json", "package-lock.json", "pnpm-lock.yaml", "pyproject.toml", "requirements.txt", "uv.lock", "mcp.json", ".mcp.json", "plugin.json", "plugin.yaml"}
SECRET_NAMES = {".env", "credentials.json", "credentials.yaml", ".credentials.yaml", "auth.json", "id_rsa", "id_ed25519"}
LOCAL_PATH = re.compile(r"(?:(?<![A-Za-z0-9])[A-Za-z]:[\\/]|/(?:Users|home)/[^/\s]+/)")
SECRET_LITERAL = re.compile(r'''(?im)["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|client[_-]?secret)["']?\s*[:=]\s*["']([^\r\n"']+)["']''')
PLUGIN_NAME = re.compile(r"(?!.*(?:--|\.\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\Z")


def _fail(message: str) -> None:
    raise HarnessError("PACK_INVALID", message)


def _safe_path(name: str) -> PurePosixPath:
    path = PurePosixPath(name)
    if (not name or path.is_absolute() or "\\" in name or ":" in name
            or any(part in {"", ".", ".."} or part.endswith((" ", "."))
                   or re.fullmatch(r"(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?", part)
                   for part in name.split("/"))):
        _fail(f"unsafe package path: {name}")
    return path


def _digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _unique_object(pairs: list[tuple]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            _fail(f"duplicate JSON key in manifest: {key}")
        result[key] = value
    return result


def _validate_manifest(manifest: object) -> None:
    if not isinstance(manifest, dict):
        _fail("manifest must be an object")
    name = manifest.get("name")
    if not isinstance(name, str) or not 1 <= len(name) <= 64 or not PLUGIN_NAME.fullmatch(name):
        _fail("invalid plugin manifest name")
    for key in ("version", "description", "homepage", "repository", "license"):
        if key in manifest and not isinstance(manifest[key], str):
            _fail(f"invalid plugin manifest {key}")
    if "author" in manifest and (not isinstance(manifest["author"], dict)
            or not set(manifest["author"]) <= {"name", "email", "url"}
            or any(not isinstance(value, str) for value in manifest["author"].values())):
        _fail("invalid plugin manifest author")
    if "keywords" in manifest and (not isinstance(manifest["keywords"], list)
            or any(not isinstance(value, str) for value in manifest["keywords"])):
        _fail("invalid plugin manifest keywords")


def _content_digest(files: dict[str, bytes]) -> str:
    return _digest(json.dumps({name: _digest(data) for name, data in sorted(files.items())}, sort_keys=True).encode())


def _review(files: dict[str, bytes]) -> dict:
    local = []
    dependencies = []
    for name, data in files.items():
        path = _safe_path(name)
        lower = path.name.lower()
        if (lower in SECRET_NAMES or lower.startswith(".env.") and lower != ".env.example"
                or path.suffix.lower() in {".key", ".pem", ".p12", ".pfx"}):
            _fail(f"secret-bearing file cannot be shared: {name}")
        if lower in DEPENDENCY_NAMES:
            dependencies.append(name)
        try:
            text = data.decode("utf-8")
        except UnicodeDecodeError:
            continue
        if "-----BEGIN " in text and "PRIVATE KEY-----" in text:
            _fail(f"private key cannot be shared: {name}")
        for match in SECRET_LITERAL.finditer(text):
            value = match.group(1).strip()
            if value and not (value.startswith(("${", "<")) or value.lower() in {"example", "placeholder", "your-api-key", "your_api_key"}):
                _fail(f"possible secret literal; replace with a documented placeholder before sharing: {name}")
        if LOCAL_PATH.search(text):
            local.append(name)
    return {"localReferences": sorted(local), "dependencyFiles": sorted(dependencies),
            "runtimeStatus": "not-checked", "warnings": [
                "Import transfers content only; it does not install dependencies, grant permissions, or activate MCP/Plugins.",
                "Secret checks are heuristic, not a confidentiality certificate. Review selected content before sharing.",
            ]}


def _read_tree(root: Path) -> dict[str, bytes]:
    files = {}
    total = 0
    for current, directories, names in os.walk(root, followlinks=False):
        for name in [*directories, *names]:
            path = Path(current) / name
            if not path.resolve().is_relative_to(root.resolve()) or path.is_symlink() or getattr(path, "is_junction", lambda: False)():
                _fail(f"linked package path must be localized before sharing: {path.relative_to(root)}")
        for name in names:
            path = Path(current) / name
            relative = path.relative_to(root).as_posix()
            _safe_path(relative)
            total += path.stat().st_size
            if len(files) >= MAX_FILES or total > MAX_BYTES:
                _fail("package exceeds 10000 files or 512 MiB")
            files[relative] = path.read_bytes()
    if len({name.casefold() for name in files}) != len(files):
        _fail("case-insensitive package path collision")
    return files


def _read_package(source: Path) -> dict[str, bytes]:
    if source.is_dir():
        return _read_tree(source)
    try:
        with zipfile.ZipFile(source) as archive:
            entries = [entry for entry in archive.infolist() if not entry.is_dir()]
            if len(entries) > MAX_FILES or sum(entry.file_size for entry in entries) > MAX_BYTES:
                _fail("package exceeds 10000 files or 512 MiB")
            seen = set()
            for entry in entries:
                _safe_path(entry.filename)
                if entry.filename.casefold() in seen or stat.S_ISLNK(entry.external_attr >> 16):
                    _fail("duplicate or linked ZIP entry")
                seen.add(entry.filename.casefold())
            return {entry.filename: archive.read(entry) for entry in entries}
    except zipfile.BadZipFile as error:
        raise HarnessError("PACK_INVALID", "not a valid ZIP package") from error


def _write_files(root: Path, files: dict[str, bytes]) -> None:
    for name, data in files.items():
        target = root / _safe_path(name)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)


def export_pack(source: str | Path, mode_id: str, output: str | Path, *, include_profile: bool = False, check: bool = False) -> dict:
    workspace = Workspace.open(source, mode_id=mode_id)
    target = Path(output).resolve()
    if target.exists() or target.is_relative_to(workspace.root):
        _fail("export needs a new path outside the source Environment")
    files = {}
    excluded = []
    executable = []
    total = 0
    for skill_id in workspace.mode_skill_ids(mode_id):
        root = workspace.skills[skill_id].path
        if root.is_symlink() or getattr(root, "is_junction", lambda: False)():
            _fail(f"linked Skill must be localized before export: {skill_id}")
        # Traverse source once; generated dependencies are not authored package content.
        for current, directories, names in os.walk(root, followlinks=False):
            for name in list(directories):
                if name in OMIT:
                    excluded.append((Path(current) / name).relative_to(workspace.root).as_posix())
                    directories.remove(name)
            for name in [*directories, *names]:
                path = Path(current) / name
                if path.is_symlink() or getattr(path, "is_junction", lambda: False)() or not path.resolve().is_relative_to(root.resolve()):
                    _fail(f"linked Skill asset must be localized before export: {path}")
            for name in names:
                path = Path(current) / name
                if path.suffix in {".pyc", ".pyo"}:
                    excluded.append(path.relative_to(workspace.root).as_posix())
                    continue
                relative = path.relative_to(workspace.root).as_posix()
                total += path.stat().st_size
                if len(files) >= MAX_FILES or total > MAX_BYTES:
                    _fail("package exceeds 10000 files or 512 MiB")
                files[relative] = path.read_bytes()
                if path.stat().st_mode & 0o111:
                    executable.append(relative)
    for name in ("MODE.md", "mode.yaml"):
        path = workspace.modes[mode_id].path / name
        if not path.resolve().is_relative_to(workspace.root):
            _fail(f"Mode file escapes Environment: {name}")
        files[f"{NAMESPACE}/modes/{mode_id}/{name}"] = path.read_bytes()
    if include_profile:
        files[f"{NAMESPACE}/PROFILE.md"] = (workspace.root / "PROFILE.md").read_bytes()
    if len(files) > MAX_FILES or sum(map(len, files.values())) > MAX_BYTES:
        _fail("package exceeds 10000 files or 512 MiB")
    report = _review(files)
    name = mode_id.lower().replace("_", "-")
    if len(name) > 64 or not PLUGIN_NAME.fullmatch(name):
        _fail("Mode id cannot form a valid Agent Plugins package name")
    manifest = {"$schema": SCHEMA, "name": name, "extensions": {NAMESPACE: {
        "formatVersion": 1, "mode": mode_id,
        "files": {name: _digest(data) for name, data in sorted(files.items())},
        "executableFiles": sorted(executable),
    }}}
    files["plugin.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode()
    result = {"operation": "mode.export", "mode": mode_id, "output": str(target), "check": check,
              "contentDigest": _content_digest(files), "files": sorted(files),
              "includedProfile": include_profile, "excluded": sorted(excluded), **report}
    if not check:
        target.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix=".asl-pack-", dir=target.parent) as temporary:
            staged = Path(temporary) / "incoming"
            if target.suffix.lower() == ".zip":
                with zipfile.ZipFile(staged, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                    for name, data in sorted(files.items()):
                        entry = zipfile.ZipInfo(name)
                        entry.create_system = 3
                        entry.external_attr = (stat.S_IFREG | (0o755 if name in executable else 0o644)) << 16
                        archive.writestr(entry, data, compress_type=zipfile.ZIP_DEFLATED)
            else:
                staged.mkdir()
                _write_files(staged, files)
                for name in executable:
                    (staged / name).chmod(0o755)
            staged.rename(target)
    return result


@contextmanager
def _opened_pack(source: str | Path):
    files = _read_package(Path(source).resolve())
    try:
        manifest = json.loads(files["plugin.json"], object_pairs_hook=_unique_object)
        _validate_manifest(manifest)
        extension = manifest["extensions"][NAMESPACE]
        mode_id = extension["mode"]
        hashes = extension["files"]
        executable = extension.get("executableFiles", [])
        if manifest["$schema"] != SCHEMA or type(extension["formatVersion"]) is not int or extension["formatVersion"] != 1 or not isinstance(hashes, dict):
            _fail("unsupported ASL package version")
        payload = {name: data for name, data in files.items() if name != "plugin.json"}
        if hashes != {name: _digest(data) for name, data in payload.items()}:
            _fail("package digest mismatch or unlisted content")
        if not isinstance(executable, list) or any(not isinstance(name, str) or name not in payload for name in executable):
            _fail("invalid executable file metadata")
        _safe_path(mode_id)
        if "/" in mode_id:
            _fail("invalid Mode id")
    except (KeyError, TypeError, ValueError) as error:
        raise HarnessError("PACK_INVALID", "ASL snapshot manifest is missing or invalid; generic plugins need a separate adoption path") from error
    report = _review(payload)
    with tempfile.TemporaryDirectory(prefix="asl-pack-read-") as temporary:
        root = Path(temporary)
        restored = {}
        for name, data in payload.items():
            if name.startswith("skills/"):
                restored[name] = data
            elif name in {f"{NAMESPACE}/modes/{mode_id}/MODE.md", f"{NAMESPACE}/modes/{mode_id}/mode.yaml", f"{NAMESPACE}/PROFILE.md"}:
                restored[name.removeprefix(f"{NAMESPACE}/")] = data
            else:
                _fail(f"unsupported ASL snapshot content: {name}")
        restored.setdefault("PROFILE.md", b"# Profile\n\nConfigure personal preferences locally.\n")
        restored["WORKSPACE.md"] = b"# Work environment\n"
        _write_files(root, restored)
        for name in executable:
            if name.startswith("skills/"):
                (root / name).chmod(0o755)
        for area in LIFECYCLE_AREAS:
            (root / area).mkdir()
        workspace = Workspace.open(root)
        if set(workspace.skills) != set(workspace.mode_skill_ids(mode_id)):
            _fail("package contains Skills outside the selected Mode closure")
        yield workspace, {"operation": "mode.inspect", "mode": mode_id, "skills": sorted(workspace.skills),
                          "files": sorted(files), "contentDigest": _content_digest(files),
                          "includedProfile": f"{NAMESPACE}/PROFILE.md" in files, **report}


def inspect_pack(source: str | Path) -> dict:
    with _opened_pack(source) as (_, report):
        return report


def import_pack(source: str | Path, target: str | Path, *, check: bool = False, replace: bool = False) -> dict:
    destination = Path(target).resolve()
    with _opened_pack(source) as (incoming, report):
        mode_id = report["mode"]
        existing = Workspace.open(destination) if destination.exists() else None
        actions = {}
        packages = {f"skills/{name}": item.path for name, item in incoming.skills.items()}
        packages[f"modes/{mode_id}"] = incoming.modes[mode_id].path
        for relative, package in packages.items():
            local = destination / relative
            if not local.resolve().is_relative_to(destination):
                _fail(f"import target escapes Environment: {relative}")
            actions[relative] = ("add" if not local.exists() else "unchanged"
                                 if package_fingerprint(package) == package_fingerprint(local)
                                 else "replace" if replace else "conflict")
        conflicts = [path for path, action in actions.items() if action == "conflict"]
        changes = [path for path, action in actions.items() if action in {"add", "replace"}]
        changed_skills = {path.split("/")[1] for path, action in actions.items() if path.startswith("skills/") and action != "unchanged"}
        affected = sorted(name for name in existing.modes if changed_skills.intersection(existing.mode_skill_ids(name))) if existing else []
        result = {**report, "operation": "mode.import", "target": str(destination), "check": check,
                  "actions": actions, "conflicts": conflicts, "affectedModes": affected,
                  "changed": bool(changes), "profileAction": "preserved" if existing else "imported" if report["includedProfile"] else "local-default"}
        if check:
            return result
        if conflicts:
            raise HarnessError("PACK_CONFLICT", "local content conflict: " + ", ".join(conflicts) + "; review and use --replace explicitly")
        if existing is None:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix=".asl-import-", dir=destination.parent) as temporary:
                staged = Path(temporary) / "incoming"
                shutil.copytree(incoming.root, staged)
                Workspace.open(staged).sync_workspace_view()
                Workspace.open(staged)
                staged.rename(destination)
        elif changes:
            with _rollback_paths(destination, [*changes, "WORKSPACE.md"]):
                for relative in changes:
                    if actions[relative] == "replace":
                        _replace_package(packages[relative], destination / relative)
                    else:
                        shutil.copytree(packages[relative], destination / relative)
                Workspace.open(destination).sync_workspace_view()
                Workspace.open(destination)
        result["gitStatus"] = _git_status(destination, [*changes, "WORKSPACE.md"])
        return result
