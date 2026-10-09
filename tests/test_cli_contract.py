import json
from io import StringIO
from pathlib import Path
import tomllib

import pytest

from asl_harness import commands, management
from asl_harness.workspace import MODE_API_VERSION, package_fingerprint
from test_mode_only import _environment


def _json_command(arguments, capsys):
    try:
        code = commands.main(arguments)
    except SystemExit as error:
        code = error.code
    output = capsys.readouterr()
    assert output.out, 'CLI must return a JSON result instead of only argparse stderr'
    return code, json.loads(output.out), output.err


def test_describe_exposes_actual_commands_and_edit_fields_without_a_workspace(capsys):
    code, report, stderr = _json_command(['cli.describe'], capsys)
    assert code == 0 and report['ok'] is True and not stderr
    parser = commands._parser()
    registered = next(action.choices for action in parser._actions if isinstance(action, commands.argparse._SubParsersAction))
    assert {item['name'] for item in report['commands']} == set(registered)
    assert report['protocol'] == MODE_API_VERSION
    project = tomllib.loads((Path(__file__).resolve().parents[1] / 'pyproject.toml').read_text(encoding='utf-8'))
    assert report['version'] == project['project']['version']
    for operation, fields in management.EDIT_FIELDS.items():
        assert report['editOperations'][operation]['fields'] == sorted(fields)
    assert report['createRequest']['fields'] == sorted(management.CREATE_FIELDS)
    assert report['createRequest']['sources']['fields'] == sorted(management.CREATE_SOURCE_FIELDS)
    edit = next(item for item in report['commands'] if item['name'] == 'environment.edit')
    assert next(arg for arg in edit['arguments'] if '--workspace' in arg['flags'])['required'] is True
    assert report['transport']['exitCodes'] == {'0': 'success', '2': 'failure'}
    assert report['writeBoundary']['directFileWritesAreControlled'] is False
    assert report['writeBoundary']['startsModelTasks'] is False


def test_describe_reports_actual_renderer_presence_without_starting_it(capsys):
    code, report, _ = _json_command(['cli.describe'], capsys)
    assert code == 0
    renderer = report['renderer']
    assert renderer['available'] == Path(renderer['executable']).is_file()
    assert renderer['requiredFor'] == 'Mermaid real-render validation'


def test_cli_declares_host_confirmation_for_skill_changes_without_fake_approval_fields(tmp_path, capsys):
    _, report, _ = _json_command(['cli.describe'], capsys)
    policy = report['writeBoundary']['authorization']
    assert policy['defaultOrganizationScope'] == 'Mode organization'
    assert policy['skillContentChanges'] == 'explicit user confirmation in the current Host before execution'
    assert policy['enforcedBy'] == 'current Host, not a caller-supplied approval flag'
    assert 'approved' not in management.EDIT_FIELDS['skill.file.save']
    root = _environment(tmp_path)
    guide = management.editing_guide(root, 'creator-studio')
    assert '先取得用户明确同意' in guide['document']
    assert '默认只整理 Mode' in guide['document']
    assert '你可修改 modes/' not in guide['document']
    assert guide['authorization'] == policy


def test_describe_and_guide_share_the_ordinary_repository_organization_contract(tmp_path, capsys):
    _, report, _ = _json_command(['cli.describe'], capsys)
    organization = report['organization']
    assert organization['entry'] == 'environment.guide'
    root = tmp_path / 'not-created'
    guide = management.editing_guide(root)
    instructions = organization['instructions']
    assert guide['document'].count(instructions) == 1
    assert not root.exists()
    for boundary in ['没有 Mode', '逐层读取', '用户目标', '行业判断', '同名不等于同一版本',
                     '原生依赖', '采用成功不等于已加入图', '两步', '不构造全库事务',
                     '缺少 Git', '实际渲染', '不执行来源', '不启动模型']:
        assert boundary in instructions
    command_names = {item['name'] for item in report['commands']}
    for name in ['skill.scan', 'skill.unpack', 'mode.inspect', 'mode.create', 'environment.edit',
                 'environment.catalog', 'environment.history', 'environment.history.note']:
        assert name in instructions and name in command_names
    assert '先取得用户明确同意' in guide['document']
    assert 'MERMAID_RENDERER_UNAVAILABLE' in instructions


def test_ordinary_repository_route_adopts_then_organizes_without_rewriting_skill(tmp_path, capsys, monkeypatch):
    root = _environment(tmp_path)
    source = tmp_path / 'downloaded' / 'reading'
    source.mkdir(parents=True)
    original = b'---\nname: reading\ndescription: Read source material\n---\n# Reading\n'
    (source / 'SKILL.md').write_bytes(original)
    (source / 'read.py').write_bytes(b'print("read")\n')
    _, scan, _ = _json_command(['skill.scan', '--source', str(source.parent)], capsys)
    assert [item['id'] for item in scan['skills']] == ['reading']

    def edit(request, check=False):
        monkeypatch.setattr(commands.sys, 'stdin', StringIO(json.dumps(request)))
        arguments = ['environment.edit', '--workspace', str(root)] + (['--check'] if check else [])
        return _json_command(arguments, capsys)

    request = {'operation': 'skill.import', 'id': 'reading', 'source': str(source)}
    code, preview, _ = edit(request, True)
    assert code == 0 and not (root / 'skills/reading').exists()
    code, adopted, _ = edit({**request, 'expectedSource': preview['sourceFingerprint']})
    assert code == 0 and adopted['operation'] == 'skill.import'
    assert 'reading' not in management.catalog(root)['modes'][0]['skills']

    request = {'operation': 'mode.save', 'id': 'research', 'skills': ['reading'],
               'document': '# 材料研究\n\n```mermaid\nflowchart LR\n skill_reading[阅读材料]\n```\n',
               'architecture': {'shared': [], 'paradigms': [{'id': 'sources', 'title': '材料研究',
                   'description': '阅读原始材料回答问题', 'skills': ['reading'], 'edges': []}]}}
    code, checked, _ = edit(request, True)
    assert code == 0 and checked['diagrams']['rendered'] == 1
    assert not (root / 'modes/research').exists()
    code, saved, _ = edit(request)
    assert code == 0 and saved['history']['status'] == 'not-repository'
    item = next(mode for mode in saved['catalog']['modes'] if mode['id'] == 'research')
    assert item['skills'] == ['reading']
    assert (root / 'skills/reading/SKILL.md').read_bytes() == original
    assert (root / 'skills/reading/read.py').read_bytes() == (source / 'read.py').read_bytes()
    assert not (source / 'SOURCE.md').exists()

    code, failure, _ = edit({**request, 'expected': item['fingerprint'],
                           'document': '# 不合法的图\n```mermaid\nflowchart LR\n A -->[\n```\n'})
    assert code == 2 and failure['error']['code'] == 'MERMAID_RENDER_FAILED'
    assert failure['error']['details'][0]['file'] == str(root / 'modes/research/MODE.md')
    assert (root / 'modes/research/MODE.md').read_text(encoding='utf-8') == request['document']


@pytest.mark.parametrize('arguments', [[], ['not-a-command'], ['environment.catalog'], ['environment.edit', '--workspace', 'local', '--unknown']])
def test_argument_errors_use_the_existing_json_error_contract(arguments, capsys):
    code, report, stderr = _json_command(arguments, capsys)
    assert code == 2 and report['ok'] is False and not stderr
    assert report['error']['code'] == 'INPUT_INVALID'
    assert report['error']['message']


def test_help_keeps_standard_argparse_behavior(capsys):
    with pytest.raises(SystemExit) as error:
        commands.main(['--help'])
    assert error.value.code == 0
    assert 'usage: asl-harness' in capsys.readouterr().out


def test_mode_files_reads_the_real_package_and_does_not_modify_it(tmp_path, capsys):
    root = _environment(tmp_path)
    package = root / 'modes/creator-studio'
    (package / 'architecture.mmd').write_text('flowchart LR\n A --> B\n', encoding='utf-8')
    (package / 'binary.dat').write_bytes(b'\0binary')
    (package / 'large.txt').write_bytes(b'x' * (1024 * 1024 + 1))
    before = package_fingerprint(package)
    code, report, _ = _json_command(['mode.files', '--workspace', str(root), '--mode', 'creator-studio'], capsys)
    assert code == 0 and report['id'] == 'creator-studio'
    assert report['document'] == (package / 'MODE.md').read_text(encoding='utf-8')
    assert report['fingerprint'] == before
    entries = {entry['path']: entry for entry in report['files']}
    assert entries['mode.yaml']['editable'] is True
    assert entries['binary.dat']['editable'] is False
    assert entries['large.txt']['editable'] is False
    assert package_fingerprint(package) == before
    code, diagram, _ = _json_command(['mode.files', '--workspace', str(root), '--mode', 'creator-studio', '--file', 'architecture.mmd'], capsys)
    assert code == 0 and diagram['document'] == (package / 'architecture.mmd').read_bytes().decode('utf-8')
    assert diagram['skills'] == ['creator']


@pytest.mark.parametrize('file', ['../PROFILE.md', '/etc/passwd', 'C:/Windows/win.ini', '.env', 'missing.md'])
def test_mode_files_cannot_read_outside_the_package_or_an_unknown_file(tmp_path, capsys, file):
    root = _environment(tmp_path)
    code, report, _ = _json_command(['mode.files', '--workspace', str(root), '--mode', 'creator-studio', '--file', file], capsys)
    assert code == 2 and report['error']['code'] == 'EDIT_INVALID'


def test_mode_files_does_not_follow_a_file_link(tmp_path, capsys):
    root = _environment(tmp_path)
    link = root / 'modes/creator-studio/linked.md'
    try:
        link.symlink_to(root / 'PROFILE.md')
    except OSError:
        pytest.skip('symbolic links unavailable on this system')
    code, report, _ = _json_command(['mode.files', '--workspace', str(root), '--mode', 'creator-studio', '--file', 'linked.md'], capsys)
    assert code == 2 and report['error']['code'] == 'EDIT_INVALID'
