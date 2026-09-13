from pathlib import Path

from asl_harness.local_modes import scan_modes
from test_mode_only import _environment, _write


def test_known_roots_deduplicate_without_reading_skill_bodies(tmp_path):
    root = _environment(tmp_path)
    # Discovery must work even when a skill body needs repair; opening validates it.
    _write(root / 'skills' / 'creator' / 'SKILL.md', 'broken body')
    report = scan_modes([str(root), str(root / '.')])
    assert len(report['modes']) == 1
    assert report['modes'][0]['id'] == 'creator-studio'
    assert report['modes'][0]['workspace'] == str(root.resolve())


def test_selected_parent_is_one_level_only_and_errors_do_not_hide_good_roots(tmp_path):
    root = _environment(tmp_path / 'good')
    _environment(tmp_path / 'good' / 'too' / 'deep')
    report = scan_modes([str(tmp_path / 'missing')], parent=tmp_path / 'good')
    assert [m['workspace'] for m in report['modes']] == [str(root.resolve())]
    assert report['issues']


def test_imported_source_is_recognized_and_same_name_is_not_deduplicated(tmp_path):
    one = _environment(tmp_path / 'one')
    two = _environment(tmp_path / 'two')
    _write(one / 'modes' / 'creator-studio' / 'SOURCE.md',
           '# Source\n<!-- asl:upstream -->\n- Repository: https://github.com/test/skills\n'
           '- URL: https://github.com/test/skills\n- Commit: ' + 'a' * 40 + '\n<!-- /asl:upstream -->\n')
    report = scan_modes([str(one), str(two)])
    assert len(report['modes']) == 2
    assert report['modes'][0]['upstream']['commit'] == 'a' * 40
    assert report['modes'][1]['upstream'] is None
