"""Loading must preserve content and guards without visiting excluded trees."""
import hashlib
import glob
import os
from pathlib import Path
import subprocess

import pytest

from asl_harness import workspace
from asl_harness.management import catalog, skill_files
from asl_harness.portable import _package_differences
from test_mode_only import _environment, _write


def test_git_identity_uses_one_process_and_handles_uncommitted_roots(tmp_path, monkeypatch):
    root = _environment(tmp_path)
    subprocess.run(['git', 'init', str(root)], check=True, capture_output=True)
    assert workspace._git_commit(root) == 'uncommitted'
    subprocess.run(['git', '-C', str(root), 'add', 'PROFILE.md'], check=True, capture_output=True)
    subprocess.run(['git', '-C', str(root), '-c', 'user.name=ASL test', '-c', 'user.email=test@example.invalid',
                    'commit', '-m', '测试基线'], check=True, capture_output=True)
    expected = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], check=True,
                              capture_output=True, text=True).stdout.strip()
    run, calls = subprocess.run, []

    def counted(*args, **kwargs):
        calls.append(args[0])
        return run(*args, **kwargs)

    monkeypatch.setattr(subprocess, 'run', counted)
    assert workspace._git_commit(root / 'skills') == expected
    assert len(calls) == 1
    assert workspace._git_commit(tmp_path / 'missing') == 'uncommitted'


@pytest.mark.parametrize('operation', ['catalog', 'files', 'fingerprint', 'differences'])
def test_package_reads_do_not_traverse_excluded_directories(tmp_path, monkeypatch, operation):
    root = _environment(tmp_path)
    package = root / 'skills/creator'
    _write(package / 'references/nested/真实资料.md', '保留的内容\n')
    read = {'catalog': lambda: catalog(root), 'files': lambda: skill_files(root, 'creator'),
            'fingerprint': lambda: workspace.package_fingerprint(package),
            'differences': lambda: _package_differences(package, root / 'skills/foundation')}[operation]
    expected = read()
    for name in (*workspace.GENERATED_DIRECTORIES, '.git'):
        _write(package / 'scripts' / name / 'nested/cache.txt', '排除的内容\n')
    scandir, visited = os.scandir, []

    def counted(path):
        visited.append(Path(path))
        return scandir(path)

    monkeypatch.setattr(os, 'scandir', counted)
    # Python 3.13's glob stores its own alias to scandir; exercise the real walker on both runtimes.
    if hasattr(glob, '_StringGlobber'):
        monkeypatch.setattr(glob._StringGlobber, 'scandir', staticmethod(counted))
    actual = read()
    if operation == 'catalog':
        assert actual['warnings'][0]['code'] == 'GENERATED_CONTENT_PRESENT'
        actual['warnings'] = expected['warnings']
    assert actual == expected, '目录、文件、指纹和差异不能因缓存内容而改变'
    excluded = workspace.GENERATED_DIRECTORIES | {'.git'}
    assert not [p for p in visited if excluded.intersection(p.parts)], '排除目录必须在遍历前剪枝'


def test_fingerprint_order_and_explicit_exclusions_remain_compatible(tmp_path):
    package = tmp_path / 'package'
    for name, content in [('z.md', '最后'), ('a/b.md', '资料'), ('a.md', '入口'), ('SOURCE.md', '来源')]:
        _write(package / name, content)
    expected = hashlib.sha256()
    for file in sorted(package.rglob('*'), key=lambda p: p.as_posix()):
        if file.is_file() and file.name != 'SOURCE.md':
            expected.update(file.relative_to(package).as_posix().encode() + b'\0' + file.read_bytes() + b'\0')
    assert workspace.package_fingerprint(package, ignored_names=frozenset({'SOURCE.md'})) == expected.hexdigest()


def test_excluded_tree_pruning_keeps_external_link_guard(tmp_path):
    root = _environment(tmp_path)
    outside = tmp_path / 'outside'
    outside.mkdir()
    link = root / 'skills/creator/references'
    try:
        link.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip('symlinks unavailable')
    report = catalog(root)
    assert [item['id'] for item in report['skills']] == ['foundation']
    assert report['modes'] == []
    assert any(issue['id'] == 'creator' and issue['code'] == 'PATH_ESCAPE' for issue in report['issues'])
    with pytest.raises(workspace.HarnessError):
        skill_files(root, 'creator')
