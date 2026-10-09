import io
import json
import pytest
from pathlib import Path
from asl_harness import management
from asl_harness.commands import main
from asl_harness.portable import export_pack, import_pack
from asl_harness.workspace import HarnessError
from test_mode_only import _environment


@pytest.mark.parametrize('platform', ['win32', 'darwin', 'linux'])
def test_development_renderer_uses_native_electron_path(monkeypatch, platform):
    from asl_harness import mermaid
    monkeypatch.setattr(mermaid.sys, 'platform', platform)
    monkeypatch.setattr(mermaid.sys, 'frozen', False, raising=False)
    desktop = Path(mermaid.__file__).resolve().parents[2] / 'desktop'
    binary = {'win32': 'electron.exe', 'darwin': 'Electron.app/Contents/MacOS/Electron', 'linux': 'electron'}[platform]
    assert mermaid.renderer_command() == [str(desktop / 'node_modules/electron/dist' / binary), str(desktop), '--validate-mermaid']


@pytest.mark.parametrize('platform', ['win32', 'darwin'])
def test_frozen_renderer_stays_inside_native_app_bundle(tmp_path, monkeypatch, platform):
    from asl_harness import mermaid
    monkeypatch.setattr(mermaid.sys, 'platform', platform)
    monkeypatch.setattr(mermaid.sys, 'frozen', True, raising=False)
    root = tmp_path / ('ASL Workspace.app/Contents' if platform == 'darwin' else 'ASL Workspace')
    core = root / ('Resources/core/asl-harness' if platform == 'darwin' else 'resources/core/asl-harness.exe')
    monkeypatch.setattr(mermaid.sys, 'executable', str(core))
    binary = root / ('MacOS/ASL Workspace' if platform == 'darwin' else 'ASL Workspace.exe')
    assert mermaid.renderer_command() == [str(binary.resolve()), '--validate-mermaid']


def test_invalid_mermaid_is_returned_to_agent_before_overwrite(tmp_path):
    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    file = root / 'modes' / mode['id'] / 'MODE.md'
    original = file.read_bytes()
    request = {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
               'skills': mode['roots'], 'document': '# 工作\n\n```mermaid\nflowchart LR\n A -->[\n```'}
    with pytest.raises(HarnessError) as error:
        management.edit(root, request)
    assert error.value.code == 'MERMAID_RENDER_FAILED'
    assert 'MODE.md' in str(error.value)
    assert '重新提交' in str(error.value)
    assert error.value.details[0]['diagram'] == 1
    assert 'Parse error' in str(error.value)
    assert file.read_bytes() == original


def test_all_native_diagrams_are_rendered_before_skill_file_save(tmp_path):
    root = _environment(tmp_path)
    data = management.skill_files(root, 'creator')
    text = data['document'] + '\n```mermaid\nsequenceDiagram\n A->>B: 问题\n B-->>A: 结论\n```\n\n```mermaid\nmindmap\n root((能力))\n  证据\n  输出\n```'
    request = {'operation': 'skill.file.save', 'id': 'creator', 'file': 'SKILL.md',
               'expected': data['fingerprint'], 'document': text}
    management.edit(root, request, check=True)
    assert management.skill_files(root, 'creator')['document'] == data['document']
    management.edit(root, request)
    assert management.skill_files(root, 'creator')['document'] == text


def test_cli_returns_rewrite_feedback_and_accepts_corrected_resubmission(tmp_path, monkeypatch, capsys):
    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    target = root / 'modes' / mode['id'] / 'MODE.md'
    original = target.read_bytes()
    request = {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
               'skills': mode['roots'], 'document': '# 关系\n\n```mermaid\nflowchart LR\n A -->[\n```'}
    monkeypatch.setattr('sys.stdin', io.StringIO(json.dumps(request)))
    assert main(['environment.edit', '--workspace', str(root)]) == 2
    feedback = json.loads(capsys.readouterr().out)
    assert feedback['ok'] is False
    assert feedback['error']['code'] == 'MERMAID_RENDER_FAILED'
    detail = feedback['error']['details'][0]
    assert detail['file'] == str(target) and detail['line'] == 3
    assert detail['diagram'] == 1 and '重新提交' in detail['action']
    assert target.read_bytes() == original
    # Stand-in for the calling Agent consuming feedback and submitting a corrected draft.
    request['document'] = '# 关系\n\n```mermaid\nflowchart LR\n A --> B\n```'
    monkeypatch.setattr('sys.stdin', io.StringIO(json.dumps(request)))
    assert main(['environment.edit', '--workspace', str(root)]) == 0
    accepted = json.loads(capsys.readouterr().out)
    assert accepted['diagrams']['rendered'] == 1
    assert target.read_text(encoding='utf-8') == request['document'] + '\n'


def test_mode_import_rejects_bad_diagram_without_creating_destination(tmp_path):
    root = _environment(tmp_path)
    (root / 'skills/creator/broken.mmd').write_text('sequenceDiagram\nnot-a-valid-statement', encoding='utf-8')
    package = tmp_path / 'incoming.zip'
    export_pack(root, 'creator-studio', package)
    target = tmp_path / 'received'
    with pytest.raises(HarnessError) as error:
        import_pack(package, target)
    assert error.value.code == 'MERMAID_RENDER_FAILED'
    assert 'broken.mmd' in error.value.details[0]['file']
    assert not target.exists()


def test_render_time_edit_never_overwrites_another_agents_new_content(tmp_path, monkeypatch):
    from asl_harness import mermaid
    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    file = root / 'modes' / mode['id'] / 'MODE.md'
    newer = '# 用户刚写的版本\n'
    def concurrent_edit(_):
        file.write_text(newer, encoding='utf-8')
        return {'ok': True, 'rendered': 1, 'errors': []}
    monkeypatch.setattr(mermaid, 'validate_documents', concurrent_edit)
    with pytest.raises(HarnessError) as error:
        management.edit(root, {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
                             'skills': mode['roots'], 'document': '# 较早草稿\n```mermaid\ngraph LR\n A-->B\n```'})
    assert error.value.code == 'EDIT_STALE'
    assert file.read_text(encoding='utf-8') == newer


def test_import_render_rechecks_destination_before_replacing(tmp_path, monkeypatch):
    from asl_harness import mermaid
    root = _environment(tmp_path)
    package = tmp_path / 'incoming.zip'
    export_pack(root, 'creator-studio', package)
    target = tmp_path / 'received'
    import_pack(package, target)
    file = target / 'modes/creator-studio/MODE.md'
    def concurrent_edit(_, **_kwargs):
        file.write_text('# 刚更新的本地工作方式\n', encoding='utf-8')
        return {'ok': True, 'rendered': 0, 'errors': []}
    monkeypatch.setattr(mermaid, 'validate_packages', concurrent_edit)
    with pytest.raises(HarnessError) as error:
        import_pack(package, target, replace=True)
    assert error.value.code == 'PACK_PREVIEW_STALE'
    assert file.read_text(encoding='utf-8') == '# 刚更新的本地工作方式\n'


def test_source_document_has_the_same_render_gate(tmp_path):
    root = _environment(tmp_path)
    skill = next(s for s in management.catalog(root)['skills'] if s['id'] == 'creator')
    source = root / 'skills/creator/SOURCE.md'
    original = source.read_bytes()
    with pytest.raises(HarnessError) as error:
        management.edit(root, {'operation': 'skill.save', 'id': 'creator', 'expected': skill['fingerprint'],
                             'document': (root / 'skills/creator/SKILL.md').read_text(encoding='utf-8'),
                             'sourceDocument': source.read_text(encoding='utf-8') + '\n```mermaid\nflowchart LR\n A -->[\n```'})
    assert error.value.code == 'MERMAID_RENDER_FAILED'
    assert 'SOURCE.md' in error.value.details[0]['file']
    assert source.read_bytes() == original


def test_diagram_limit_does_not_block_unrelated_plain_documents(tmp_path):
    from asl_harness.mermaid import validate_packages
    file = tmp_path / 'notes.md'
    file.write_text('ordinary text\n' * 90000, encoding='utf-8')
    assert validate_packages([tmp_path])['rendered'] == 0
    with file.open('a', encoding='utf-8') as stream:
        stream.write('\n```mermaid\ngraph LR\n A --> B\n```')
    with pytest.raises(HarnessError) as error:
        validate_packages([tmp_path])
    assert error.value.code == 'MERMAID_DOCUMENT_TOO_LARGE'


@pytest.mark.parametrize('exit_code,stdout', [(2147483651, '\n'), (-2147483645, '\n'), (0, '[]')])
def test_renderer_startup_failure_reports_runtime_without_overwriting(tmp_path, monkeypatch, exit_code, stdout):
    from asl_harness import mermaid
    from subprocess import CompletedProcess
    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    file = root / 'modes' / mode['id'] / 'MODE.md'
    original = file.read_bytes()
    view = (root / 'WORKSPACE.md').read_bytes()
    executable = tmp_path / 'ASL Workspace.exe'
    executable.touch()
    monkeypatch.setattr(mermaid, 'renderer_command', lambda: [str(executable), '--validate-mermaid'])
    monkeypatch.setattr(mermaid.subprocess, 'run', lambda *args, **kwargs: CompletedProcess(args[0], exit_code, stdout, ''))
    with pytest.raises(HarnessError) as error:
        management.edit(root, {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
                             'skills': mode['roots'], 'document': '# 关系\n```mermaid\nflowchart LR\n A --> B\n```'})
    assert error.value.code == 'MERMAID_RENDERER_UNAVAILABLE'
    assert '正式安装版' in str(error.value) and 'Expecting value' not in str(error.value)
    detail = error.value.details[0]
    assert detail['executable'] == str(executable)
    assert detail['exitCode'] == exit_code
    assert detail['exitCodeHex'] == f'0x{exit_code & 0xffffffff:08X}'
    assert file.read_bytes() == original
    assert (root / 'WORKSPACE.md').read_bytes() == view
