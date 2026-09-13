import json
import tomllib

import pytest

from asl_harness.native_mcp import inspect_mcp, edit_mcp, MASK
from asl_harness.workspace import HarnessError


def write(file, text):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(text, encoding='utf-8')


def source(report, scope):
    return next(s for s in report['sources'] if s['scope'] == scope)


def test_codex_preserves_comments_other_settings_and_masked_credentials(tmp_path):
    file = tmp_path / '.codex/config.toml'
    original = '# my model\nmodel = "keep" # stay\n[mcp_servers."test.server"]\ncommand="old"\n[mcp_servers."test.server".env]\nKEY="private-value"\n[mcp_servers.other]\nurl="https://example.org/mcp"\n'
    write(file, original)
    report = inspect_mcp('codex-app', home=tmp_path, env={})
    assert 'private-value' not in json.dumps(report)
    src = source(report, 'user')
    definition = src['servers'][0]['definition']
    definition['command'] = 'new'
    result = edit_mcp('codex-app', 'user', {'name':'test.server', 'definition':definition,
        'expected':src['fingerprint']}, home=tmp_path, env={})
    text = file.read_text(encoding='utf-8')
    assert '# my model\nmodel = "keep" # stay' in text
    assert tomllib.loads(text)['mcp_servers']['test.server']['env']['KEY'] == 'private-value'
    assert tomllib.loads(text)['mcp_servers']['other']['url'] == 'https://example.org/mcp'
    assert result['backup']
    assert 'private-value' not in json.dumps(result)


def test_claude_user_project_and_private_project_are_separate(tmp_path):
    project = tmp_path / 'project'
    project.mkdir()
    file = tmp_path / '.claude.json'
    write(file, json.dumps({'account':'keep', 'mcpServers':{'user':{'command':'u'}},
         'projects':{project.as_posix():{'mcpServers':{'local':{'command':'l'}}, 'other':True}}}))
    write(project / '.mcp.json', json.dumps({'mcpServers':{'shared':{'type':'http','url':'https://example.org'}}}))
    report = inspect_mcp('claude-code', project=project, home=tmp_path, env={})
    assert {s['scope']: [r['name'] for r in s['servers']] for s in report['sources']} == {
        'user':['user'], 'project':['shared'], 'local':['local']}
    local = source(report, 'local')
    edit_mcp('claude-code', 'local', {'name':'local', 'definition':{'command':'changed'},
        'expected':local['fingerprint']}, project=project, home=tmp_path, env={})
    data = json.loads(file.read_text(encoding='utf-8'))
    assert data['account'] == 'keep'
    assert data['mcpServers']['user']['command'] == 'u'
    assert data['projects'][project.as_posix()]['other'] is True
    assert len(data['projects']) == 1


def test_invalid_or_stale_config_never_overwrites(tmp_path):
    file = tmp_path / '.codex/config.toml'
    write(file, 'model="keep"\n')
    src = source(inspect_mcp('codex-app', home=tmp_path, env={}), 'user')
    write(file, 'model="changed-elsewhere"\n')
    with pytest.raises(HarnessError, match='已变化'):
        edit_mcp('codex-app', 'user', {'name':'new','definition':{'command':'node'},
            'expected':src['fingerprint']}, home=tmp_path, env={})
    write(file, 'model = "unclosed')
    report = inspect_mcp('codex-app', home=tmp_path, env={})
    assert source(report, 'user')['error']
    assert file.read_text(encoding='utf-8') == 'model = "unclosed'


def test_claude_toggle_is_per_project_and_preserves_approval_lists(tmp_path):
    project = tmp_path / 'project'
    project.mkdir()
    file = tmp_path / '.claude.json'
    write(file, json.dumps({'mcpServers':{'one':{'command':'node'}},
        'projects':{project.as_posix():{'enabledMcpjsonServers':['keep']}}}))
    src = source(inspect_mcp('claude-code', project=project, home=tmp_path, env={}), 'user')
    edit_mcp('claude-code', 'user', {'operation':'toggle','name':'one','enabled':False,
        'expected':src['toggleFingerprint']}, project=project, home=tmp_path, env={})
    data = json.loads(file.read_text(encoding='utf-8'))['projects'][project.as_posix()]
    assert data['disabledMcpServers'] == ['one']
    assert data['enabledMcpjsonServers'] == ['keep']


def test_invalid_definition_and_new_secret_placeholder_are_rejected(tmp_path):
    src = source(inspect_mcp('codex-app', home=tmp_path, env={}), 'user')
    for definition in ({'command':'x', 'url':'https://example.org'}, {'command':'x','env':{'KEY':MASK}}):
        with pytest.raises(HarnessError):
            edit_mcp('codex-app', 'user', {'name':'new','definition':definition,
                'expected':src['fingerprint']}, home=tmp_path, env={})
    assert not (tmp_path / '.codex/config.toml').exists()


def test_machine_discovery_reads_registered_projects_without_walking_disk(tmp_path):
    from asl_harness.native_mcp import discover_mcp
    project, hidden = tmp_path / 'known', tmp_path / 'unregistered'
    project.mkdir(); hidden.mkdir()
    write(tmp_path / '.claude.json', json.dumps({'projects': {str(project): {}},
        'mcpServers': {'global': {'command': 'node', 'env': {'KEY': 'private'}}}}))
    write(project / '.mcp.json', '{"mcpServers":{"local":{"command":"node"}}}')
    write(hidden / '.mcp.json', '{"mcpServers":{"hidden":{"command":"node"}}}')
    report = discover_mcp([str(project), str(tmp_path / 'gone')], home=tmp_path, env={})
    assert report['projects'] == [str(project)]
    assert {server['name'] for row in report['sources'] for server in row['servers']} == {'global', 'local'}
    assert 'private' not in json.dumps(report)
    assert any(row['project'] == str(project) and row['scope'] == 'project' for row in report['sources'])


def test_malformed_entries_and_duplicate_keys_cannot_be_edited(tmp_path):
    file = tmp_path / '.claude.json'
    write(file, '{"mcpServers":{},"mcpServers":{"lost":{"command":"node"}}}')
    assert source(inspect_mcp('claude-code', home=tmp_path, env={}), 'user')['error']
    for definition in ({'type':'http', 'command':'node'}, {'command':'node', 'args':'bad'},
                       {'url':'https://'}, {'command':'node', 'enabled':'false'}):
        src = source(inspect_mcp('codex-app', home=tmp_path, env={}), 'user')
        with pytest.raises(HarnessError):
            edit_mcp('codex-app', 'user', {'name':'new','definition':definition,
                'expected':src['fingerprint']}, home=tmp_path, env={})


def test_codex_toggle_remove_and_missing_claude_toggle(tmp_path):
    file = tmp_path / '.codex/config.toml'
    write(file, '[mcp_servers.one]\ncommand="node"\n')
    for operation in ('toggle', 'remove'):
        src = source(inspect_mcp('codex-app', home=tmp_path, env={}), 'user')
        edit_mcp('codex-app', 'user', {'operation':operation,'name':'one','enabled':False,
            'expected':src['fingerprint']}, home=tmp_path, env={})
    assert not source(inspect_mcp('codex-app', home=tmp_path, env={}), 'user')['servers']
    project = tmp_path / 'project'; project.mkdir()
    src = source(inspect_mcp('claude-code', project=project, home=tmp_path, env={}), 'user')
    with pytest.raises(HarnessError, match='不存在'):
        edit_mcp('claude-code', 'user', {'operation':'toggle','name':'missing','enabled':False,
            'expected':src['toggleFingerprint']}, project=project, home=tmp_path, env={})


def test_invalid_disable_list_does_not_crash_and_symlink_is_not_replaced(tmp_path):
    write(tmp_path / '.claude.json', json.dumps({'projects':{str(tmp_path):{'disabledMcpServers':None}}}))
    report = inspect_mcp('claude-code', project=tmp_path, home=tmp_path, env={})
    assert not source(report, 'user')['canToggle']
    target = tmp_path / 'original.toml'
    write(target, '[mcp_servers.one]\ncommand="node"\n')
    link = tmp_path / '.codex/config.toml'
    link.parent.mkdir()
    try:
        link.symlink_to(target)
    except OSError:
        pytest.skip('symbolic link privilege unavailable')
    src = source(inspect_mcp('codex-app', home=tmp_path, env={}), 'user')
    with pytest.raises(HarnessError, match='符号链接'):
        edit_mcp('codex-app', 'user', {'operation':'remove','name':'one','expected':src['fingerprint']}, home=tmp_path, env={})
    assert link.is_symlink() and 'command="node"' in target.read_text(encoding='utf-8')
