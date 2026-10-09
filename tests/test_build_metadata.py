"""A frozen CLI reports the authoritative project version, not a second constant."""
import importlib.metadata
import importlib.util
import json
import plistlib
import shutil
from pathlib import Path
from subprocess import CompletedProcess
import pytest


def test_build_core_metadata_uses_project_version(tmp_path):
    script = Path(__file__).resolve().parents[1] / "scripts/build_desktop.py"
    spec = importlib.util.spec_from_file_location("asl_build", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    root = tmp_path / "source"
    root.mkdir()
    (root / "pyproject.toml").write_text('[project]\nname="asl-harness"\nversion="9.8.7"\n', encoding="utf-8")
    output = tmp_path / "build"
    output.mkdir()
    metadata = module.core_metadata(root, output)
    distributions = list(importlib.metadata.distributions(path=[str(output)]))
    assert metadata.parent == output
    assert len(distributions) == 1
    assert distributions[0].metadata["Name"] == "asl-harness"
    assert distributions[0].version == "9.8.7"


@pytest.mark.parametrize('platform', ['win32', 'darwin'])
@pytest.mark.parametrize('rejects_invalid,rendered', [(True, 1), (False, 1), (True, 0)])
def test_packaged_smoke_checks_real_render_and_invalid_rejection(tmp_path, monkeypatch, rejects_invalid, rendered, platform):
    script = Path(__file__).resolve().parents[1] / "scripts/build_desktop.py"
    spec = importlib.util.spec_from_file_location("asl_build", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module.sys, 'platform', platform)
    requests = []
    def edit(command, *, input, **kwargs):
        resources = 'Contents/Resources' if platform == 'darwin' else 'resources'
        executable = 'asl-harness' if platform == 'darwin' else 'asl-harness.exe'
        assert command[0] == str(tmp_path / 'app' / resources / 'core' / executable)
        request = json.loads(input)
        requests.append(request)
        assert '```mermaid' in request['document']
        assert kwargs['timeout'] == 70
        target = tmp_path / 'modes' / request['id'] / 'MODE.md'
        if request['id'] == 'invalid-smoke' and rejects_invalid:
            return CompletedProcess(command, 2, json.dumps({'ok': False, 'error': {'code': 'MERMAID_RENDER_FAILED'}}).encode())
        target.parent.mkdir(parents=True)
        target.write_text(request['document'], encoding='utf-8')
        (tmp_path / 'WORKSPACE.md').write_text('模式视图', encoding='utf-8')
        return CompletedProcess(command, 0, json.dumps({'ok': True, 'diagrams': {'rendered': rendered}}).encode())
    monkeypatch.setattr(module.subprocess, 'run', edit)
    if not rendered:
        with pytest.raises(ValueError, match='real Mermaid render'):
            module.smoke_core(tmp_path / 'app', tmp_path)
    elif rejects_invalid:
        module.smoke_core(tmp_path / 'app', tmp_path)
    else:
        with pytest.raises(ValueError, match='invalid Mermaid'):
            module.smoke_core(tmp_path / 'app', tmp_path)
    assert [request['id'] for request in requests] == (['unicode-smoke', 'invalid-smoke'] if rendered else ['unicode-smoke'])


@pytest.mark.parametrize('platform', ['win32', 'darwin'])
def test_native_bundle_includes_every_desktop_entry_and_frozen_core(tmp_path, monkeypatch, platform):
    source = Path(__file__).resolve().parents[1]
    spec = importlib.util.spec_from_file_location('asl_build_bundle', source / 'scripts/build_desktop.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    root = tmp_path / 'source'
    desktop = root / 'desktop'
    desktop.mkdir(parents=True)
    for file in [source / 'desktop/package.json', *source.joinpath('desktop').glob('*.cjs')]:
        shutil.copy2(file, desktop / file.name)
    shutil.copy2(source / 'pyproject.toml', root / 'pyproject.toml')
    shutil.copy2(source / 'LICENSE', root / 'LICENSE')
    (desktop / 'dist').mkdir()
    (desktop / 'dist/index.html').write_text('app', encoding='utf-8')
    (root / 'examples/personal-environment').mkdir(parents=True)
    runtime = desktop / 'node_modules/electron/dist'
    if platform == 'darwin':
        contents = runtime / 'Electron.app/Contents'
        (contents / 'MacOS').mkdir(parents=True)
        (contents / 'MacOS/Electron').write_bytes(b'native-electron')
        (contents / 'Resources').mkdir()
        (contents / 'Info.plist').write_bytes(plistlib.dumps({'CFBundleExecutable': 'Electron'}))
    else:
        (runtime / 'resources').mkdir(parents=True)
        (runtime / 'electron.exe').write_bytes(b'native-electron')
    (runtime / 'LICENSE').write_text('Electron license', encoding='utf-8')
    (runtime / 'LICENSES.chromium.html').write_text('Chromium licenses', encoding='utf-8')
    monkeypatch.setattr(module, '__file__', str(root / 'scripts/build_desktop.py'))
    monkeypatch.setattr(module.sys, 'platform', platform)
    monkeypatch.setattr(module.shutil, 'which', lambda _: 'npm')
    monkeypatch.setattr(module.importlib.metadata, 'files', lambda _: [])
    commands = []
    def run(command, **kwargs):
        commands.append(command)
        if 'PyInstaller' in command:
            core = Path(command[command.index('--distpath') + 1]) / 'asl-harness'
            core.mkdir(parents=True)
            (core / ('asl-harness' if platform == 'darwin' else 'asl-harness.exe')).write_bytes(b'frozen-core')
        return CompletedProcess(command, 0, str(desktop) + '\n', '')
    monkeypatch.setattr(module.subprocess, 'run', run)
    smoke_calls = []
    monkeypatch.setattr(module, 'smoke_core', lambda app, smoke: smoke_calls.append(app))
    app = module.build(tmp_path / 'output')
    resources = app / ('Contents/Resources' if platform == 'darwin' else 'resources')
    assert {p.name for p in desktop.glob('*.cjs')} <= {p.name for p in (resources / 'app').iterdir()}
    assert (resources / 'core' / ('asl-harness' if platform == 'darwin' else 'asl-harness.exe')).read_bytes() == b'frozen-core'
    assert smoke_calls == [app]
    if platform == 'darwin':
        assert app.name == 'ASL Workspace.app'
        info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
        assert info['CFBundleName'] == 'ASL Workspace'
        assert info['CFBundleShortVersionString'] == json.loads((desktop / 'package.json').read_text())['version']
        assert (resources / 'licenses/Electron-LICENSE.txt').read_text() == 'Electron license'
        assert (resources / 'licenses/LICENSES.chromium.html').read_text() == 'Chromium licenses'
        assert ['codesign', '--force', '--deep', '--sign', '-', '--preserve-metadata=entitlements', str(app)] in commands
        assert ['codesign', '--verify', '--deep', '--strict', str(app)] in commands
    else:
        assert (app / 'ASL Workspace.exe').read_bytes() == b'native-electron'
