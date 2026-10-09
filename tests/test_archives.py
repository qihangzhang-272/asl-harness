import json
from pathlib import Path

import pytest

from asl_harness.commands import main
from asl_harness.management import edit
from asl_harness.workspace import HarnessError, package_fingerprint
from test_mode_only import _environment, _mode, _skill


def _archived(root, kind):
    if kind == 'feedback':
        file = root / 'feedback/note.md'
        file.write_bytes('# 一次记录\r\n原样保留。\r\n'.encode())
        from asl_harness.environment_documents import documents
        report = edit(root, {'operation': 'environment.file.archive', 'file': 'feedback/note.md',
                             'expected': documents(root, 'feedback/note.md')['fingerprint']})
        return Path(report['archivePath']).parent.name, 'feedback/note.md'
    identifier = 'extra'
    if kind == 'mode':
        _mode(root, identifier, ('creator',))
    else:
        _skill(root, identifier)
    path = root / f'{kind}s/{identifier}'
    (path / 'nested').mkdir()
    (path / 'nested/data.bin').write_bytes(b'\x00\xff\xfe')
    report = edit(root, {'operation': f'{kind}.archive', 'id': identifier,
                         'expected': package_fingerprint(path)})
    return Path(report['archivePath']).name, f'{kind}s/{identifier}'


@pytest.mark.parametrize('kind', ['mode', 'skill', 'feedback'])
def test_archive_cli_preview_restore_keeps_original_bytes(tmp_path, capsys, kind):
    root = _environment(tmp_path)
    entry, destination = _archived(root, kind)
    source = root / 'archive' / entry
    original = {p.relative_to(source): p.read_bytes() for p in source.rglob('*') if p.is_file()}
    assert main(['environment.archive', '--workspace', str(root)]) == 0
    item = json.loads(capsys.readouterr().out)['entries'][0]
    assert item['entry'] == entry and item['kind'] == kind and item['target'] == destination
    assert item['restorable'] and item['cleanupAllowed']
    request = {'operation': 'archive.restore', 'entry': entry, 'expected': item['fingerprint']}
    edit(root, request, check=True)
    assert source.exists() and not (root / destination).exists()
    edit(root, request)
    target = root / destination
    if kind == 'feedback':
        assert target.read_bytes() == next(iter(original.values()))
    else:
        assert all((target / file).read_bytes() == raw for file, raw in original.items())
    assert not source.exists()


def test_restore_conflict_and_stale_archive_keep_all_content(tmp_path):
    from asl_harness.archives import archives
    root = _environment(tmp_path)
    entry, destination = _archived(root, 'mode')
    request = {'operation': 'archive.restore', 'entry': entry,
               'expected': archives(root)['entries'][0]['fingerprint']}
    _mode(root, 'extra', ('foundation',))
    with pytest.raises(HarnessError) as error:
        edit(root, request)
    assert error.value.code == 'ARCHIVE_CONFLICT'
    assert (root / destination / 'MODE.md').is_file()
    assert (root / 'archive' / entry).is_dir()
    entry, _ = _archived(root, 'feedback')
    item = next(x for x in archives(root)['entries'] if x['entry'] == entry)
    (root / 'archive' / entry / 'note.md').write_text('# 外部修改', encoding='utf-8')
    with pytest.raises(HarnessError) as error:
        edit(root, {'operation': 'archive.restore', 'entry': entry, 'expected': item['fingerprint']})
    assert error.value.code == 'EDIT_STALE'


def test_unknown_archive_is_readable_but_never_restored_or_cleaned(tmp_path):
    from asl_harness.archives import archives, cleanup_preview
    root = _environment(tmp_path)
    source = root / 'archive/old-notes'
    source.mkdir()
    (source / 'note.md').write_text('# 历史资料', encoding='utf-8')
    item = archives(root)['entries'][0]
    assert item['kind'] == 'unknown' and not item['restorable'] and not item['cleanupAllowed']
    assert archives(root, 'old-notes', 'note.md')['document'] == '# 历史资料'
    for operation in (lambda: cleanup_preview(root, 'old-notes'),
                      lambda: edit(root, {'operation': 'archive.restore', 'entry': 'old-notes', 'expected': item['fingerprint']})):
        with pytest.raises(HarnessError) as error:
            operation()
        assert error.value.code == 'ARCHIVE_UNKNOWN'
    assert source.exists()


def test_cleanup_only_returns_exact_fingerprinted_path_and_rejects_stale(tmp_path):
    from asl_harness.archives import cleanup_preview
    root = _environment(tmp_path)
    entry, _ = _archived(root, 'skill')
    result = cleanup_preview(root, entry)
    assert result['archivePath'] == str(root / 'archive' / entry)
    assert result['size'] > 0
    assert cleanup_preview(root, entry, expected=result['fingerprint']) == result
    (root / 'archive' / entry / 'new.md').write_text('new', encoding='utf-8')
    with pytest.raises(HarnessError) as error:
        cleanup_preview(root, entry, expected=result['fingerprint'])
    assert error.value.code == 'EDIT_STALE'
    assert (root / 'archive' / entry).exists()


@pytest.mark.parametrize('entry', ['../skills', '.', 'a/b', 'a\\b', 'a:stream', 'NUL'])
def test_archive_rejects_untrusted_entry_paths(tmp_path, entry):
    from asl_harness.archives import archives
    root = _environment(tmp_path)
    with pytest.raises(HarnessError):
        archives(root, entry)


def test_restore_invalid_diagram_and_changed_during_validation_never_apply(tmp_path, monkeypatch):
    from asl_harness.archives import archives
    from asl_harness import mermaid
    root = _environment(tmp_path)
    entry, destination = _archived(root, 'mode')
    source = root / 'archive' / entry
    def reject(*_args, **_kwargs):
        raise HarnessError('MERMAID_RENDER_FAILED', 'bad diagram')
    monkeypatch.setattr(mermaid, 'validate_packages', reject)
    request = {'operation': 'archive.restore', 'entry': entry,
               'expected': archives(root)['entries'][0]['fingerprint']}
    with pytest.raises(HarnessError) as error:
        edit(root, request)
    assert error.value.code == 'MERMAID_RENDER_FAILED'
    assert source.exists() and not (root / destination).exists()
    def change(*_args, **_kwargs):
        (source / 'MODE.md').write_text('# 外部修改', encoding='utf-8')
        return {'rendered': 0}
    monkeypatch.setattr(mermaid, 'validate_packages', change)
    with pytest.raises(HarnessError) as error:
        edit(root, request)
    assert error.value.code == 'EDIT_STALE'
    assert source.exists() and not (root / destination).exists()


def test_archive_binary_empty_and_unknown_files_are_read_only(tmp_path):
    from asl_harness.archives import archives
    root = _environment(tmp_path)
    entry, _ = _archived(root, 'skill')
    assert archives(root, entry, 'nested/data.bin')['document'] is None
    (root / 'archive/empty').mkdir()
    assert archives(root, 'empty')['file'] is None
    (root / 'archive/old.md').write_text('# 旧记录', encoding='utf-8')
    assert archives(root, 'old.md')['document'] == '# 旧记录'
    with pytest.raises(HarnessError):
        archives(root, entry, '../../PROFILE.md')


def test_archive_secret_and_shared_files_are_isolated_and_cannot_restore(tmp_path):
    import os
    from asl_harness.archives import archives, cleanup_preview
    root = _environment(tmp_path)
    entry, _ = _archived(root, 'skill')
    source = root / 'archive' / entry
    (source / '.env').write_text('PRIVATE=not-real', encoding='utf-8')
    assert archives(root)['issues'][0]['code'] == 'SECRET_FILE_PRESENT'
    with pytest.raises(HarnessError):
        cleanup_preview(root, entry)
    other = root / 'archive/linked'
    other.mkdir()
    external = tmp_path / 'external.md'
    external.write_text('external', encoding='utf-8')
    os.link(external, other / 'shared.md')
    assert any(issue['code'] == 'EDIT_LINKED' for issue in archives(root)['issues'])
    with pytest.raises(HarnessError):
        archives(root, 'linked')


def test_archive_junction_cannot_escape_or_be_cleaned(tmp_path):
    import os
    import subprocess
    from asl_harness.archives import archives, cleanup_preview
    root = _environment(tmp_path)
    outside = tmp_path / 'outside'
    outside.mkdir()
    (outside / 'private.md').write_text('external', encoding='utf-8')
    link = root / 'archive/linked'
    if os.name == 'nt':
        result = subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(outside)], capture_output=True)
        assert result.returncode == 0, result.stderr
    else:
        link.symlink_to(outside, target_is_directory=True)
    with pytest.raises(HarnessError):
        archives(root, 'linked')
    with pytest.raises(HarnessError):
        cleanup_preview(root, 'linked')
    assert (outside / 'private.md').read_text(encoding='utf-8') == 'external'


def test_archive_limit_refuses_large_file_and_too_many_items(tmp_path):
    from asl_harness.archives import archives
    root = _environment(tmp_path)
    entry, _ = _archived(root, 'skill')
    with (root / 'archive' / entry / 'large.bin').open('wb') as stream:
        stream.truncate(65 * 1024 * 1024)
    assert archives(root)['issues'][0]['code'] == 'ARCHIVE_LIMIT'
    large = root / 'archive/many'
    large.mkdir()
    for index in range(5001):
        (large / str(index)).mkdir()
    with pytest.raises(HarnessError) as failure:
        archives(root, 'many')
    assert failure.value.code == 'ARCHIVE_LIMIT'


def test_archive_missing_dependency_and_view_failure_roll_back(tmp_path):
    from asl_harness.archives import archives
    from asl_harness.workspace import VIEW_START
    root = _environment(tmp_path)
    entry, target = _archived(root, 'mode')
    mode = root / 'archive' / entry / 'mode.yaml'
    mode.write_text(mode.read_text(encoding='utf-8').replace('- creator', '- missing'), encoding='utf-8')
    request = {'operation': 'archive.restore', 'entry': entry, 'expected': archives(root)['entries'][0]['fingerprint']}
    with pytest.raises(HarnessError):
        edit(root, request)
    assert not (root / target).exists()
    mode.write_text(mode.read_text(encoding='utf-8').replace('- missing', '- creator'), encoding='utf-8')
    request['expected'] = archives(root)['entries'][0]['fingerprint']
    (root / 'WORKSPACE.md').write_text('# Bad view\n' + VIEW_START, encoding='utf-8')
    with pytest.raises(HarnessError) as failure:
        edit(root, request)
    assert failure.value.code == 'WORKSPACE_VIEW_COLLISION'
    assert not (root / target).exists()
    assert mode.exists()


def test_archive_identity_does_not_guess_from_name_only(tmp_path):
    from asl_harness.archives import archives
    root = _environment(tmp_path)
    entry, _ = _archived(root, 'mode')
    mode = root / 'archive' / entry / 'mode.yaml'
    mode.write_text(mode.read_text(encoding='utf-8').replace('id: extra', 'id: unexpected'), encoding='utf-8')
    assert archives(root)['entries'][0]['kind'] == 'unknown'
    entry, _ = _archived(root, 'feedback')
    (root / 'archive' / entry / 'unknown-material').mkdir()
    assert next(item for item in archives(root)['entries'] if item['entry'] == entry)['kind'] == 'unknown'


def test_archive_real_mermaid_failure_preserves_existing_content(tmp_path):
    from asl_harness.archives import archives
    root = _environment(tmp_path)
    entry, target = _archived(root, 'mode')
    source = root / 'archive' / entry
    (source / 'MODE.md').write_text('# 图\n```mermaid\nflowchart LR\n A -->[\n```', encoding='utf-8')
    with pytest.raises(HarnessError) as failure:
        edit(root, {'operation': 'archive.restore', 'entry': entry,
                    'expected': archives(root)['entries'][0]['fingerprint']})
    assert failure.value.code == 'MERMAID_RENDER_FAILED'
    assert source.exists() and not (root / target).exists()


def test_restore_feedback_rejects_oversized_text(tmp_path):
    from asl_harness.archives import archives
    root = _environment(tmp_path)
    entry, target = _archived(root, 'feedback')
    source = root / 'archive' / entry
    (source / 'note.md').write_bytes(b'a' * (1024 * 1024 + 1))
    with pytest.raises(HarnessError) as failure:
        edit(root, {'operation': 'archive.restore', 'entry': entry,
                    'expected': archives(root)['entries'][0]['fingerprint']})
    assert failure.value.code == 'EDIT_INVALID'
    assert source.exists() and not (root / target).exists()


def test_archive_does_not_parse_large_identity_documents(tmp_path):
    from asl_harness.archives import archives
    root = _environment(tmp_path)
    entry, _ = _archived(root, 'skill')
    file = root / 'archive' / entry / 'SKILL.md'
    file.write_bytes(file.read_bytes() + b'\n' + b'a' * (1024 * 1024))
    assert archives(root)['entries'][0]['kind'] == 'unknown'


@pytest.mark.parametrize('broken', ['metadata-only', 'missing-mode', 'api-version', 'kind', 'spec', 'skill-source', 'skill-description'])
def test_malformed_archive_cannot_gain_restore_or_cleanup_actions(tmp_path, broken):
    from asl_harness.archives import archives, cleanup_preview
    root = _environment(tmp_path)
    kind = 'skill' if broken.startswith('skill-') else 'mode'
    entry = f'{kind}-extra-20261008T120000-abc123'
    source = root / 'archive' / entry
    source.mkdir()
    if kind == 'mode':
        document = 'apiVersion: asl-wep/v0.3.0\nkind: ModeProjection\nmetadata:\n  id: extra\nspec:\n  skills: [creator]\n'
        document = {'metadata-only': 'metadata:\n  id: extra\n',
                    'api-version': document.replace('asl-wep/v0.3.0', 'unexpected'),
                    'kind': document.replace('ModeProjection', 'unexpected'),
                    'spec': document.replace('skills: [creator]', 'skills: []')}.get(broken, document)
        (source / 'mode.yaml').write_text(document, encoding='utf-8')
        if broken != 'missing-mode':
            (source / 'MODE.md').write_text('# 旧模式', encoding='utf-8')
    else:
        description = 'description: 完整技能\n' if broken == 'skill-source' else ''
        (source / 'SKILL.md').write_text(f'---\nname: extra\n{description}---\n# 旧技能', encoding='utf-8')
        if broken != 'skill-source':
            (source / 'SOURCE.md').write_text('# Source\n- Origin: local://test', encoding='utf-8')
    item = archives(root)['entries'][0]
    assert item['kind'] == 'unknown' and not item['restorable'] and not item['cleanupAllowed']
    with pytest.raises(HarnessError) as error:
        cleanup_preview(root, entry)
    assert error.value.code == 'ARCHIVE_UNKNOWN'
    assert source.exists()


@pytest.mark.parametrize('name', ['credentials.json', 'credentials.yaml', '.credentials.yaml', 'auth.json'])
def test_archive_uses_existing_credential_filename_protection(tmp_path, name):
    from asl_harness.archives import archives, cleanup_preview
    root = _environment(tmp_path)
    entry, _ = _archived(root, 'skill')
    (root / 'archive' / entry / name).write_text('{"password":"not-a-real-secret"}', encoding='utf-8')
    report = archives(root)
    assert not report['entries'] and report['issues'][0]['code'] == 'SECRET_FILE_PRESENT'
    with pytest.raises(HarnessError):
        archives(root, entry, name)
    with pytest.raises(HarnessError):
        cleanup_preview(root, entry)


def test_archive_fingerprint_frames_each_file_and_rejects_old_cleanup_preview(tmp_path):
    from asl_harness.archives import cleanup_preview
    root = _environment(tmp_path)
    entry, _ = _archived(root, 'skill')
    source = root / 'archive' / entry
    (source / 'a.bin').write_bytes(b'x\0b.bin\0file\0y')
    before = cleanup_preview(root, entry)['fingerprint']
    (source / 'a.bin').write_bytes(b'x')
    (source / 'b.bin').write_bytes(b'y')
    assert cleanup_preview(root, entry)['fingerprint'] != before
    with pytest.raises(HarnessError) as error:
        cleanup_preview(root, entry, expected=before)
    assert error.value.code == 'EDIT_STALE'
