import json
from pathlib import Path

import pytest

from asl_harness.adapters import project_mode, MANAGED_START
from asl_harness.projection_lifecycle import disconnect
from asl_harness.workspace import Workspace, HarnessError, filesystem_path
from test_mode_only import _environment, _write
from test_mode_only import _deepseek_base
from asl_harness.deepseek import export_preset


def _padded_project(tmp_path, target=194):
    """Pad only the project path so the archived marker passes MAX_PATH.

    The Environment stays under the short tmp_path, so every path that
    project_mode itself creates still initializes inside the limit.
    """
    padding = 'p' * max(1, target - len(str(tmp_path)) - len('project') - 2)
    project = tmp_path / padding / 'project'
    filesystem_path(project).mkdir(parents=True)
    return project


def test_disconnect_previews_then_archives_only_managed_project_files(tmp_path):
    workspace = Workspace.open(_environment(tmp_path))
    project = tmp_path / 'project'
    _write(project / 'CLAUDE.md', '# Keep my rules\n')
    _write(project / '.claude/skills/unrelated/SKILL.md', 'keep')
    project_mode(workspace, project, 'creator-studio', host_id='claude-code')
    plan = disconnect(workspace, 'creator-studio', 'claude-code', 'project', project, check=True)
    assert (project / '.claude/skills/creator').exists()
    result = disconnect(workspace, 'creator-studio', 'claude-code', 'project', project, expected=plan['fingerprint'])
    assert result['status'] == 'disconnected'
    assert not (project / '.claude/skills/creator').exists()
    assert (project / '.claude/skills/unrelated/SKILL.md').read_text() == 'keep'
    assert '# Keep my rules' in (project / 'CLAUDE.md').read_text()
    assert MANAGED_START not in (project / 'CLAUDE.md').read_text()
    assert workspace.skills['creator'].path.exists()
    assert (project / '.asl/host-projections/claude-code/current.json').exists() is False
    assert Path(result['archive']).is_dir()


def test_disconnect_rejects_stale_preview_and_modified_instructions(tmp_path):
    workspace = Workspace.open(_environment(tmp_path))
    project = tmp_path / 'project'
    project_mode(workspace, project, 'creator-studio', host_id='claude-code')
    plan = disconnect(workspace, 'creator-studio', 'claude-code', 'project', project, check=True)
    with (project / 'CLAUDE.md').open('a', encoding='utf-8') as stream:
        stream.write('\nnew user instruction')
    with pytest.raises(HarnessError, match='变化'):
        disconnect(workspace, 'creator-studio', 'claude-code', 'project', project, expected=plan['fingerprint'])
    text = (project / 'CLAUDE.md').read_text(encoding='utf-8').replace('Hard rules', 'Edited rules')
    (project / 'CLAUDE.md').write_text(text, encoding='utf-8')
    with pytest.raises(HarnessError):
        disconnect(workspace, 'creator-studio', 'claude-code', 'project', project, check=True)
    with pytest.raises(HarnessError):
        project_mode(workspace, project, 'creator-studio', host_id='claude-code')


def test_disconnect_never_trusts_manifest_paths(tmp_path):
    workspace = Workspace.open(_environment(tmp_path))
    project = tmp_path / 'project'
    project_mode(workspace, project, 'creator-studio', host_id='claude-code')
    file = project / '.asl/host-projections/claude-code/current.json'
    record = json.loads(file.read_text())
    record['skillProjections'][0]['nativePath'] = '../outside'
    file.write_text(json.dumps(record))
    with pytest.raises(HarnessError):
        disconnect(workspace, 'creator-studio', 'claude-code', 'project', project, check=True)


def test_preset_disconnect_keeps_base_and_source_and_archives_generated_preset(tmp_path):
    workspace = Workspace.open(_environment(tmp_path))
    base = _deepseek_base(tmp_path / 'standard')
    preset = tmp_path / '.dsh/.agent-presets/asl-creator'
    export_preset(workspace, 'creator-studio', base, preset)
    plan = disconnect(workspace, 'creator-studio', 'deepseek-harness', 'preset', preset, check=True)
    result = disconnect(workspace, 'creator-studio', 'deepseek-harness', 'preset', preset, expected=plan['fingerprint'])
    assert not preset.exists()
    assert base.exists()
    assert workspace.skills['creator'].path.exists()
    assert Path(result['archive'], preset.name, 'agent.cordis.yml').exists()


def test_disconnect_archives_at_a_deep_basetemp(tmp_path):
    # The archived marker repeats the project-relative `.asl/host-projections`
    # path, which used to exceed MAX_PATH at a long project path and abort the
    # move. Only the project is padded; the Environment stays under tmp_path.
    workspace = Workspace.open(_environment(tmp_path))
    project = _padded_project(tmp_path)
    _write(project / 'CLAUDE.md', '# Keep my rules\n')
    _write(project / '.claude/skills/unrelated/SKILL.md', 'keep')
    project_mode(workspace, project, 'creator-studio', host_id='claude-code')
    plan = disconnect(workspace, 'creator-studio', 'claude-code', 'project', project, check=True)
    marker = Path([path for path in plan['paths'] if path.endswith('current.json')][0])
    original = marker.read_text(encoding='utf-8')
    result = disconnect(workspace, 'creator-studio', 'claude-code', 'project', project,
                        expected=plan['fingerprint'])
    archived = Path(result['archive'], '.asl/host-projections/claude-code/current.json')
    # Windows mkdir stops at MAX_PATH (259) without the extended path prefix.
    assert len(str(archived)) > 259
    assert filesystem_path(archived).read_text(encoding='utf-8') == original
    assert not (project / '.claude/skills/creator').exists()
    assert (project / '.claude/skills/unrelated/SKILL.md').read_text() == 'keep'
    assert '# Keep my rules' in (project / 'CLAUDE.md').read_text()
