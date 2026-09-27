from pathlib import Path

import pytest
import yaml

from asl_harness import management
from asl_harness.workspace import Workspace, HarnessError
from asl_harness.portable import export_pack, import_pack
from test_mode_only import _environment


def architecture():
    return {'nodes': [], 'shared': ['foundation'], 'paradigms': [
        {'id': 'compose', 'title': '材料成稿', 'description': '根据已有资料组织文章，缺少资料时调用通用检索。',
         'skills': ['creator'], 'edges': []}]}


def test_new_protocol_requires_coverage_and_preserves_paradigms_on_roundtrip(tmp_path: Path):
    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    request = {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
               'skills': mode['roots'], 'document': mode['document'], 'architecture': architecture()}
    management.edit(root, request)
    path = root / 'modes/creator-studio/mode.yaml'
    data = yaml.safe_load(path.read_text(encoding='utf-8'))
    assert data['apiVersion'] == 'asl-wep/v0.4.0'
    export_pack(root, mode['id'], tmp_path / 'shared.zip')
    import_pack(tmp_path / 'shared.zip', tmp_path / 'received')
    assert Workspace.open(tmp_path / 'received').modes[mode['id']].architecture == architecture()
    del data['spec']['architecture']
    path.write_text(yaml.safe_dump(data), encoding='utf-8')
    with pytest.raises(HarnessError, match='architecture'):
        Workspace.open(root)


def test_missing_members_and_unexplained_relations_are_rejected(tmp_path: Path):
    from asl_harness.map_schema import architecture_value
    value = architecture()
    value['shared'] = []
    with pytest.raises(ValueError, match='foundation'):
        architecture_value(value, {'foundation', 'creator'})
    value['paradigms'][0]['skills'].append('foundation')
    value['paradigms'][0]['edges'] = [{'from': 'foundation', 'to': 'creator'}]
    with pytest.raises(ValueError, match='label'):
        architecture_value(value, {'foundation', 'creator'})
    value['paradigms'][0]['edges'] = [{'from': 'foundation', 'to': 'creator', 'label': '素材'},
                                      {'from': 'creator', 'to': 'foundation', 'label': '补充依据'}]
    assert architecture_value(value, {'foundation', 'creator'}) == value


def test_removal_cleans_all_references_without_deleting_skill(tmp_path: Path):
    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    request = {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
               'skills': mode['roots'], 'document': mode['document'], 'architecture': architecture()}
    management.edit(root, request)
    mode = management.catalog(root)['modes'][0]
    management.edit(root, {k: v for k, v in {**request, 'expected': mode['fingerprint'],
                    'skills': ['foundation']}.items() if k != 'architecture'})
    assert management.catalog(root)['modes'][0]['architecture'] == {'nodes': [], 'shared': ['foundation'], 'paradigms': []}
    assert (root / 'skills/creator/SKILL.md').exists()


def test_new_members_need_explicit_placement(tmp_path: Path):
    from test_mode_only import _skill
    root = _environment(tmp_path)
    _skill(root, 'new-skill')
    mode = management.catalog(root)['modes'][0]
    request = {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
               'skills': mode['roots'], 'document': mode['document'], 'architecture': architecture()}
    management.edit(root, request)
    mode = management.catalog(root)['modes'][0]
    change = {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
              'document': mode['document'], 'skills': [*mode['roots'], 'new-skill']}
    with pytest.raises(HarnessError, match='新加入'):
        management.edit(root, change)
    management.edit(root, {**change, 'placement': 'compose'})
    assert management.catalog(root)['modes'][0]['architecture']['paradigms'][0]['skills'] == ['creator', 'new-skill']


def test_paradigm_contract_and_root_notices_reach_projection_and_roundtrip(tmp_path):
    from asl_harness.adapters import _mode_instructions
    root = _environment(tmp_path)
    (root / 'LICENSE').write_text('Test license attribution', encoding='utf-8')
    mode = management.catalog(root)['modes'][0]
    management.edit(root, {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
                          'document': mode['document'], 'skills': mode['roots'], 'architecture': architecture()})
    workspace = Workspace.open(root)
    text = _mode_instructions(workspace, mode['id'])
    assert '材料成稿' in text and '通用能力' in text
    export_pack(root, mode['id'], tmp_path / 'one.zip')
    received = tmp_path / 'received'
    import_pack(tmp_path / 'one.zip', received)
    assert (received / 'modes' / mode['id'] / 'notices/LICENSE').read_text() == 'Test license attribution'
    assert not (received / 'skills/creator/LICENSE').exists()
    export_pack(received, mode['id'], tmp_path / 'two.zip')
    second = tmp_path / 'second'
    import_pack(tmp_path / 'two.zip', second)
    assert (second / 'modes' / mode['id'] / 'notices/LICENSE').exists()


def test_new_mode_cannot_omit_architecture_or_downgrade_it(tmp_path):
    root = _environment(tmp_path)
    request = {'operation': 'mode.save', 'id': 'new-mode', 'document': '# New',
               'skills': ['foundation']}
    with pytest.raises(HarnessError, match='architecture'):
        management.edit(root, request)
    assert not (root / 'modes/new-mode').exists()
    management.edit(root, {**request, 'architecture': {'shared': ['foundation'], 'paradigms': []}})
    mode = next(m for m in management.catalog(root)['modes'] if m['id'] == 'new-mode')
    with pytest.raises(HarnessError, match='architecture'):
        management.edit(root, {**request, 'expected': mode['fingerprint'], 'architecture': None})


def test_import_requires_placement_before_any_file_changes(tmp_path):
    from test_mode_only import _skill
    root = _environment(tmp_path / 'environment')
    mode = management.catalog(root)['modes'][0]
    management.edit(root, {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
                          'document': mode['document'], 'skills': mode['roots'], 'architecture': architecture()})
    _skill(tmp_path / 'upstream', 'new-skill')
    source = tmp_path / 'upstream/skills/new-skill'
    request = {'operation': 'skill.import', 'source': str(source), 'id': 'new-skill', 'mode': mode['id']}
    path = root / 'modes' / mode['id'] / 'mode.yaml'
    before = path.read_bytes()
    with pytest.raises(HarnessError, match='新加入'):
        management.edit(root, request)
    assert path.read_bytes() == before
    assert not (root / 'skills/new-skill').exists()
    management.edit(root, {**request, 'placement': 'shared'})
    assert Workspace.open(root).modes[mode['id']].architecture['shared'] == ['foundation', 'new-skill']
    assert (root / 'skills/new-skill/SKILL.md').read_bytes() == (source / 'SKILL.md').read_bytes()
