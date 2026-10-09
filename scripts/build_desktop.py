"""Build a native Windows portable folder or macOS app on that operating system.

Run with a build-only venv containing PyInstaller and project dependencies, after npm ci in desktop/.
The output path must be new. No installer, auto-update service, or signing claim.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
import plistlib
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
    core = app / ('Contents/Resources/core/asl-harness' if sys.platform == 'darwin' else 'resources/core/asl-harness.exe')
    command = [
        str(core), "environment.edit", "--workspace", str(smoke),
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
    if sys.platform not in ('win32', 'darwin'):
        raise ValueError('Build on Windows or macOS; cross-compilation is not supported')
    mac = sys.platform == 'darwin'
    root = Path(__file__).resolve().parents[1]
    desktop = root / "desktop"
    runtime = desktop / "node_modules/electron/dist"
    output = output.resolve()
    if output.exists():
        raise ValueError("Use a new output directory; existing builds are never deleted")
    binary = runtime / ('Electron.app/Contents/MacOS/Electron' if mac else 'electron.exe')
    if not binary.is_file():
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
                    "--add-data", f"{metadata}{os.pathsep}{metadata.name}",
                    "--paths", str(root / "src"), "--distpath", str(work / "dist"),
                    "--workpath", str(work / "work"), "--specpath", str(work), str(desktop / "core_entry.py")], check=True)
    app = output / ('ASL Workspace.app' if mac else 'ASL Workspace')
    shutil.copytree(runtime / 'Electron.app' if mac else runtime, app, symlinks=mac,
                    ignore=shutil.ignore_patterns('default_app.asar'))
    resources = app / ('Contents/Resources' if mac else 'resources')
    if mac:
        (app / 'Contents/MacOS/Electron').rename(app / 'Contents/MacOS/ASL Workspace')
        info_file = app / 'Contents/Info.plist'
        info = plistlib.loads(info_file.read_bytes())
        version = json.loads((desktop / 'package.json').read_text(encoding='utf-8'))['version']
        info.update(CFBundleName='ASL Workspace', CFBundleDisplayName='ASL Workspace', CFBundleExecutable='ASL Workspace',
                    CFBundleIdentifier='com.asl.workspace', CFBundleVersion=version,
                    CFBundleShortVersionString=version)
        info_file.write_bytes(plistlib.dumps(info))
    else:
        (app / 'electron.exe').rename(app / 'ASL Workspace.exe')
    assets = resources / 'app'
    assets.mkdir()
    for source in [desktop / 'package.json', *desktop.glob('*.cjs')]:
        shutil.copy2(source, assets / source.name)
    shutil.copytree(desktop / "dist", assets / "dist")
    shutil.copytree(work / 'dist/asl-harness', resources / 'core', symlinks=mac)
    shutil.copytree(root / 'examples/personal-environment', resources / 'example-environment')
    shutil.copy2(root / 'LICENSE', (resources if mac else app) / 'ASL-LICENSE.txt')
    notices = resources / 'licenses'
    notices.mkdir()
    if mac:
        shutil.copy2(runtime / 'LICENSE', notices / 'Electron-LICENSE.txt')
        shutil.copy2(runtime / 'LICENSES.chromium.html', notices / 'LICENSES.chromium.html')
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
    if mac:
        # Re-seal changed resources locally; this is not publisher signing or notarization.
        subprocess.run(['codesign', '--force', '--deep', '--sign', '-', '--preserve-metadata=entitlements', str(app)], check=True)
        subprocess.run(['codesign', '--verify', '--deep', '--strict', str(app)], check=True)
    # Test the frozen executable after assembly/signing, not the developer's Python / locale.
    smoke = work / 'smoke-environment'
    shutil.copytree(root / 'examples/personal-environment', smoke)
    smoke_core(app, smoke)
    return app


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="在本机平台构建自带核心的 ASL 桌面预览版")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps({'output': str(build(args.output)), 'signed': False,
                      'adHocSigned': sys.platform == 'darwin', 'notarized': False}, ensure_ascii=False))
