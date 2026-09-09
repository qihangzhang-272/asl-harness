"""Build a Windows portable desktop folder without changing the user's Python.

Run with a build-only venv containing PyInstaller and PyYAML, after npm ci in desktop/.
The output path must be new. No installer, auto-update service, or signing claim.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import shutil
import subprocess
import sys
from pathlib import Path


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
    subprocess.run([sys.executable, "-m", "PyInstaller", "--noconfirm", "--name", "asl-harness",
                    "--paths", str(root / "src"), "--distpath", str(work / "dist"),
                    "--workpath", str(work / "work"), "--specpath", str(work), str(desktop / "core_entry.py")], check=True)
    app = output / "ASL Workspace"
    shutil.copytree(runtime, app, ignore=shutil.ignore_patterns("default_app.asar"))
    (app / "electron.exe").rename(app / "ASL Workspace.exe")
    assets = app / "resources/app"
    assets.mkdir()
    for name in ("package.json", "main.cjs", "preload.cjs", "bridge.cjs", "library.cjs", "native.cjs", "market.cjs"):
        shutil.copy2(desktop / name, assets / name)
    shutil.copytree(desktop / "dist", assets / "dist")
    shutil.copytree(work / "dist/asl-harness", app / "resources/core")
    shutil.copytree(root / "examples/personal-environment", app / "resources/example-environment")
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
    for file in importlib.metadata.files("PyYAML") or []:
        if file.name == "LICENSE":
            shutil.copy2(file.locate(), notices / "PyYAML-LICENSE.txt")
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
