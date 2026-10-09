import hashlib

import pytest

from asl_harness import management
from asl_harness.workspace import HarnessError, Workspace
from test_mode_only import _environment


def test_profile_and_feedback_round_trip_preserves_skills(tmp_path):
    from asl_harness.environment_documents import documents
    root = _environment(tmp_path / 'library')
    original = {p: p.read_bytes() for p in (root / 'skills').rglob('*') if p.is_file()}
    before = Workspace.open(root).source_fingerprint('creator-studio')
    data = documents(root)
    request = {'operation': 'environment.file.save', 'file': 'PROFILE.md',
               'expected': data['fingerprint'], 'document': '# 工作偏好\n先给结论。\n'}
    management.edit(root, request, check=True)
    assert documents(root)['document'] == data['document']
    report = management.edit(root, request)
    assert report['affectedModes']
    assert Workspace.open(root).source_fingerprint('creator-studio') != before
    assert documents(root)['document'] == request['document']
    note = {'operation': 'environment.file.save', 'file': 'feedback/一次反馈.md',
            'document': '# 一次反馈\n本次结果需要更短。\n'}
    management.edit(root, note)
    feedback = documents(root, note['file'])
    assert feedback['document'] == note['document']
    assert feedback['fingerprint'] == hashlib.sha256(note['document'].encode()).hexdigest()
    result = management.edit(root, {'operation': 'environment.file.archive',
                                    'file': note['file'], 'expected': feedback['fingerprint']})
    assert not (root / note['file']).exists()
    assert (root / result['archivePath']).read_text(encoding='utf-8') == note['document']
    assert all(path.read_bytes() == value for path, value in original.items())


@pytest.mark.parametrize('file', ['../outside.md', 'skills/a/SKILL.md', 'feedback/../PROFILE.md',
                                 'feedback/x/y.md', 'feedback/.env', 'feedback/x.md:secret', '/PROFILE.md'])
def test_environment_document_path_boundary(tmp_path, file):
    from asl_harness.environment_documents import documents
    root = _environment(tmp_path / 'library')
    with pytest.raises(HarnessError):
        documents(root, file)
    with pytest.raises(HarnessError):
        management.edit(root, {'operation': 'environment.file.save', 'file': file, 'document': '# Invalid'})


def test_environment_document_conflict_and_render_failure_do_not_write(tmp_path, monkeypatch):
    from asl_harness.environment_documents import documents
    from asl_harness import mermaid
    root = _environment(tmp_path / 'library')
    data = documents(root)
    request = {'operation': 'environment.file.save', 'file': 'PROFILE.md', 'expected': data['fingerprint'], 'document': '# New'}
    (root / 'PROFILE.md').write_text('# External', encoding='utf-8')
    with pytest.raises(HarnessError) as failure:
        management.edit(root, request)
    assert failure.value.code == 'EDIT_STALE'
    request['expected'] = documents(root)['fingerprint']
    def reject(_documents):
        raise HarnessError('MERMAID_RENDER_FAILED', 'invalid diagram')
    monkeypatch.setattr(mermaid, 'validate_documents', reject)
    with pytest.raises(HarnessError) as failure:
        management.edit(root, request)
    assert failure.value.code == 'MERMAID_RENDER_FAILED'
    assert (root / 'PROFILE.md').read_text(encoding='utf-8') == '# External'


def test_profile_cannot_be_archived(tmp_path):
    from asl_harness.environment_documents import documents
    root = _environment(tmp_path / 'library')
    with pytest.raises(HarnessError):
        management.edit(root, {'operation': 'environment.file.archive', 'file': 'PROFILE.md',
                               'expected': documents(root)['fingerprint']})


def test_profile_rejects_host_markers_and_failed_archive_rolls_back_directories(tmp_path):
    from asl_harness.environment_documents import documents
    from asl_harness.adapters import MANAGED_START
    from asl_harness.workspace import VIEW_START
    root = _environment(tmp_path / 'library')
    original = documents(root)
    with pytest.raises(HarnessError) as failure:
        management.edit(root, {'operation': 'environment.file.save', 'file': 'PROFILE.md',
                               'expected': original['fingerprint'], 'document': '# 偏好\n'+MANAGED_START})
    assert failure.value.code == 'HOST_INSTRUCTION_COLLISION'
    assert documents(root)['document'] == original['document']
    file = root / 'feedback/note.md'
    file.write_text('# Feedback', encoding='utf-8')
    (root / 'WORKSPACE.md').write_text('# Broken view\n'+VIEW_START, encoding='utf-8')
    before = list((root / 'archive').iterdir())
    with pytest.raises(HarnessError) as failure:
        management.edit(root, {'operation': 'environment.file.archive', 'file': 'feedback/note.md',
                               'expected': documents(root, 'feedback/note.md')['fingerprint']})
    assert failure.value.code == 'WORKSPACE_VIEW_COLLISION'
    assert file.read_text(encoding='utf-8') == '# Feedback'
    assert list((root / 'archive').iterdir()) == before


def test_profile_real_mermaid_gate_and_cli_readback(tmp_path, capsys):
    import json
    from asl_harness.environment_documents import documents
    from asl_harness.commands import main
    root = _environment(tmp_path / 'library')
    previous = documents(root)
    request = {'operation': 'environment.file.save', 'file': 'PROFILE.md', 'expected': previous['fingerprint'],
               'document': '# 偏好\n```mermaid\nflowchart LR\n A -->[\n```\n'}
    with pytest.raises(HarnessError) as failure:
        management.edit(root, request)
    assert failure.value.code == 'MERMAID_RENDER_FAILED'
    assert documents(root)['document'] == previous['document']
    request['document'] = '# 偏好\n```mermaid\nflowchart LR\n A[结论] --> B[证据]\n```\n'
    result = management.edit(root, request)
    assert result['diagrams']['rendered'] == 1
    assert main(['environment.documents', '--workspace', str(root)]) == 0
    assert json.loads(capsys.readouterr().out)['document'] == request['document']


def test_external_change_during_render_is_not_overwritten(tmp_path, monkeypatch):
    from asl_harness.environment_documents import documents
    from asl_harness import mermaid
    root = _environment(tmp_path / 'library')
    data = documents(root)
    def render(_documents):
        (root / 'PROFILE.md').write_text('# External while rendering', encoding='utf-8')
        return {'rendered': 0}
    monkeypatch.setattr(mermaid, 'validate_documents', render)
    with pytest.raises(HarnessError) as failure:
        management.edit(root, {'operation': 'environment.file.save', 'file': 'PROFILE.md',
                               'expected': data['fingerprint'], 'document': '# Pending'})
    assert failure.value.code == 'EDIT_STALE'
    assert documents(root)['document'] == '# External while rendering'
