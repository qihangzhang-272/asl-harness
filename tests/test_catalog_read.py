"""Read-only discovery isolates bad entries without weakening formal writes."""
import json
import os
import subprocess

import pytest

from asl_harness import management
from asl_harness.workspace import HarnessError, Workspace
from test_mode_only import _environment, _mode, _skill, _write


@pytest.mark.parametrize('broken', ['skill', 'mode', 'candidate', 'trial', 'secret'])
def test_unrelated_invalid_entries_do_not_hide_valid_catalog_or_files(tmp_path, broken):
    root = _environment(tmp_path)
    if broken == 'skill':
        _skill(root, 'broken')
        _write(root / 'skills/broken/SKILL.md', 'invalid frontmatter')
        path = root / 'skills/broken'
    elif broken == 'mode':
        _mode(root, 'broken', ('foundation',))
        _write(root / 'modes/broken/mode.yaml', 'not: a mode')
        path = root / 'modes/broken'
    elif broken == 'candidate':
        path = root / 'candidates/broken'
        path.mkdir()
    elif broken == 'trial':
        path = root / 'trials/broken'
        path.mkdir()
    else:
        _skill(root, 'broken')
        path = root / 'skills/broken'
        _write(path / '.env', 'PRIVATE_SENTINEL=never-return-this')

    try:
        report = management.catalog(root)
    except HarnessError as error:
        pytest.fail(f'unrelated {broken} blocked the catalog: {error.code}')
    assert [item['id'] for item in report['skills']] == ['creator', 'foundation']
    assert [item['id'] for item in report['modes']] == ['creator-studio']
    assert report['issues'][0]['path'] == str(path)
    assert report['issues'][0]['id'] == 'broken'
    assert report['issues'][0]['code']
    assert 'PRIVATE_SENTINEL' not in json.dumps(report)
    assert '# creator' in management.skill_files(root, 'creator')['document']
    assert '# creator-studio' in management.mode_files(root, 'creator-studio')['document']
    assert management.skill_files(root, 'creator')['issues'] == report['issues']
    with pytest.raises(HarnessError):
        Workspace.open(root)
    with pytest.raises(HarnessError):
        management.edit(root, {'operation': 'skill.archive', 'id': 'foundation'}, check=True)


@pytest.mark.parametrize('broken', ['missing', 'cycle', 'invalid'])
def test_bad_dependency_closures_are_reported_not_presented_as_valid(tmp_path, broken):
    root = _environment(tmp_path)
    _skill(root, 'dependent', ('broken',))
    _mode(root, 'affected', ('dependent',))
    if broken == 'cycle':
        _skill(root, 'broken', ('dependent',))
    elif broken == 'invalid':
        _skill(root, 'broken')
        _write(root / 'skills/broken/SKILL.md', 'invalid frontmatter')
    report = management.catalog(root)
    assert [item['id'] for item in report['skills']] == ['creator', 'foundation']
    assert [item['id'] for item in report['modes']] == ['creator-studio']
    assert {('skill', 'dependent'), ('mode', 'affected')} <= {
        (item['kind'], item['id']) for item in report['issues']}
    for read, identifier in ((management.skill_files, 'dependent'), (management.mode_files, 'affected')):
        with pytest.raises(HarnessError):
            read(root, identifier)


def test_invalid_mode_categories_are_isolated(tmp_path):
    root = _environment(tmp_path)
    _mode(root, 'affected', ('foundation',))
    with (root / 'modes/affected/mode.yaml').open('a', encoding='utf-8') as stream:
        stream.write('  capabilities:\n    - title: invalid\n      skills: [missing]\n')
    report = management.catalog(root)
    assert [item['id'] for item in report['modes']] == ['creator-studio']
    assert report['issues'][0]['code'] == 'MODE_INVALID'


def test_invalid_environment_root_still_fails(tmp_path):
    root = _environment(tmp_path)
    _write(root / 'PROFILE.md', '')
    with pytest.raises(HarnessError):
        management.catalog(root)


def test_external_package_is_not_read_or_exposed(tmp_path):
    root = _environment(tmp_path)
    outside = tmp_path / 'outside'
    _skill(outside, 'external')
    _write(outside / 'skills/external/SKILL.md', 'PRIVATE_SENTINEL')
    link = root / 'skills/external'
    try:
        link.symlink_to(outside / 'skills/external', target_is_directory=True)
    except OSError:
        if os.name != 'nt':
            pytest.skip('symlinks unavailable')
        subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(outside / 'skills/external')],
                       check=True, capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW)
    report = management.catalog(root)
    assert [item['id'] for item in report['skills']] == ['creator', 'foundation']
    assert report['issues'][0]['code'] == 'PATH_ESCAPE'
    assert 'PRIVATE_SENTINEL' not in json.dumps(report)
    with pytest.raises(HarnessError):
        management.skill_files(root, 'external')


def test_secret_lifecycle_file_is_isolated_from_other_records(tmp_path):
    root = _environment(tmp_path)
    _write(root / 'feedback/good.md', '# Feedback\n')
    _write(root / 'feedback/.env', 'PRIVATE_SENTINEL=never-return-this')
    report = management.catalog(root)
    assert report['cultivation']['feedback'] == ['good.md']
    assert [(item['kind'], item['id'], item['code']) for item in report['issues']] == [
        ('feedback', '.env', 'SECRET_FILE_PRESENT')]
    assert 'PRIVATE_SENTINEL' not in json.dumps(report)


def test_lifecycle_hidden_placeholders_are_ignored_after_secret_checks(tmp_path):
    root = _environment(tmp_path)
    for area in ('candidates', 'trials'):
        _write(root / area / '.gitkeep', '')
    assert Workspace.open(root).cultivation['candidates'] == ()
    report = management.catalog(root)
    assert report['issues'] == []
    assert report['cultivation']['candidates'] == []
    assert report['cultivation']['trials'] == []
    _write(root / 'candidates/.env', 'PRIVATE_SENTINEL')
    report = management.catalog(root)
    assert [(item['id'], item['code']) for item in report['issues']] == [('.env', 'SECRET_FILE_PRESENT')]
    assert 'PRIVATE_SENTINEL' not in json.dumps(report)


@pytest.mark.parametrize('document', ['? [invalid, key]\n: value\n', 'apiVersion: [invalid]\n'])
def test_invalid_yaml_types_are_isolated(tmp_path, document):
    root = _environment(tmp_path)
    _mode(root, 'broken', ('foundation',))
    _write(root / 'modes/broken/mode.yaml', document)
    report = management.catalog(root)
    assert [item['id'] for item in report['modes']] == ['creator-studio']
    assert report['issues'][0]['path'] == str(root / 'modes/broken')


def test_unreadable_mode_source_is_an_issue_not_a_catalog_failure(tmp_path):
    root = _environment(tmp_path)
    _mode(root, 'broken', ('foundation',))
    (root / 'modes/broken/SOURCE.md').write_bytes(b'\xff\xfe')
    report = management.catalog(root)
    assert [item['id'] for item in report['modes']] == ['creator-studio']
    assert report['issues'][0]['path'] == str(root / 'modes/broken')


def test_unreadable_skill_asset_also_invalidates_dependent_modes(tmp_path, monkeypatch):
    from pathlib import Path

    root = _environment(tmp_path)
    _skill(root, 'broken')
    _mode(root, 'affected', ('broken',))
    blocked = root / 'skills/broken/script.py'
    _write(blocked, 'print(1)')
    read = Path.read_bytes

    def denied(path):
        if str(path).removeprefix('\\\\?\\') == str(blocked):
            raise PermissionError('PRIVATE_SENTINEL')
        return read(path)

    monkeypatch.setattr(Path, 'read_bytes', denied)
    report = management.catalog(root)
    assert [item['id'] for item in report['skills']] == ['creator', 'foundation']
    assert [item['id'] for item in report['modes']] == ['creator-studio']
    assert {('skill', 'broken'), ('mode', 'affected')} <= {
        (item['kind'], item['id']) for item in report['issues']}
    assert 'PRIVATE_SENTINEL' not in json.dumps(report)


def test_partial_catalog_does_not_claim_generated_view_is_current(tmp_path):
    root = _environment(tmp_path)
    Workspace.open(root).sync_workspace_view()
    _skill(root, 'broken')
    _write(root / 'skills/broken/SKILL.md', 'invalid')
    assert management.catalog(root)['workspaceViewCurrent'] is False


def test_catalog_reads_each_skill_once_not_once_per_mode(tmp_path, monkeypatch):
    from asl_harness import workspace

    root = _environment(tmp_path)
    for index in range(30):
        _mode(root, f'mode-{index}', ('creator',))
    read, calls = workspace._read_skill, []

    def counted(package, identifier, environment, **kwargs):
        calls.append(identifier)
        return read(package, identifier, environment, **kwargs)

    monkeypatch.setattr(workspace, '_read_skill', counted)
    assert len(management.catalog(root)['modes']) == 31
    assert sorted(calls) == ['creator', 'foundation']
