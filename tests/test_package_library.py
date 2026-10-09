import importlib.util
import json
import subprocess
import zipfile
from pathlib import Path
import pytest


def package_module():
    source = Path(__file__).resolve().parents[1] / 'scripts/package_library.py'
    assert source.is_file(), 'Content edition needs a repeatable committed-snapshot packager'
    spec = importlib.util.spec_from_file_location('package_library', source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def git(root, *args):
    return subprocess.check_output(['git', '-C', str(root), *args], text=True, encoding='utf-8').strip()


def fixture(tmp_path, *, mac=False, secret=None):
    library = tmp_path / '中文 工作库'
    library.mkdir()
    git(library, 'init'); git(library, 'config', 'user.name', 'ASL Test')
    git(library, 'config', 'user.email', 'test@example.invalid')
    for name, value in {'PROFILE.md':'# Public profile', 'WORKSPACE.md':'# Public view', 'skills/research/SKILL.md':'---\nname: research\ndescription: 已发布研究\n---\n# 已发布研究',
                        'skills/research/SOURCE.md':'# Source\n\n- Origin: local://tests/research\n', 'skills/research/scripts/run.sh':'echo published',
                        'skills/research/.env.example':'EXAMPLE=${KEY}', 'modes/research/MODE.md':'# Public mode',
                        'modes/research/mode.yaml':'apiVersion: asl-wep/v0.3.0\nkind: ModeProjection\nmetadata:\n  id: research\nspec:\n  skills: [research]\n', 'archive/private.md':'not a delivery',
                        'feedback/private.md':'not a delivery', '.env':'PRIVATE=never',
                        'skills/research/node_modules/private.js':'not a delivery'}.items():
        target = library / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(value, encoding='utf-8')
    if secret:
        (library / 'skills/research/config.json').write_text(secret, encoding='utf-8')
    git(library, 'add', '.'); git(library, 'commit', '-m', '2026-10-08 12:00｜建立打包测试公开内容')
    revision = git(library, 'rev-parse', 'HEAD')
    git(library, 'update-ref', 'refs/remotes/origin/main', revision)
    (library / 'skills/research/SKILL.md').write_text('UNPUBLISHED PRIVATE EDIT', encoding='utf-8')
    (library / 'skills/research/untracked.md').write_text('PRIVATE', encoding='utf-8')
    app = tmp_path / ('ASL Workspace.app' if mac else 'ASL Workspace')
    resources = app / ('Contents/Resources' if mac else 'resources')
    (resources / 'app').mkdir(parents=True)
    (resources / 'app/package.json').write_text('{"version":"0.5.12"}', encoding='utf-8')
    (resources / 'core').mkdir()
    (resources / 'core' / ('asl-harness' if mac else 'asl-harness.exe')).write_bytes(b'CLI')
    executable = app / ('Contents/MacOS/Electron' if mac else 'ASL Workspace.exe')
    executable.parent.mkdir(exist_ok=True)
    executable.write_bytes(b'APP')
    return app, library, revision


@pytest.mark.parametrize('mac', [False, True])
def test_content_edition_uses_only_published_snapshot_and_relative_launcher(tmp_path, mac):
    module = package_module()
    app, library, revision = fixture(tmp_path, mac=mac)
    before = git(library, 'status', '--porcelain')
    output = tmp_path / '中文 发布 内容包.zip'
    result = module.package(app, library, revision, output)
    with zipfile.ZipFile(output) as archive:
        names = archive.namelist()
        assert archive.read('Agent Skill Library/skills/research/SKILL.md') == subprocess.check_output(['git', '-C', str(library), 'show', revision + ':skills/research/SKILL.md'])
        assert archive.read('Agent Skill Library/skills/research/scripts/run.sh') == b'echo published'
        assert 'Agent Skill Library/skills/research/.env.example' in names
        assert all(f'Agent Skill Library/{area}/' in names for area in ('candidates', 'trials', 'feedback', 'archive'))
        assert not any('/.git/' in name or 'untracked' in name or 'private' in name or 'node_modules' in name or name.endswith('/.env') for name in names)
        launcher = archive.read('Start.command' if mac else 'Start.cmd').decode('utf-8')
        assert str(tmp_path) not in launcher and '--workspace' in launcher
        assert 'Agent Skill Library' in launcher and 'ASL Workspace' in launcher
        if mac:
            assert archive.getinfo('Start.command').external_attr >> 16 & 0o111
            assert '"$ROOT/ASL Workspace.app/Contents/MacOS/Electron"' in launcher
        else:
            assert r'"%~dp0ASL Workspace\ASL Workspace.exe"' in launcher
            assert '"%~dp0Agent Skill Library"' in launcher
        assert json.loads(archive.read('RELEASE.json'))['libraryRevision'] == revision
        assert '- Archive：无' in archive.read('Agent Skill Library/WORKSPACE.md').decode()
    assert output.with_suffix('.zip.sha256').is_file()
    assert result['libraryRevision'] == revision
    assert git(library, 'status', '--porcelain') == before
    assert (library / 'skills/research/SKILL.md').read_text() == 'UNPUBLISHED PRIVATE EDIT'


def test_content_edition_rejects_unpublished_commit_and_existing_destination(tmp_path):
    module = package_module()
    app, library, published = fixture(tmp_path)
    git(library, 'add', '.'); git(library, 'commit', '-m', '2026-10-08 12:01｜建立未发布测试修改')
    private = git(library, 'rev-parse', 'HEAD')
    output = tmp_path / 'private.zip'
    with pytest.raises(ValueError, match='published'):
        module.package(app, library, private, output)
    assert not output.exists()
    output.write_bytes(b'KEEP')
    with pytest.raises(ValueError, match='exists'):
        module.package(app, library, published, output)
    assert output.read_bytes() == b'KEEP'


def test_content_edition_reuses_secret_literal_gate_before_creating_zip(tmp_path):
    module = package_module()
    app, library, revision = fixture(tmp_path, secret='{"api_key":"not-a-placeholder"}')
    output = tmp_path / 'secret.zip'
    with pytest.raises(Exception, match='secret'):
        module.package(app, library, revision, output)
    assert not output.exists()


def test_content_edition_rejects_committed_secret_files_without_omitting_skill_bytes(tmp_path):
    module = package_module()
    app, library, _ = fixture(tmp_path)
    (library / 'skills/research/credentials.json').write_text('{"token":"PRIVATE"}', encoding='utf-8')
    git(library, 'add', 'skills/research/credentials.json')
    git(library, 'commit', '-m', '2026-10-08 12:02｜建立秘密文件拒绝夹具')
    revision = git(library, 'rev-parse', 'HEAD')
    git(library, 'update-ref', 'refs/remotes/origin/main', revision)
    output = tmp_path / 'secret-file.zip'
    with pytest.raises(Exception, match='secret-bearing'):
        module.package(app, library, revision, output)
    assert not output.exists()


def test_mac_archive_preserves_internal_framework_symlink(tmp_path):
    module = package_module()
    app, library, revision = fixture(tmp_path, mac=True)
    target = app / 'Contents/Resources/data'
    target.write_bytes(b'framework')
    link = app / 'Contents/Resources/link'
    try:
        link.symlink_to('data')
    except OSError:
        pytest.skip('Platform does not allow creating test symlinks')
    output = tmp_path / 'mac-links.zip'
    module.package(app, library, revision, output)
    with zipfile.ZipFile(output) as archive:
        info = archive.getinfo('ASL Workspace.app/Contents/Resources/link')
        assert info.external_attr >> 16 & 0o170000 == 0o120000
        assert archive.read(info) == b'data'
