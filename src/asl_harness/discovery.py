"""Read installed Skill packages without loading their code or changing their files."""
from pathlib import Path
import os
import re

import yaml

from .workspace import GENERATED_DIRECTORIES, HarnessError, SKILL_FRONTMATTER, _UniqueKeyLoader, _safe_id
from .dependencies import describe_dependencies


def inspect_skill(source: str | Path) -> dict:
    """Static hints, not a semantic independence proof or an execution test."""
    root = Path(source).resolve()
    files, manifests, reasons = [], {}, []
    skip = GENERATED_DIRECTORIES | {".git", ".venv", "venv", ".asl"}
    text_suffixes = {".md", ".py", ".js", ".ts", ".sh", ".ps1", ".json", ".toml", ".yaml", ".yml", ".txt"}
    for directory, dirs, names in os.walk(root, followlinks=False):
        dirs[:] = [d for d in dirs if d not in skip]
        for name in [*dirs, *names]:
            path = Path(directory) / name
            if path.is_symlink() or getattr(path, "is_junction", lambda: False)():
                reasons.append(f"包含链接，需要核对原位置：{path.relative_to(root).as_posix()}")
        dirs[:] = [d for d in dirs if not (Path(directory) / d).is_symlink()
                   and not getattr(Path(directory) / d, "is_junction", lambda: False)()]
        for name in names:
            path = Path(directory) / name
            relative = path.relative_to(root).as_posix()
            if name in skip or not path.resolve().is_relative_to(root):
                continue
            files.append(relative)
            if len(files) > 1000:
                reasons.append("文件较多，未展开全部内容")
                return {"status": "needs-review", "files": files[:1000], "reasons": sorted(set(reasons)), "dependencies": describe_dependencies(manifests)}
            if path.suffix in {".py", ".js", ".ts", ".sh", ".ps1"}:
                reasons.append("包含执行脚本，需要核对运行方式")
            if path.stat().st_size > 2 * 1024 * 1024 or path.suffix not in text_suffixes:
                continue
            data = path.read_bytes()
            if name.lower() in {"package.json", "pyproject.toml", "requirements.txt", "mcp.json", ".mcp.json"}:
                manifests[relative] = data
            try:
                text = data.decode("utf-8")
            except UnicodeDecodeError:
                continue
            if re.search(r"```(?:bash|sh|shell|powershell)|\b(?:pip3?|npm|pnpm|bun)\s+install\b|\b(?:npx|uvx)\s", text):
                reasons.append("说明包含终端命令，需要核对运行环境与安装方式")
            # ponytail: explicit relative paths only; free-form setup logic still needs a reader.
            refs = re.findall(r"(?:\.{1,2}/)+[^\s`\"'<>\)\]]+", text)
            if path.suffix == ".md":
                refs += re.findall(r"\]\(([^\s)]+)\)", text)
            for ref in refs:
                if re.match(r"[a-zA-Z][\w+.-]*:", ref) or ref.startswith(("#", "/")):
                    continue
                target = (path.parent / ref.split("#")[0]).resolve()
                if not target.is_relative_to(root):
                    reasons.append(f"引用技能目录外的内容：{relative} → {ref}")
                elif not target.exists():
                    reasons.append(f"未找到引用文件：{relative} → {ref}")
    dependencies = describe_dependencies(manifests)
    if dependencies:
        reasons.append("有运行依赖或连接声明，需要按原说明配置")
    return {"status": "needs-review" if reasons else "package-ready", "files": sorted(files),
            "reasons": sorted(set(reasons)), "dependencies": dependencies}


def scan_skills(roots: list[str | Path]) -> dict:
    skills, issues, visited = [], [], set()
    skip = GENERATED_DIRECTORIES | {".git", ".venv", "venv", ".asl"}
    for root in roots:
        root = Path(root).resolve()
        if not root.is_dir():
            issues.append({"path": str(root), "message": "目录不存在"})
            continue
        pending = [(root, 0)]
        while pending:
            path, depth = pending.pop()
            try:
                real = path.resolve()
                if real in visited:
                    continue
                visited.add(real)
                if len(visited) > 10000:
                    raise HarnessError("SCAN_LIMIT", "目录过多，请选择更具体的技能目录")
                file = real / "SKILL.md"
                if file.is_file():
                    if file.stat().st_size > 1024 * 1024:
                        raise ValueError("SKILL.md 超过 1 MB")
                    text = file.read_text(encoding="utf-8")
                    match = SKILL_FRONTMATTER.match(text)
                    meta = yaml.load(match.group("header"), Loader=_UniqueKeyLoader) if match else None
                    if not isinstance(meta, dict) or not isinstance(meta.get("description"), str) or not meta["description"].strip():
                        raise ValueError("缺少有效的 name / description")
                    identifier = _safe_id(meta.get("name"), "技能名称")
                    heading = re.search(r"(?m)^#\s+(.+)$", text)
                    inspection = inspect_skill(real)
                    asl = meta.get("metadata", {})
                    asl = asl.get("asl", {}) if isinstance(asl, dict) else {}
                    if meta.get("requires") or isinstance(asl, dict) and asl.get("requires"):
                        inspection["status"] = "needs-review"
                        inspection["reasons"].append("声明了其他技能依赖，需要连同依赖一起核对")
                    skills.append({"id": identifier, "title": heading.group(1) if heading else identifier, "description": meta["description"].strip(),
                                   "source": str(real), "location": str(path), "root": str(root), "inspection": inspection})
                    continue  # References and bundled examples are not separate installed Skills.
                if depth >= 8:
                    issues.append({"path": str(path), "message": "目录过深，请直接选择技能所在目录"})
                    continue
                pending.extend((p, depth + 1) for p in sorted(real.iterdir(), reverse=True) if p.name not in skip and p.is_dir())
            except (OSError, ValueError, yaml.YAMLError, HarnessError) as error:
                issues.append({"path": str(path), "message": str(error)})
                if isinstance(error, HarnessError) and error.code == "SCAN_LIMIT":
                    return {"skills": skills, "issues": issues}
    return {"skills": sorted(skills, key=lambda s: (s["id"].lower(), s["source"])), "issues": issues}


def unpack_skills(source: str | Path, output: str | Path) -> dict:
    # Reuse the portable package reader's zip-slip, symlink, size and collision checks.
    from .portable import _read_package, OMIT
    target = Path(output).resolve()
    if target.exists():
        raise HarnessError("SCAN_TARGET", "解包位置已存在")
    files = _read_package(Path(source))
    # GitHub ZIPs wrap everything in repo-commit/. Drop only that common wrapper.
    prefixes = {name.split("/")[0] for name in files}
    if len(prefixes) == 1 and all("/" in name for name in files):
        files = {name.split("/", 1)[1]: data for name, data in files.items()}
    for name, data in files.items():
        if any(part in OMIT for part in Path(name).parts):
            continue
        file = target / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_bytes(data)
    report = scan_skills([target])
    report["repositoryFiles"] = sorted(files)
    report["repositoryDependencies"] = describe_dependencies(files)
    return report
