import sys
import json
from pathlib import Path

import pytest

from asl_harness.deepseek import export_preset, verify_preset
from asl_harness.workspace import Workspace, filesystem_path
from test_mode_only import _environment, _deepseek_base, _write, _mode, _skill
from asl_harness.workspace import HarnessError
from asl_harness.hooks import hook_config


def test_changed_mode_membership_is_an_update_not_an_invalid_install(tmp_path):
    root = _environment(tmp_path)
    base = _deepseek_base(tmp_path / 'standard')
    output = tmp_path / 'asl-creator'
    export_preset(Workspace.open(root), 'creator-studio', base, output)
    _skill(root, 'extra')
    _mode(root, 'creator-studio', ('extra',))
    assert verify_preset(Workspace.open(root), 'creator-studio', output)


def test_legacy_install_has_an_explicit_upgrade_and_preserves_previous_files(tmp_path):
    root = _environment(tmp_path)
    workspace = Workspace.open(root)
    base = _deepseek_base(tmp_path / 'standard')
    output = tmp_path / 'asl-creator'
    export_preset(workspace, 'creator-studio', base, output)
    marker_path = output / '.asl-preset-projection.json'
    marker = json.loads(marker_path.read_text(encoding='utf-8'))
    marker['version'] = 2
    marker.pop('configurationFingerprint')
    marker_path.write_text(json.dumps(marker), encoding='utf-8')
    (output / 'asl-hooks.json').write_text(json.dumps(hook_config('asl-harness-hook --host-id deepseek-harness')), encoding='utf-8')
    with pytest.raises(HarnessError) as failure:
        verify_preset(workspace, 'creator-studio', output)
    assert failure.value.code == 'DEEPSEEK_PRESET_UPGRADE_REQUIRED'
    result = export_preset(workspace, 'creator-studio', base, output)
    assert Path(result['previousConfiguration']).joinpath('.asl-preset-projection.json').is_file()
    assert verify_preset(workspace, 'creator-studio', output) == []


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
        # At a deep basetemp the output itself can pass MAX_PATH, so read it
        # back through the same filesystem boundary the Harness uses.
        assert (
            filesystem_path(target / 'skills/creator' / relative).read_text(encoding='utf-8')
            == '# Reference'
        )


def test_filesystem_path_reaches_beyond_max_path(tmp_path: Path) -> None:
    relative = Path('nested/value.txt')
    assert filesystem_path(relative) == relative
    if sys.platform != 'win32':
        pytest.skip('Windows MAX_PATH regression')
    absolute = tmp_path / 'nested' / 'value.txt'
    extended = filesystem_path(absolute)
    assert str(extended).startswith('\\\\?\\')
    assert filesystem_path(extended) == extended
    deep = tmp_path
    while len(str(deep)) < 250:
        deep = deep / ('d' * 20)
    deep = deep / 'probe'
    filesystem_path(deep).mkdir(parents=True, exist_ok=True)
    value = filesystem_path(deep / 'value.txt')
    value.write_text('kept', encoding='utf-8')
    assert len(str(deep / 'value.txt')) > 259
    assert value.read_text(encoding='utf-8') == 'kept'
    value.unlink()
    current = deep
    while current != tmp_path:
        filesystem_path(current).rmdir()
        current = current.parent
