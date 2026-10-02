import json
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
