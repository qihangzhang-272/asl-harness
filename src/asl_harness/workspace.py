from __future__ import annotations

import hashlib
import os
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

import yaml


MODE_API_VERSION = "asl-wep/v0.3.0"
SAFE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]*\Z")
LIFECYCLE_AREAS = ("candidates", "trials", "feedback", "archive")
GENERATED_DIRECTORIES = {
    "__pycache__",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "node_modules",
}
SECRET_FILE_NAMES = {".env", "id_ed25519", "id_rsa"}
SECRET_FILE_SUFFIXES = {".key", ".p12", ".pem", ".pfx"}
VIEW_START = "<!-- ASL:CAPABILITY VIEW START -->"
VIEW_END = "<!-- ASL:CAPABILITY VIEW END -->"
SKILL_FRONTMATTER = re.compile(
    r"\A---\r?\n(?P<header>.*?)\r?\n---(?:\r?\n|\Z)", re.DOTALL
)


class HarnessError(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


class _DuplicateKeyError(ValueError):
    pass


class _UniqueKeyLoader(yaml.SafeLoader):
    pass


def _construct_unique_mapping(
    loader: _UniqueKeyLoader, node: yaml.MappingNode, deep: bool = False
) -> dict:
    mapping = {}
    for key_node, value_node in node.value:
        key = loader.construct_object(key_node, deep=deep)
        if key in mapping:
            raise _DuplicateKeyError(f"duplicate YAML key: {key!r}")
        mapping[key] = loader.construct_object(value_node, deep=deep)
    return mapping


_UniqueKeyLoader.add_constructor(
    yaml.resolver.BaseResolver.DEFAULT_MAPPING_TAG, _construct_unique_mapping
)


def load_yaml(path: Path) -> dict:
    try:
        value = yaml.load(path.read_text(encoding="utf-8"), Loader=_UniqueKeyLoader)
    except _DuplicateKeyError as error:
        raise HarnessError("DUPLICATE_YAML_KEY", str(error)) from error
    except (OSError, UnicodeDecodeError, yaml.YAMLError) as error:
        raise HarnessError("RESOURCE_INVALID", f"cannot read YAML: {path}") from error
    if not isinstance(value, dict):
        raise HarnessError(
            "RESOURCE_INVALID", f"YAML document must be a mapping: {path}"
        )
    return value


def _safe_id(value: object, label: str) -> str:
    if not isinstance(value, str) or not SAFE_ID.fullmatch(value):
        raise HarnessError("RESOURCE_INVALID", f"{label} must be a path-safe id")
    return value


def _read_nonempty(path: Path, label: str) -> str:
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError) as error:
        raise HarnessError("RESOURCE_INVALID", f"{label} is missing or unreadable") from error
    if not text.strip():
        raise HarnessError("RESOURCE_INVALID", f"{label} cannot be empty")
    return text


def _git_commit(root: Path) -> str:
    try:
        top = Path(
            subprocess.run(
                ["git", "-C", str(root), "rev-parse", "--show-toplevel"],
                check=True,
                capture_output=True,
                text=True,
            ).stdout.strip()
        ).resolve()
        commit = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return "uncommitted"
    if not root.is_relative_to(top) or not re.fullmatch(r"[0-9a-f]{40,64}", commit):
        return "uncommitted"
    return commit


def _package_files(package: Path, environment: Path) -> tuple[Path, ...]:
    files = []
    for path in package.rglob("*"):
        relative = path.relative_to(package)
        if any(part in GENERATED_DIRECTORIES or part == ".git" for part in relative.parts):
            continue
        if path.is_symlink():
            resolved = path.resolve()
            if not resolved.exists() or not resolved.is_relative_to(environment):
                raise HarnessError(
                    "PATH_ESCAPE", f"package link escapes the Environment: {path}"
                )
        if path.is_file():
            files.append(path)
    return tuple(sorted(files, key=lambda item: item.as_posix()))


def package_fingerprint(package: Path, *, ignored_names: frozenset[str] = frozenset()) -> str:
    digest = hashlib.sha256()
    for path in sorted(package.rglob("*"), key=lambda item: item.as_posix()):
        relative = path.relative_to(package)
        if any(
            part in GENERATED_DIRECTORIES or part == ".git" or part in ignored_names
            for part in relative.parts
        ):
            continue
        if path.is_file():
            digest.update(relative.as_posix().encode("utf-8"))
            digest.update(b"\0")
            digest.update(path.read_bytes())
            digest.update(b"\0")
    return digest.hexdigest()


def _scan_authored_material(root: Path) -> tuple[str, ...]:
    generated: set[str] = set()
    scan_roots = [root / "skills", root / "modes"] + [
        root / directory for directory in LIFECYCLE_AREAS
    ]
    for scan_root in scan_roots:
        for current, directories, files in os.walk(scan_root):
            current_path = Path(current)
            kept = []
            for directory in directories:
                path = current_path / directory
                if directory in GENERATED_DIRECTORIES:
                    generated.add(path.relative_to(root).as_posix())
                elif directory != ".git":
                    kept.append(directory)
            directories[:] = kept
            for filename in files:
                lower = filename.lower()
                secret = (
                    lower in SECRET_FILE_NAMES
                    or lower.startswith(".env.") and lower != ".env.example"
                    or Path(lower).suffix in SECRET_FILE_SUFFIXES
                )
                if secret:
                    relative = (current_path / filename).relative_to(root).as_posix()
                    raise HarnessError(
                        "SECRET_FILE_PRESENT",
                        f"secret-bearing file name is not allowed in the Environment: {relative}",
                    )
    return tuple(sorted(generated))


@dataclass(frozen=True)
class Skill:
    id: str
    path: Path
    description: str
    requires: tuple[str, ...]
    files: tuple[Path, ...]


@dataclass(frozen=True)
class Mode:
    id: str
    path: Path
    document: str
    skill_roots: tuple[str, ...]


def _read_skill(package: Path, skill_id: str, environment: Path) -> Skill:
    text = _read_nonempty(package / "SKILL.md", f"Skill {skill_id}/SKILL.md")
    try:
        source = _read_nonempty(package / "SOURCE.md", f"Skill {skill_id}/SOURCE.md")
    except HarnessError as error:
        raise HarnessError(
            "SKILL_SOURCE_INVALID", f"Skill {skill_id} requires a nonempty SOURCE.md"
        ) from error
    if not re.search(r"(?m)^#[ \t]+Source[ \t]*$", source) or not re.search(
        r"(?m)^-[ \t]+Origin:[ \t]*\S+", source
    ):
        raise HarnessError(
            "SKILL_SOURCE_INVALID",
            f"Skill {skill_id}/SOURCE.md must contain a Source heading and nonempty Origin",
        )
    match = SKILL_FRONTMATTER.match(text)
    if match is None:
        raise HarnessError("SKILL_INVALID", f"Skill {skill_id} has invalid frontmatter")
    try:
        metadata = yaml.load(match.group("header"), Loader=_UniqueKeyLoader)
    except (_DuplicateKeyError, yaml.YAMLError) as error:
        raise HarnessError("SKILL_INVALID", f"Skill {skill_id} has invalid frontmatter") from error
    completion = re.search(
        r"(?ms)^##[ \t]+完成标准[ \t]*$\s*(?P<body>.*?)(?=^##[ \t]+|\Z)", text
    )
    if (
        not isinstance(metadata, dict)
        or metadata.get("name") != skill_id
        or not isinstance(metadata.get("description"), str)
        or not metadata["description"].strip()
        or completion is None
        or not completion.group("body").strip()
    ):
        raise HarnessError(
            "SKILL_INVALID",
            f"Skill {skill_id} must declare matching name, description, and 完成标准",
        )
    package_metadata = metadata.get("metadata")
    asl_metadata = (
        package_metadata.get("asl") if isinstance(package_metadata, dict) else None
    )
    requires = asl_metadata.get("requires", []) if isinstance(asl_metadata, dict) else []
    if asl_metadata is not None and (
        not isinstance(asl_metadata, dict)
        or set(asl_metadata) != {"requires"}
        or not isinstance(requires, list)
        or any(not isinstance(item, str) or not SAFE_ID.fullmatch(item) for item in requires)
        or len(requires) != len(set(requires))
        or skill_id in requires
    ):
        raise HarnessError(
            "SKILL_INVALID",
            f"Skill {skill_id} metadata.asl.requires must contain unique other Skill ids",
        )
    return Skill(
        id=skill_id,
        path=package,
        description=metadata["description"].strip(),
        requires=tuple(requires),
        files=_package_files(package, environment),
    )


def _read_mode(package: Path, mode_id: str) -> Mode:
    document = _read_nonempty(package / "MODE.md", f"Mode {mode_id}/MODE.md")
    authored = load_yaml(package / "mode.yaml")
    metadata = authored.get("metadata")
    spec = authored.get("spec")
    skills = spec.get("skills") if isinstance(spec, dict) else None
    if (
        set(authored) != {"apiVersion", "kind", "metadata", "spec"}
        or authored.get("apiVersion") != MODE_API_VERSION
        or authored.get("kind") != "ModeProjection"
        or not isinstance(metadata, dict)
        or set(metadata) != {"id"}
        or metadata.get("id") != mode_id
        or not isinstance(spec, dict)
        or set(spec) != {"skills"}
        or not isinstance(skills, list)
        or not skills
        or any(not isinstance(item, str) or not SAFE_ID.fullmatch(item) for item in skills)
        or len(skills) != len(set(skills))
    ):
        raise HarnessError("MODE_INVALID", f"Mode {mode_id} has an invalid definition")
    return Mode(
        id=mode_id,
        path=package,
        document=document,
        skill_roots=tuple(skills),
    )


def _area_names(root: Path) -> tuple[str, ...]:
    return tuple(
        sorted(path.name for path in root.iterdir() if not path.name.startswith("."))
    )


def _read_lifecycle_areas(root: Path) -> dict[str, tuple[str, ...]]:
    areas: dict[str, tuple[str, ...]] = {}
    missing = [directory for directory in LIFECYCLE_AREAS if not (root / directory).is_dir()]
    if missing:
        rendered = ", ".join(f"{directory}/" for directory in missing)
        raise HarnessError(
            "ENVIRONMENT_INVALID", f"Environment requires lifecycle areas: {rendered}"
        )
    for directory in LIFECYCLE_AREAS:
        area = root / directory
        names = _area_names(area)
        areas[directory] = names
        if directory == "candidates":
            for candidate_id in names:
                package = area / candidate_id
                if not package.is_dir():
                    raise HarnessError(
                        "CANDIDATE_INVALID",
                        f"Candidate entry must be a directory: {package}",
                    )
                try:
                    _read_nonempty(
                        package / "SOURCE.md", f"Candidate {candidate_id}/SOURCE.md"
                    )
                except HarnessError as error:
                    raise HarnessError(
                        "CANDIDATE_INVALID",
                        f"Candidate {candidate_id} requires a nonempty SOURCE.md",
                    ) from error
        if directory == "trials":
            for trial_id in names:
                package = area / trial_id
                if not package.is_dir():
                    raise HarnessError(
                        "TRIAL_INVALID", f"Trial entry must be a directory: {package}"
                    )
                try:
                    _read_skill(package, trial_id, root)
                except HarnessError as error:
                    raise HarnessError(
                        "TRIAL_INVALID",
                        f"Trial {trial_id} must be a complete isolated Skill package",
                    ) from error
    return areas


@dataclass(frozen=True)
class Workspace:
    root: Path
    workspace_document: str
    profile: str
    skills: dict[str, Skill]
    modes: dict[str, Mode]
    cultivation: dict[str, tuple[str, ...]]
    warnings: tuple[dict, ...]
    git_commit: str

    @property
    def environment_id(self) -> str:
        return self.root.name

    @classmethod
    def open(cls, root: str | Path) -> "Workspace":
        resolved = Path(root).resolve()
        if not resolved.is_dir():
            raise HarnessError("ENVIRONMENT_INVALID", f"Environment is missing: {resolved}")
        legacy = [
            path
            for path in (
                resolved / "workspace.yaml",
                resolved / "workflows",
                resolved / ".asl" / "runs",
            )
            if path.exists()
        ]
        if legacy:
            names = ", ".join(str(path.relative_to(resolved)) for path in legacy)
            raise HarnessError(
                "LEGACY_LAYOUT_PRESENT",
                f"v0.3 Environment cannot contain legacy active surfaces: {names}",
            )
        workspace_document = _read_nonempty(resolved / "WORKSPACE.md", "WORKSPACE.md")
        profile = _read_nonempty(resolved / "PROFILE.md", "PROFILE.md")
        skills_root = resolved / "skills"
        modes_root = resolved / "modes"
        if not skills_root.is_dir() or not modes_root.is_dir():
            raise HarnessError(
                "ENVIRONMENT_INVALID", "Environment requires skills/ and modes/ directories"
            )
        cultivation = _read_lifecycle_areas(resolved)
        generated = _scan_authored_material(resolved)

        skills: dict[str, Skill] = {}
        for package in sorted(skills_root.iterdir(), key=lambda item: item.name):
            if not package.is_dir():
                continue
            skill_id = _safe_id(package.name, "Skill directory name")
            skills[skill_id] = _read_skill(package, skill_id, resolved)
        if not skills:
            raise HarnessError("ENVIRONMENT_INVALID", "Environment has no formal Skills")

        modes: dict[str, Mode] = {}
        for package in sorted(modes_root.iterdir(), key=lambda item: item.name):
            if not package.is_dir():
                continue
            mode_id = _safe_id(package.name, "Mode directory name")
            modes[mode_id] = _read_mode(package, mode_id)
        if not modes:
            raise HarnessError("ENVIRONMENT_INVALID", "Environment has no Modes")

        workspace = cls(
            root=resolved,
            workspace_document=workspace_document,
            profile=profile,
            skills=skills,
            modes=modes,
            cultivation=cultivation,
            warnings=(
                ({"code": "GENERATED_CONTENT_PRESENT", "paths": list(generated)},)
                if generated
                else ()
            ),
            git_commit=_git_commit(resolved),
        )
        workspace._validate_graph()
        return workspace

    def _validate_graph(self) -> None:
        for skill in self.skills.values():
            missing = [item for item in skill.requires if item not in self.skills]
            if missing:
                raise HarnessError(
                    "SKILL_DEPENDENCY_MISSING",
                    f"Skill {skill.id} requires missing Skills: {', '.join(missing)}",
                )
        for mode in self.modes.values():
            missing = [item for item in mode.skill_roots if item not in self.skills]
            if missing:
                raise HarnessError(
                    "MODE_SKILL_MISSING",
                    f"Mode {mode.id} references missing Skills: {', '.join(missing)}",
                )

        visiting: list[str] = []
        visited: set[str] = set()

        def visit(skill_id: str) -> None:
            if skill_id in visited:
                return
            if skill_id in visiting:
                cycle = visiting[visiting.index(skill_id) :] + [skill_id]
                raise HarnessError(
                    "SKILL_DEPENDENCY_CYCLE", f"Skill dependency cycle: {' -> '.join(cycle)}"
                )
            visiting.append(skill_id)
            for required in self.skills[skill_id].requires:
                visit(required)
            visiting.pop()
            visited.add(skill_id)

        for skill_id in self.skills:
            visit(skill_id)

    def mode_skill_ids(self, mode_id: str) -> tuple[str, ...]:
        mode = self.modes.get(mode_id)
        if mode is None:
            raise HarnessError("MODE_NOT_ACTIVE", f"Mode is not active: {mode_id}")
        ordered: list[str] = []

        def append(skill_id: str) -> None:
            if skill_id in ordered:
                return
            ordered.append(skill_id)
            for required in self.skills[skill_id].requires:
                append(required)

        for skill_id in mode.skill_roots:
            append(skill_id)
        return tuple(ordered)

    def source_fingerprint(self, mode_id: str) -> str:
        mode = self.modes.get(mode_id)
        if mode is None:
            raise HarnessError("MODE_NOT_ACTIVE", f"Mode is not active: {mode_id}")
        paths = [self.root / "PROFILE.md", mode.path / "MODE.md", mode.path / "mode.yaml"]
        for skill_id in self.mode_skill_ids(mode_id):
            paths.extend(self.skills[skill_id].files)
        digest = hashlib.sha256()
        for path in sorted(set(paths), key=lambda item: item.relative_to(self.root).as_posix()):
            relative = path.relative_to(self.root).as_posix().encode("utf-8")
            digest.update(relative)
            digest.update(b"\0")
            digest.update(path.read_bytes())
            digest.update(b"\0")
        return digest.hexdigest()

    def summary(self) -> dict:
        return {
            "environment": str(self.root),
            "environmentId": self.environment_id,
            "gitCommit": self.git_commit,
            "skills": [
                {
                    "id": skill.id,
                    "description": skill.description,
                    "requires": list(skill.requires),
                }
                for skill in self.skills.values()
            ],
            "modes": [
                {
                    "id": mode.id,
                    "skills": list(self.mode_skill_ids(mode.id)),
                }
                for mode in self.modes.values()
            ],
            "cultivation": {
                directory: list(names) for directory, names in self.cultivation.items()
            },
            "warnings": list(self.warnings),
            "workspaceViewCurrent": self.workspace_view_current(),
        }

    def state(self) -> dict:
        return {
            "environment": str(self.root),
            "environmentId": self.environment_id,
            "gitCommit": self.git_commit,
            "skillCount": len(self.skills),
            "modeCount": len(self.modes),
            "modes": [
                {"id": mode.id, "skillCount": len(self.mode_skill_ids(mode.id))}
                for mode in self.modes.values()
            ],
            "cultivation": {
                directory: len(names) for directory, names in self.cultivation.items()
            },
            "warnings": list(self.warnings),
            "workspaceViewCurrent": self.workspace_view_current(),
        }

    def render_workspace_view(self) -> str:
        skills = "\n".join(
            f"- `{skill.id}`：{skill.description}" for skill in self.skills.values()
        )
        modes = "\n".join(
            f"- `{mode.id}`：{', '.join(self.mode_skill_ids(mode.id))}"
            for mode in self.modes.values()
        )
        rendered_areas = {
            directory: "、".join(f"`{item}`" for item in names) or "无"
            for directory, names in self.cultivation.items()
        }
        warning_text = (
            "；".join(
                f"{warning['code']}：{', '.join(warning['paths'])}"
                for warning in self.warnings
            )
            or "无"
        )
        return f"""## 当前能力（ASL 自动维护）

### 状态摘要

- 正式业务 Skills：{len(self.skills)}
- 业务 Modes：{len(self.modes)}
- 确定性提醒：{warning_text}

### 正式 Skills

{skills}

### Modes

{modes}

### 培养区

- Candidates：{rendered_areas['candidates']}
- Trials：{rendered_areas['trials']}
- Feedback：{rendered_areas['feedback']}
- Archive：{rendered_areas['archive']}
"""

    def workspace_view_current(self) -> bool:
        text = self.workspace_document
        if text.count(VIEW_START) != 1 or text.count(VIEW_END) != 1:
            return False
        managed = text.split(VIEW_START, 1)[1].split(VIEW_END, 1)[0].strip()
        return managed == self.render_workspace_view().strip()

    def sync_workspace_view(self) -> Path:
        path = self.root / "WORKSPACE.md"
        text = path.read_text(encoding="utf-8")
        if text.count(VIEW_START) != text.count(VIEW_END) or text.count(VIEW_START) > 1:
            raise HarnessError(
                "WORKSPACE_VIEW_COLLISION", "WORKSPACE.md has invalid ASL capability markers"
            )
        managed = f"{VIEW_START}\n{self.render_workspace_view().strip()}\n{VIEW_END}"
        if VIEW_START in text:
            before, remainder = text.split(VIEW_START, 1)
            _, after = remainder.split(VIEW_END, 1)
            updated = before.rstrip() + "\n\n" + managed + after
        else:
            updated = text.rstrip() + "\n\n" + managed + "\n"
        path.write_text(updated, encoding="utf-8", newline="\n")
        return path
