"""Build a Windows portable desktop folder without changing the user's Python.

Run with a build-only venv containing PyInstaller and project dependencies, after npm ci in desktop/.
The output path must be new. No installer, auto-update service, or signing claim.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import shutil
import subprocess
import sys
import tomllib
from pathlib import Path


def core_metadata(root: Path, output: Path) -> Path:
    project = tomllib.loads((root / "pyproject.toml").read_text(encoding="utf-8"))["project"]
    folder = output / f"{project['name'].replace('-', '_')}-{project['version']}.dist-info"
    folder.mkdir()
    (folder / "METADATA").write_text(
        f"Metadata-Version: 2.3\nName: {project['name']}\nVersion: {project['version']}\n",
        encoding="utf-8",
    )
    return folder


def smoke_core(app: Path, smoke: Path) -> None:
    document = "# 中文模式验收\n\n研究与表达 🎨。\n\n```mermaid\nflowchart LR\n A[研究] --> B[表达]\n```\n"
    command = [
        str(app / "resources/core/asl-harness.exe"), "environment.edit", "--workspace", str(smoke),
    ]
    for identifier, text in (("unicode-smoke", document), ("invalid-smoke", "```mermaid\nflowchart LR\n A -->[\n```\n")):
        check = subprocess.run(command, input=json.dumps({"operation": "mode.save", "id": identifier, "document": text,
                                "skills": ["source-research"], "architecture": {"shared": ["source-research"], "paradigms": []}}, ensure_ascii=False).encode("utf-8"), capture_output=True, timeout=70)
        output = check.stdout.decode("utf-8", errors="replace")
        try:
            report = json.loads(output)
        except ValueError as cause:
            raise ValueError(f"Packaged core returned no report: exit={check.returncode}, {command[0]}") from cause
        if identifier == "unicode-smoke":
            if check.returncode or not report.get("ok") or report.get("diagrams", {}).get("rendered") != 1:
                raise ValueError(f"Packaged real Mermaid render failed: {output}")
            view = (smoke / "WORKSPACE.md").read_bytes()
        elif check.returncode != 2 or report.get("error", {}).get("code") != "MERMAID_RENDER_FAILED" or (smoke / "modes/invalid-smoke").exists():
            raise ValueError(f"Packaged core accepted invalid Mermaid: {output}")
        if (smoke / "modes/unicode-smoke/MODE.md").read_text(encoding="utf-8") != document or (smoke / "WORKSPACE.md").read_bytes() != view:
            raise ValueError("Packaged content changed while saving or rejecting Mermaid")


def build(output: Path) -> Path:
    if sys.platform != "win32":
        raise ValueError("This packaging script currently supports Windows only")
    root = Path(__file__).resolve().parents[1]
    desktop = root / "desktop"
    runtime = desktop / "node_modules/electron/dist"
    output = output.resolve()
    if output.exists():
        raise ValueError("Use a new output directory; existing builds are never deleted")
    if not (runtime / "electron.exe").is_file():
        raise ValueError("Run npm ci in desktop/ first")
    npm = shutil.which("npm.cmd") or shutil.which("npm")
    if not npm:
        raise ValueError("Node.js and npm are required to build the interface")
    subprocess.run([npm, "run", "build"], cwd=desktop, check=True)
    output.mkdir(parents=True)
    work = output / "build"
    work.mkdir()
    metadata = core_metadata(root, work)
    subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--name", "asl-harness",
                    "--add-data", f"{metadata};{metadata.name}",
                    "--paths", str(root / "src"), "--distpath", str(work / "dist"),
                    "--workpath", str(work / "work"), "--specpath", str(work), str(desktop / "core_entry.py")], check=True)
    app = output / "ASL Workspace"
    shutil.copytree(runtime, app, ignore=shutil.ignore_patterns("default_app.asar"))
    (app / "electron.exe").rename(app / "ASL Workspace.exe")
    assets = app / "resources/app"
    assets.mkdir()
    for name in ("package.json", "main.cjs", "preload.cjs", "bridge.cjs", "library.cjs", "native.cjs", "market.cjs", "assistant.cjs", "repository.cjs", "read-requests.cjs", "repository-import.cjs", "connections.cjs", "local-discovery.cjs", "mermaid-check.cjs"):
        shutil.copy2(desktop / name, assets / name)
    shutil.copytree(desktop / "dist", assets / "dist")
    shutil.copytree(work / "dist/asl-harness", app / "resources/core")
    shutil.copytree(root / "examples/personal-environment", app / "resources/example-environment")
    # Test the frozen executable, not the developer's Python / locale.
    smoke = work / "smoke-environment"
    shutil.copytree(root / "examples/personal-environment", smoke)
    smoke_core(app, smoke)
    shutil.copy2(root / "LICENSE", app / "ASL-LICENSE.txt")
    notices = app / "resources/licenses"
    notices.mkdir()
    packages = subprocess.run([npm, "ls", "--omit=dev", "--all", "--parseable"],
                              cwd=desktop, capture_output=True, text=True, check=True)
    for location in packages.stdout.splitlines()[1:]:
        package = Path(location)
        metadata = json.loads((package / "package.json").read_text(encoding="utf-8"))
        destination = notices / "npm" / metadata["name"].replace("/", "--")
        for source in package.iterdir():
            if source.is_file() and source.name.lower().startswith(("license", "copying", "notice")):
                destination.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, destination / source.name)
    for package in ('PyYAML', 'tomlkit'):
        for file in importlib.metadata.files(package) or []:
            if file.name == "LICENSE":
                shutil.copy2(file.locate(), notices / f"{package}-LICENSE.txt")
    for name in ("LICENSE.txt", "LICENSE_PYTHON.txt", "LICENSE"):
        source = Path(sys.base_prefix) / name
        if source.is_file():
            shutil.copy2(source, notices / "Python-LICENSE.txt")
            break
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="构建自带核心的 ASL Windows 桌面便携版")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps({"output": str(build(args.output)), "signed": False}, ensure_ascii=False))
