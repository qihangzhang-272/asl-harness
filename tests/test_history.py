import subprocess

import pytest

from asl_harness.workspace import HarnessError
from asl_harness.workspace import package_fingerprint
from test_mode_only import _environment, _skill


def git(root, *args):
    return subprocess.run(['git', '-C', str(root), *args], check=True,
                          capture_output=True).stdout.decode('utf-8').strip()


def repository(tmp_path):
    root = _environment(tmp_path)
    git(root, 'init')
    git(root, 'config', 'user.name', 'ASL test')
    git(root, 'config', 'user.email', 'test@example.invalid')
    git(root, 'add', '.')
    git(root, 'commit', '-m', '初始内容')
    return root


def test_history_is_read_only_and_does_not_adopt_parent_repository(tmp_path):
    from asl_harness.history import history
    root = _environment(tmp_path)
    assert history(root)['status'] == 'not-repository'
    assert not (root / '.git').exists()
    git(tmp_path, 'init')
    assert history(root)['status'] == 'not-repository'
    root = repository(tmp_path / 'tracked')
    result = history(root)
    assert result['entries'][0]['title'] == '初始内容'
    assert result['entries'][0]['source'] == 'commit'
    assert result['entries'][0]['revision'] == git(root, 'rev-parse', 'HEAD')
    assert result['nextOffset'] is None


def test_mode_snapshots_leave_branch_index_and_other_files_untouched(tmp_path):
    from asl_harness.history import history, record_mode
    root = repository(tmp_path)
    git(root, 'config', 'commit.gpgsign', 'true')
    git(root, 'config', 'gpg.program', 'must-not-start-signing-tool')
    head = git(root, 'rev-parse', 'HEAD')
    (root / 'PROFILE.md').write_text('# 用户已暂存的偏好', encoding='utf-8')
    git(root, 'add', 'PROFILE.md')
    index = (root / '.git/index').read_bytes()
    first = record_mode(root, 'creator-studio', title='保存前版本')
    assert first['status'] == 'recorded'
    assert record_mode(root, 'creator-studio')['status'] == 'unchanged'
    document = root / 'modes/creator-studio/MODE.md'
    document.write_text('# 更新后的模式', encoding='utf-8')
    second = record_mode(root, 'creator-studio')
    assert git(root, 'rev-parse', second['revision'] + '^') == first['revision']
    assert git(root, 'ls-tree', '-r', '--name-only', second['revision']).splitlines() == [
        'modes/creator-studio/MODE.md', 'modes/creator-studio/mode.yaml']
    assert git(root, 'rev-parse', 'HEAD') == head
    assert (root / '.git/index').read_bytes() == index
    result = history(root, mode='creator-studio')
    assert result['entries'][0]['revision'] == second['revision']
    assert result['entries'][0]['source'] == 'save'
    assert '更新模式结构' in result['entries'][0]['title']
    assert history(root, mode='creator-studio', limit=1)['nextOffset'] == 1


def test_history_only_opens_selected_safe_file_and_never_runs_diff_driver(tmp_path):
    from asl_harness.history import history
    root = repository(tmp_path)
    original = git(root, 'rev-parse', 'HEAD')
    file = 'modes/creator-studio/MODE.md'
    (root / file).write_text('# 最新模式', encoding='utf-8')
    (root / '.env').write_text('PRIVATE_SENTINEL=do-not-return', encoding='utf-8')
    git(root, 'add', file, '.env')
    git(root, 'commit', '-m', '第二个版本')
    revision = git(root, 'rev-parse', 'HEAD')
    detail = history(root, revision=revision)
    assert detail['revision'] == revision
    assert detail['files'] == [file]
    assert 'diff' not in detail
    git(root, 'config', 'diff.external', 'this-command-must-not-run')
    detail = history(root, revision=revision, file=file)
    assert detail['parent'] == original
    assert '+# 最新模式' in detail['diff']
    assert 'PRIVATE_SENTINEL' not in str(detail)
    for invalid in ('../PROFILE.md', '.env', 'modes/x/.env', ':/outside', file + ':other'):
        with pytest.raises(HarnessError):
            history(root, revision=revision, file=invalid)
    for invalid in ('HEAD', '--all', 'HEAD~1', revision + ':PROFILE.md'):
        with pytest.raises(HarnessError):
            history(root, revision=invalid)


def test_explicit_notes_use_native_git_without_changing_the_record(tmp_path):
    from asl_harness.history import annotate, history, record_mode
    root = repository(tmp_path)
    revision = record_mode(root, 'creator-studio')['revision']
    main_head = git(root, 'rev-parse', 'HEAD')
    index = (root / '.git/index').read_bytes()
    assert history(root, revision=revision)['note'] is None
    note = annotate(root, revision, '用户要求：保留简单分支。\n决定：删去重复连线。')
    assert git(root, 'notes', '--ref=refs/notes/asl', 'show', revision) == note['document'].strip()
    assert history(root, revision=revision)['note'] == note
    with pytest.raises(HarnessError) as failure:
        annotate(root, revision, '过期覆盖', expected='old')
    assert failure.value.code == 'HISTORY_STALE'
    replacement = annotate(root, revision, '补充：用户确认后调整。', expected=note['fingerprint'])
    assert history(root, revision=revision)['note'] == replacement
    assert git(root, 'rev-parse', 'HEAD') == main_head
    assert (root / '.git/index').read_bytes() == index
    assert git(root, 'rev-parse', 'refs/asl/modes/creator-studio') == revision
    assert '补充版本说明' in git(root, 'show', '-s', '--format=%s', 'refs/notes/asl')


def test_restore_previews_and_revalidates_mode_structure_without_touching_skills(tmp_path):
    from asl_harness.history import history, record_mode, restore_mode
    root = repository(tmp_path)
    mode = root / 'modes/creator-studio'
    with (mode / 'MODE.md').open('a', encoding='utf-8') as stream:
        stream.write('\n```mermaid\nflowchart LR\n A[技能] --> B[完成]\n```\n')
    original = record_mode(root, 'creator-studio')['revision']
    document = mode / 'MODE.md'
    document.write_text('# 新安排\n', encoding='utf-8')
    current = record_mode(root, 'creator-studio')['revision']
    expected = package_fingerprint(mode)
    skills = {path: path.read_bytes() for path in (root / 'skills').rglob('*') if path.is_file()}
    detail = history(root, mode='creator-studio', revision=original)
    assert '# creator-studio' in detail['snapshot']['document']
    preview = restore_mode(root, 'creator-studio', original, expected=expected, check=True)
    assert preview['revision'] == original
    assert document.read_text(encoding='utf-8') == '# 新安排\n'
    with pytest.raises(HarnessError) as failure:
        restore_mode(root, 'creator-studio', original, expected='old')
    assert failure.value.code == 'EDIT_STALE'
    result = restore_mode(root, 'creator-studio', original, expected=expected)
    assert result['diagrams']['rendered'] == 1
    assert '# creator-studio' in document.read_text(encoding='utf-8')
    assert result['history']['revision'] not in {original, current}
    assert git(root, 'rev-parse', result['history']['revision'] + '^') == current
    assert all(path.read_bytes() == data for path, data in skills.items())


def test_history_empty_no_identity_large_and_sensitive_files_are_honest(tmp_path):
    from asl_harness.history import history, record_mode
    root = _environment(tmp_path / 'empty')
    git(root, 'init')
    assert history(root)['status'] == 'empty'
    git(root, 'config', 'user.name', '')
    git(root, 'config', 'user.email', '')
    with pytest.raises(HarnessError) as failure:
        record_mode(root, 'creator-studio')
    assert failure.value.code == 'HISTORY_IDENTITY'
    assert not git(root, 'for-each-ref', 'refs/asl/modes/')
    root = repository(tmp_path / 'bounded')
    file = 'modes/creator-studio/MODE.md'
    (root / file).write_text('x' * (128 * 1024 + 1), encoding='utf-8')
    git(root, 'add', file)
    git(root, 'commit', '-m', '大文件')
    revision = git(root, 'rev-parse', 'HEAD')
    with pytest.raises(HarnessError) as failure:
        history(root, revision=revision, file=file)
    assert failure.value.code == 'HISTORY_LIMIT'
    (root / file).write_text('api_key = "PRIVATE_SENTINEL"', encoding='utf-8')
    git(root, 'add', file)
    git(root, 'commit', '-m', '敏感文件')
    revision = git(root, 'rev-parse', 'HEAD')
    # Both sides are checked before returning any diff. Use an initial-safe file to isolate the secret check.
    safe = 'feedback/note.md'
    (root / safe).write_text('api_key = "PRIVATE_SENTINEL"', encoding='utf-8')
    git(root, 'add', safe)
    git(root, 'commit', '-m', '明确记录')
    with pytest.raises(HarnessError) as failure:
        history(root, revision=git(root, 'rev-parse', 'HEAD'), file=safe)
    assert failure.value.code == 'HISTORY_PRIVATE'
    assert 'PRIVATE_SENTINEL' not in str(failure.value)


def test_snapshot_cannot_be_read_as_another_mode_and_git_env_cannot_redirect(tmp_path, monkeypatch):
    from asl_harness.history import history, record_mode
    root = repository(tmp_path / 'one')
    other = repository(tmp_path / 'two')
    revision = record_mode(root, 'creator-studio')['revision']
    monkeypatch.setenv('GIT_DIR', str(other / '.git'))
    monkeypatch.setenv('GIT_WORK_TREE', str(other))
    assert history(root, mode='creator-studio', revision=revision)['snapshot']['skills'] == ['creator']
    with pytest.raises(HarnessError):
        history(other, revision=revision)
    with pytest.raises(HarnessError):
        history(root, mode='different', revision=revision)
    for values in ({'limit': 51}, {'offset': -1}, {'limit': True}, {'file': 'PROFILE.md'}):
        with pytest.raises(HarnessError):
            history(root, **values)


def test_mode_save_records_before_after_and_cli_exposes_history_and_notes(tmp_path, capsys, monkeypatch):
    import io
    import json
    from asl_harness.commands import main
    from asl_harness.management import edit
    root = repository(tmp_path)
    mode = root / 'modes/creator-studio'
    result = edit(root, {'operation': 'mode.save', 'id': 'creator-studio',
                         'expected': package_fingerprint(mode), 'document': '# 重新组织\n', 'skills': ['creator']})
    revision = result['history']['revision']
    assert result['history']['status'] == 'recorded'
    assert main(['environment.history', '--workspace', str(root), '--mode', 'creator-studio']) == 0
    entries = json.loads(capsys.readouterr().out)['entries']
    assert [item['source'] for item in entries].count('save') == 2
    monkeypatch.setattr('sys.stdin', io.StringIO(json.dumps({'document': '简化重复分支。'})))
    assert main(['environment.history.note', '--workspace', str(root), '--revision', revision]) == 0
    assert json.loads(capsys.readouterr().out)['document'] == '简化重复分支。\n'
    previous = git(root, 'rev-parse', revision + '^')
    assert main(['mode.history.restore', '--workspace', str(root), '--mode', 'creator-studio',
                 '--revision', previous, '--expected', package_fingerprint(mode), '--check']) == 0
    assert json.loads(capsys.readouterr().out)['check'] is True
    git(root, 'config', 'user.name', '')
    git(root, 'config', 'user.email', '')
    result = edit(root, {'operation': 'mode.save', 'id': 'creator-studio',
                         'expected': package_fingerprint(mode), 'document': '# 保存内容不假装记录成功\n', 'skills': ['creator']})
    assert result['history']['status'] == 'unavailable'
    assert (mode / 'MODE.md').read_text(encoding='utf-8').startswith('# 保存内容不假装记录成功')


def test_concurrent_history_writer_is_not_overwritten(tmp_path, monkeypatch):
    from asl_harness.history import record_mode
    root = repository(tmp_path)
    first = record_mode(root, 'creator-studio')['revision']
    concurrent = git(root, 'commit-tree', first + '^{tree}', '-p', first, '-m', '并行保存')
    ref = 'refs/asl/modes/creator-studio'
    (root / 'modes/creator-studio/MODE.md').write_text('# 新版本', encoding='utf-8')
    original = subprocess.Popen
    raced = False
    def process(command, *args, **kwargs):
        nonlocal raced
        if not raced and 'update-ref' in command and ref in command:
            raced = True
            git(root, 'update-ref', ref, concurrent, first)
        return original(command, *args, **kwargs)
    monkeypatch.setattr(subprocess, 'Popen', process)
    with pytest.raises(HarnessError):
        record_mode(root, 'creator-studio')
    assert git(root, 'rev-parse', ref) == concurrent


def test_import_binding_records_only_changed_mode_structure(tmp_path):
    from asl_harness.management import edit
    root = repository(tmp_path)
    _skill(tmp_path / 'outside', 'research')
    result = edit(root, {'operation': 'skill.import', 'id': 'research',
                         'source': str(tmp_path / 'outside/skills/research'), 'mode': 'creator-studio'})
    revision = result['history']['revision']
    assert result['history']['status'] == 'recorded'
    assert git(root, 'ls-tree', '-r', '--name-only', revision).splitlines() == [
        'modes/creator-studio/MODE.md', 'modes/creator-studio/mode.yaml']
    assert 'research' in git(root, 'show', revision + ':modes/creator-studio/mode.yaml')
    assert 'research' not in git(root, 'show', revision + '^:modes/creator-studio/mode.yaml')


def test_history_restore_bad_mermaid_does_not_change_files_or_refs(tmp_path):
    from asl_harness.history import restore_mode
    root = repository(tmp_path)
    file = root / 'modes/creator-studio/MODE.md'
    file.write_text('# 坏图\n```mermaid\nflowchart LR\n A -->[\n```', encoding='utf-8')
    git(root, 'add', 'modes/creator-studio/MODE.md')
    git(root, 'commit', '-m', '旧版坏图')
    revision = git(root, 'rev-parse', 'HEAD')
    file.write_text('# 当前有效内容\n', encoding='utf-8')
    before = {path: path.read_bytes() for path in root.rglob('*') if path.is_file() and '.git' not in path.parts}
    refs = git(root, 'for-each-ref')
    with pytest.raises(HarnessError) as failure:
        restore_mode(root, 'creator-studio', revision, expected=package_fingerprint(file.parent))
    assert failure.value.code == 'MERMAID_RENDER_FAILED'
    assert all(path.read_bytes() == data for path, data in before.items())
    assert git(root, 'for-each-ref') == refs
