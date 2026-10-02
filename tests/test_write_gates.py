"""Formal CLI writes share rendering, containment and concurrency checks."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import time
import json

import pytest

from asl_harness import management, mermaid, sync
from contextlib import contextmanager
from asl_harness.portable import export_pack, import_pack
from asl_harness.sync import sync_environment
from asl_harness.workspace import HarnessError, Workspace
from test_mode_only import _environment, _skill


def _contents(root):
    return {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob('*')
            if p.is_file() and not p.name.startswith('.asl-')}


def _mode_request(root, identifier=None):
    mode = management.catalog(root)['modes'][0]
    return {'operation': 'mode.save', 'id': identifier or mode['id'],
            **({'expected': mode['fingerprint']} if identifier is None else {}),
            'document': '# Updated\n', 'skills': mode['roots'],
            'architecture': {'shared': mode['skills'], 'paradigms': []}}


@pytest.mark.parametrize('check', [False, True])
def test_environment_sync_rejects_bad_mermaid_before_copy(tmp_path, check):
    source = _environment(tmp_path / 'source')
    target = _environment(tmp_path / 'target')
    _skill(source, 'visual')
    (source / 'skills/visual/broken.mmd').write_text('flowchart LR\n A -->[', encoding='utf-8')
    before = _contents(target)
    with pytest.raises(HarnessError) as error:
        sync_environment(source, target, 'visual', check=check)
    assert error.value.code == 'MERMAID_RENDER_FAILED'
    assert _contents(target) == before


@pytest.mark.parametrize('side', ['source', 'target'])
def test_environment_sync_rechecks_changes_during_render(tmp_path, monkeypatch, side):
    source = _environment(tmp_path / 'source')
    target = _environment(tmp_path / 'target')
    _skill(source, 'visual')
    changed = source / 'skills/visual/SKILL.md' if side == 'source' else target / 'skills/creator/SKILL.md'
    before = _contents(target)
    def change_during_render(_packages, **_kwargs):
        changed.write_text(changed.read_text(encoding='utf-8') + '\n# Concurrent change\n', encoding='utf-8')
        return {'ok': True, 'rendered': 0, 'errors': []}
    monkeypatch.setattr(mermaid, 'validate_packages', change_during_render)
    with pytest.raises(HarnessError) as error:
        sync_environment(source, target, 'visual')
    assert error.value.code == 'SYNC_STALE'
    assert not (target / 'skills/visual').exists()
    if side == 'source':
        assert _contents(target) == before
    else:
        assert '# Concurrent change' in changed.read_text(encoding='utf-8')


def test_source_only_import_has_real_render_gate(tmp_path):
    source = _environment(tmp_path / 'source')
    first = tmp_path / 'first.zip'
    export_pack(source, 'creator-studio', first)
    target = tmp_path / 'target'
    import_pack(first, target)
    before = _contents(target)
    (source / 'modes/creator-studio/SOURCE.md').write_text(
        '# Source\n\n<!-- asl:upstream -->\n- Commit: abc\n\n'
        '```mermaid\nflowchart LR\n A -->[\n```\n<!-- /asl:upstream -->\n', encoding='utf-8')
    bad = tmp_path / 'bad.zip'
    export_pack(source, 'creator-studio', bad)
    with pytest.raises(HarnessError) as error:
        import_pack(bad, target)
    assert error.value.code == 'MERMAID_RENDER_FAILED'
    assert _contents(target) == before


def _link(link, target, *, directory=False):
    try:
        link.symlink_to(target, target_is_directory=directory)
    except OSError:
        if not directory:
            os.link(target, link)
        elif os.name == 'nt':
            result = subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(target)], capture_output=True)
            if result.returncode:
                pytest.skip('junctions unavailable')
        else:
            pytest.skip('symlinks unavailable')


def test_new_mode_cannot_write_through_linked_parent(tmp_path):
    root = _environment(tmp_path)
    outside = tmp_path / 'outside-modes'
    (root / 'modes').rename(outside)
    _link(root / 'modes', outside, directory=True)
    before = _contents(outside)
    with pytest.raises(HarnessError):
        management.edit(root, _mode_request(root, 'new-mode'))
    assert _contents(outside) == before
    assert not (outside / 'new-mode').exists()


@pytest.mark.parametrize('entry', ['edit', 'sync', 'import', 'view'])
def test_generated_view_cannot_write_through_external_link(tmp_path, entry):
    root = _environment(tmp_path / 'target')
    outside = tmp_path / 'outside.md'
    (root / 'WORKSPACE.md').rename(outside)
    _link(root / 'WORKSPACE.md', outside)
    before = outside.read_bytes()
    source = _environment(tmp_path / 'source')
    _skill(source, 'visual')
    package = tmp_path / 'incoming.zip'
    if entry == 'import':
        (source / 'skills/creator/new.txt').write_text('incoming', encoding='utf-8')
        export_pack(source, 'creator-studio', package)
    with pytest.raises(HarnessError):
        if entry == 'edit':
            management.edit(root, _mode_request(root))
        elif entry == 'sync':
            sync_environment(source, root, 'visual')
        elif entry == 'import':
            import_pack(package, root, replace=True)
        else:
            Workspace.open(root).sync_workspace_view()
    assert outside.read_bytes() == before
    assert (root / 'WORKSPACE.md').samefile(outside)


@pytest.mark.parametrize('operation', ['skill.save', 'skill.file.save'])
def test_skill_text_save_does_not_mutate_external_hardlink(tmp_path, operation):
    root = _environment(tmp_path)
    file = root / 'skills/creator/SKILL.md'
    outside = tmp_path / 'outside-skill.md'
    os.link(file, outside)
    before = outside.read_bytes()
    data = management.skill_files(root, 'creator')
    request = {'operation': operation, 'id': 'creator', 'expected': data['fingerprint'],
               'document': data['document'] + '\n# Changed\n'}
    if operation == 'skill.file.save':
        request['file'] = 'SKILL.md'
    with pytest.raises(HarnessError):
        management.edit(root, request)
    assert outside.read_bytes() == before


def test_source_record_copy_does_not_mutate_external_hardlink(tmp_path):
    source = _environment(tmp_path / 'source')
    first = tmp_path / 'first.zip'
    export_pack(source, 'creator-studio', first)
    target = tmp_path / 'target'
    import_pack(first, target)
    file = target / 'modes/creator-studio/SOURCE.md'
    file.write_text('# Source\n', encoding='utf-8')
    outside = tmp_path / 'outside-source.md'
    os.link(file, outside)
    before = outside.read_bytes()
    (source / 'modes/creator-studio/SOURCE.md').write_text(
        '# Source\n\n<!-- asl:upstream -->\n- Commit: abc\n<!-- /asl:upstream -->\n', encoding='utf-8')
    newer = tmp_path / 'newer.zip'
    export_pack(source, 'creator-studio', newer)
    with pytest.raises(HarnessError):
        import_pack(newer, target)
    assert outside.read_bytes() == before


@pytest.mark.parametrize('check', [True, False])
def test_complete_skill_import_rejects_secret_before_any_formal_copy(tmp_path, monkeypatch, check):
    root = _environment(tmp_path / 'target')
    source = _environment(tmp_path / 'source') / 'skills/foundation'
    (source / '.env').write_text('API_KEY=private', encoding='utf-8')
    target = root / 'skills/foundation'
    skill = next(s for s in management.catalog(root)['skills'] if s['id'] == 'foundation')
    before = _contents(root)
    copies = []
    original_copy = shutil.copytree
    def record_copy(source_path, destination, *args, **kwargs):
        if Path(destination) == target:
            copies.append(destination)
        return original_copy(source_path, destination, *args, **kwargs)
    monkeypatch.setattr(shutil, 'copytree', record_copy)
    with pytest.raises(HarnessError) as error:
        management.edit(root, {'operation': 'skill.import', 'id': 'foundation', 'source': str(source),
                               'expected': skill['fingerprint']}, check=check)
    assert error.value.code == 'SECRET_FILE_PRESENT'
    assert not copies
    assert _contents(root) == before


@pytest.mark.parametrize('entry', ['edit', 'sync'])
def test_adoption_uses_validated_snapshot_not_late_changed_source(tmp_path, monkeypatch, entry):
    root = _environment(tmp_path / 'target')
    source = _environment(tmp_path / 'source')
    _skill(source, 'visual')
    original = 'flowchart LR\n A --> B\n'
    file = source / 'skills/visual/diagram.mmd'
    file.write_text(original, encoding='utf-8')
    module = management if entry == 'edit' else sync
    rollback = module._rollback_paths
    @contextmanager
    def mutate_after_final_check(target, paths):
        with rollback(target, paths):
            file.write_text('flowchart LR\n A -->[', encoding='utf-8')
            yield
    monkeypatch.setattr(module, '_rollback_paths', mutate_after_final_check)
    if entry == 'edit':
        management.edit(root, {'operation': 'skill.import', 'id': 'visual',
                               'source': str(source / 'skills/visual')})
    else:
        sync_environment(source, root, 'visual')
    assert (root / 'skills/visual/diagram.mmd').read_text(encoding='utf-8') == original
    assert 'A -->[' in file.read_text(encoding='utf-8')


@pytest.mark.parametrize('entry', ['edit', 'sync', 'import'])
def test_last_copy_is_checked_before_formal_adoption(tmp_path, monkeypatch, entry):
    root = _environment(tmp_path / 'target')
    source = _environment(tmp_path / 'source')
    (source / 'skills/foundation/diagram.mmd').write_text('flowchart LR\n A --> B\n', encoding='utf-8')
    package = tmp_path / 'incoming.zip'
    if entry == 'import':
        export_pack(source, 'creator-studio', package)
    skill = next(s for s in management.catalog(root)['skills'] if s['id'] == 'foundation')
    before = _contents(root)
    original_copy = shutil.copytree
    def change_private_candidate_at_copy(source_path, destination, *args, **kwargs):
        destination = Path(destination)
        if destination == root / 'skills/foundation' or destination.name == 'incoming':
            diagram = Path(source_path) / 'diagram.mmd'
            if diagram.exists():
                diagram.write_text('flowchart LR\n A -->[', encoding='utf-8')
        return original_copy(source_path, destination, *args, **kwargs)
    monkeypatch.setattr(shutil, 'copytree', change_private_candidate_at_copy)
    with pytest.raises(HarnessError):
        if entry == 'edit':
            management.edit(root, {'operation': 'skill.import', 'id': 'foundation',
                                   'source': str(source / 'skills/foundation'), 'expected': skill['fingerprint']})
        elif entry == 'sync':
            sync_environment(source, root, 'foundation', replace=True)
        else:
            import_pack(package, root, replace=True)
    assert _contents(root) == before


def test_private_copy_does_not_appear_as_a_formal_skill(tmp_path, monkeypatch):
    root = _environment(tmp_path / 'target')
    source = _environment(tmp_path / 'source')
    (source / 'skills/foundation/new.txt').write_text('incoming', encoding='utf-8')
    original_copy = shutil.copytree
    reads = []
    def read_during_private_copy(source_path, destination, *args, **kwargs):
        result = original_copy(source_path, destination, *args, **kwargs)
        if Path(destination).name == 'incoming':
            reads.append(Workspace.open(root).summary())
        return result
    monkeypatch.setattr(shutil, 'copytree', read_during_private_copy)
    sync_environment(source, root, 'foundation', replace=True)
    assert len(reads) == 1
    assert {s['id'] for s in reads[0]['skills']} == {'foundation', 'creator'}


@pytest.mark.parametrize('contending_entry', ['edit', 'sync', 'import', 'view'])
def test_two_cli_writers_cannot_commit_the_same_fingerprint(tmp_path, contending_entry):
    root = _environment(tmp_path)
    first = _mode_request(root)
    first['document'] = '# First writer\n'
    second = {**first, 'document': '# Second writer\n'}
    ready, release = tmp_path / 'ready', tmp_path / 'release'
    program = '''
import json, sys, time
from pathlib import Path
from contextlib import contextmanager
from asl_harness import management
from asl_harness.commands import main
original = management._rollback_paths
@contextmanager
def paused(root, paths):
    with original(root, paths):
        Path(sys.argv[2]).write_text('ready')
        end = time.monotonic() + 10
        while not Path(sys.argv[3]).exists():
            if time.monotonic() > end: raise RuntimeError('test release timeout')
            time.sleep(.02)
        yield
management._rollback_paths = paused
sys.exit(main(['environment.edit', '--workspace', sys.argv[1]]))
'''
    environment = {**os.environ, 'PYTHONPATH': str(Path(__file__).resolve().parents[1] / 'src')}
    process = subprocess.Popen([sys.executable, '-c', program, str(root), str(ready), str(release)],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, encoding='utf-8', env=environment)
    try:
        process.stdin.write(json.dumps(first))
        process.stdin.close()
        end = time.monotonic() + 10
        while not ready.exists():
            if process.poll() is not None or time.monotonic() > end:
                pytest.fail('first writer did not reach its transaction')
            time.sleep(.02)
        arguments = ['environment.edit', '--workspace', str(root)]
        if contending_entry == 'view':
            arguments = ['workspace.view.sync', '--workspace', str(root)]
        elif contending_entry != 'edit':
            source = _environment(tmp_path / 'source')
            _skill(source, 'visual')
            if contending_entry == 'sync':
                arguments = ['environment.sync', '--source', str(source), '--target', str(root), '--skill', 'visual']
            else:
                package = tmp_path / 'incoming.zip'
                export_pack(source, 'creator-studio', package)
                arguments = ['mode.import', '--source', str(package), '--target', str(root)]
        contender = subprocess.run([sys.executable, '-m', 'asl_harness.commands', *arguments],
                                   input=json.dumps(second), capture_output=True, text=True, encoding='utf-8',
                                   timeout=10, env=environment)
        assert contender.returncode == 2
        assert json.loads(contender.stdout)['error']['code'] in {'ENVIRONMENT_BUSY', 'EDIT_STALE'}
    finally:
        release.write_text('release', encoding='utf-8')
        process.wait(timeout=10)
        process.stdout.close()
        process.stderr.close()
    assert process.returncode == 0
    assert (root / 'modes/creator-studio/MODE.md').read_text(encoding='utf-8') == first['document']


@pytest.mark.parametrize('entry', ['edit', 'sync'])
def test_final_skill_candidate_rejects_secret_before_adoption(tmp_path, monkeypatch, entry):
    root = _environment(tmp_path / 'target')
    source_root = _environment(tmp_path / 'source')
    _skill(source_root, 'visual')
    source = source_root / 'skills/visual'
    before = _contents(root)
    if entry == 'edit':
        scan = management._scan_authored_material
        def inject_after_source_scan(path, *args):
            result = scan(path, *args)
            if path == source:
                (source / '.env').write_text('PRIVATE=value', encoding='utf-8')
            return result
        monkeypatch.setattr(management, '_scan_authored_material', inject_after_source_scan)
    else:
        open_workspace = Workspace.open
        def inject_after_source_open(path, **kwargs):
            result = open_workspace(path, **kwargs)
            if Path(path) == source_root:
                (source / '.env').write_text('PRIVATE=value', encoding='utf-8')
            return result
        monkeypatch.setattr(Workspace, 'open', inject_after_source_open)
    module = management if entry == 'edit' else sync
    adopt = module._replace_package
    adopted = []
    def observe_adoption(*args, **kwargs):
        adopted.append(args[1])
        return adopt(*args, **kwargs)
    monkeypatch.setattr(module, '_replace_package', observe_adoption)
    with pytest.raises(HarnessError) as failure:
        if entry == 'edit':
            management.edit(root, {'operation': 'skill.import', 'id': 'visual', 'source': str(source)})
        else:
            sync_environment(source_root, root, 'visual')
    assert failure.value.code == 'SECRET_FILE_PRESENT'
    assert not adopted, 'invalid candidate must never enter the formal library'
    assert _contents(root) == before


@pytest.mark.parametrize('entry', ['edit', 'sync', 'import'])
def test_private_candidate_render_failure_points_to_repairable_source(tmp_path, entry):
    root = _environment(tmp_path / 'target')
    source_root = _environment(tmp_path / 'source')
    file = source_root / 'skills/creator/diagram.mmd'
    file.write_text('flowchart LR\n A -->[', encoding='utf-8')
    package = tmp_path / 'bad.zip'
    if entry == 'import':
        export_pack(source_root, 'creator-studio', package)
    skill = next(s for s in management.catalog(root)['skills'] if s['id'] == 'creator')
    before = _contents(root)
    with pytest.raises(HarnessError) as failure:
        if entry == 'edit':
            management.edit(root, {'operation': 'skill.import', 'id': 'creator',
                                   'source': str(file.parent), 'expected': skill['fingerprint']})
        elif entry == 'sync':
            sync_environment(source_root, root, 'creator', replace=True)
        else:
            import_pack(package, root, replace=True)
    assert failure.value.code == 'MERMAID_RENDER_FAILED'
    reported = failure.value.details[0]['file']
    if entry == 'import':
        assert reported == f'{package.resolve()}!/skills/creator/diagram.mmd'
        assert package.exists()
    else:
        assert Path(reported) == file
        assert Path(reported).exists()
    assert reported in str(failure.value)
    assert _contents(root) == before


@pytest.mark.parametrize('kind', ['mode', 'skill'])
def test_raw_crlf_main_document_round_trip_does_not_duplicate_carriage_returns(tmp_path, kind):
    root = _environment(tmp_path)
    identifier = 'creator-studio' if kind == 'mode' else 'creator'
    filename = 'MODE.md' if kind == 'mode' else 'SKILL.md'
    file = root / f'{kind}s' / identifier / filename
    original = file.read_bytes().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
    file.write_bytes(original)
    read = management.mode_files if kind == 'mode' else management.skill_files
    data = read(root, identifier, filename)
    request = {'operation': kind + '.save', 'id': identifier, 'expected': data['fingerprint'],
               'document': data['document']}
    if kind == 'mode':
        request.update(skills=['creator'], architecture={'shared': ['creator', 'foundation'], 'paradigms': []})
    management.edit(root, request)
    saved = file.read_bytes()
    assert b'\r\r\n' not in saved
    assert saved == (data['document'].rstrip() + '\n').encode('utf-8')


@pytest.mark.parametrize('entry', ['edit', 'sync'])
def test_candidate_identity_is_captured_before_complete_validation(tmp_path, monkeypatch, entry):
    root = _environment(tmp_path / 'target')
    source_root = _environment(tmp_path / 'source')
    _skill(source_root, 'visual')
    module = management if entry == 'edit' else sync
    read = module._read_skill
    def inject_after_candidate_read(package, *args, **kwargs):
        result = read(package, *args, **kwargs)
        if package != source_root / 'skills/visual' and package.name == 'visual':
            (package / '.env').write_text('PRIVATE=value', encoding='utf-8')
        return result
    monkeypatch.setattr(module, '_read_skill', inject_after_candidate_read)
    before = _contents(root)
    with pytest.raises(HarnessError) as failure:
        if entry == 'edit':
            management.edit(root, {'operation': 'skill.import', 'id': 'visual',
                                   'source': str(source_root / 'skills/visual')})
        else:
            sync_environment(source_root, root, 'visual')
    assert failure.value.code == 'ADOPTION_STALE'
    assert _contents(root) == before
