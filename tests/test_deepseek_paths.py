from asl_harness.deepseek import export_preset, verify_preset
from asl_harness.workspace import Workspace
from test_mode_only import _environment, _deepseek_base, _write


def test_preset_staging_does_not_repeat_the_output_name(tmp_path):
    root = _environment(tmp_path)
    relative = 'references/frameworks/long-reference-name.md'
    _write(root / 'skills/creator' / relative, '# Reference')
    workspace = Workspace.open(root)
    base = _deepseek_base(tmp_path / 'standard')
    name = 'asl-a-long-name-for-a-personal-work-mode'
    suffix = f'{name}/skills/creator/{relative}'
    parent = tmp_path / ('p' * max(1, 242 - len(str(tmp_path)) - len(suffix) - 2))
    parent.mkdir()
    target = parent / name
    for _ in range(2):
        export_preset(workspace, 'creator-studio', base, target)
        verify_preset(workspace, 'creator-studio', target)
        assert (target / 'skills/creator' / relative).read_text() == '# Reference'
