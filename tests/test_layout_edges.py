"""Minimal open-protocol increment: optional layout and richer edge semantics.

Independent regression tests for architecture.layout and the optional edge
fields condition / sourceHandle / targetHandle. These tests never inspect or
mutate real business files; every environment is built under tmp_path.
"""
from __future__ import annotations

import copy
from pathlib import Path

import pytest
import yaml

from asl_harness import management
from asl_harness.map_schema import (
    architecture_value,
    place_skills,
    prune_architecture,
)
from asl_harness.workspace import HarnessError, Workspace

ALLOWED = {'creator', 'foundation'}


def shared_architecture() -> dict:
    """foundation is a shared capability, compose owns creator."""
    return {
        'nodes': [],
        'shared': ['foundation'],
        'paradigms': [
            {
                'id': 'compose',
                'title': '材料成稿',
                'description': '根据已有资料组织文章，缺少资料时调用通用检索。',
                'skills': ['creator'],
                'edges': [],
            }
        ],
    }


def two_member_architecture() -> dict:
    return {
        'nodes': [],
        'shared': [],
        'paradigms': [
            {
                'id': 'compose',
                'title': '材料成稿',
                'description': '根据已有资料组织文章。',
                'skills': ['creator', 'foundation'],
                'edges': [],
            }
        ],
    }


# --- optional edge fields -------------------------------------------------


def test_edges_accept_optional_condition_and_handles_without_losing_data():
    value = two_member_architecture()
    value['paradigms'][0]['edges'] = [
        {
            'from': 'foundation',
            'to': 'creator',
            'label': '素材',
            'condition': '当已有素材不足以支撑结论时',
            'sourceHandle': 'bottom',
            'targetHandle': 'left',
        },
        {'from': 'creator', 'to': 'foundation', 'label': '补充依据'},
    ]
    assert architecture_value(value, ALLOWED) == value


def test_edges_reject_empty_overlong_or_non_text_conditions():
    for condition in ('', '   ', 'x' * 161, 7, ['当需要时']):
        value = two_member_architecture()
        value['paradigms'][0]['edges'] = [
            {'from': 'foundation', 'to': 'creator', 'label': '素材', 'condition': condition}
        ]
        with pytest.raises(ValueError):
            architecture_value(value, ALLOWED)


def test_edges_reject_unknown_handles_and_unknown_fields():
    bad_edges = [
        {'from': 'foundation', 'to': 'creator', 'label': '素材', 'sourceHandle': 'middle'},
        {'from': 'foundation', 'to': 'creator', 'label': '素材', 'targetHandle': 'UP'},
        {'from': 'foundation', 'to': 'creator', 'label': '素材', 'targetHandle': 3},
        {'from': 'foundation', 'to': 'creator', 'label': '素材', 'execution': 'run()'},
        {'from': 'foundation', 'to': 'creator', 'label': '素材', 'style': {}},
    ]
    for edge in bad_edges:
        value = two_member_architecture()
        value['paradigms'][0]['edges'] = [edge]
        with pytest.raises(ValueError):
            architecture_value(value, ALLOWED)


def test_cycles_stay_valid_and_ordered_pairs_stay_unique():
    value = two_member_architecture()
    value['paradigms'][0]['edges'] = [
        {'from': 'foundation', 'to': 'creator', 'label': '素材', 'condition': '资料不足时'},
        {'from': 'creator', 'to': 'foundation', 'label': '反馈'},
    ]
    assert architecture_value(value, ALLOWED) == value
    value['paradigms'][0]['edges'].append(
        {'from': 'foundation', 'to': 'creator', 'label': '重复'}
    )
    with pytest.raises(ValueError, match='重复'):
        architecture_value(value, ALLOWED)


# --- optional layout ------------------------------------------------------


def test_layout_round_trips_for_paradigm_and_shared_contexts():
    value = shared_architecture()
    value['layout'] = {
        'compose': {'creator': {'x': 120, 'y': -40.5}},
        'shared': {'foundation': {'x': 0, 'y': 0}},
    }
    assert architecture_value(value, ALLOWED) == value


def test_layout_rejects_unknown_contexts_and_foreign_members():
    bad_layouts = [
        {'missing': {'creator': {'x': 0, 'y': 0}}},
        {'compose': {'foundation': {'x': 0, 'y': 0}}},
        {'shared': {'creator': {'x': 0, 'y': 0}}},
        ['compose'],
    ]
    for layout in bad_layouts:
        value = shared_architecture()
        value['layout'] = layout
        with pytest.raises(ValueError):
            architecture_value(value, ALLOWED)


def test_layout_coordinates_must_be_finite_bounded_numbers():
    bad_points = [
        {'x': True, 'y': 0},
        {'x': 0, 'y': '1'},
        {'x': float('inf'), 'y': 0},
        {'x': float('nan'), 'y': 0},
        {'x': 100001, 'y': 0},
        {'x': 0, 'y': -100001},
        {'x': 0},
        {'x': 0, 'y': 0, 'z': 0},
    ]
    for point in bad_points:
        value = shared_architecture()
        value['layout'] = {'compose': {'creator': point}}
        with pytest.raises(ValueError):
            architecture_value(value, ALLOWED)


def test_legacy_architecture_without_optional_fields_is_read_unchanged():
    value = {'nodes': [{'skill': 'creator'}], 'edges': [{'from': 'foundation', 'to': 'creator'}]}
    assert architecture_value(value, ALLOWED) == value
    with pytest.raises(ValueError):
        architecture_value({**value, 'layout': {'compose': {}}}, ALLOWED)
    with pytest.raises(ValueError):
        architecture_value({**value, 'scheduler': {}}, ALLOWED)


def test_top_level_unknown_field_is_rejected():
    with pytest.raises(ValueError):
        architecture_value({**shared_architecture(), 'executionOrder': []}, ALLOWED)


# --- prune and placement --------------------------------------------------


def test_prune_removes_layout_for_dropped_contexts_and_members():
    value = {
        'nodes': [{'skill': 'creator'}, {'skill': 'foundation'}, {'skill': 'extra'}],
        'shared': ['extra'],
        'paradigms': [
            {
                'id': 'compose',
                'title': '材料成稿',
                'description': '说明。',
                'skills': ['creator', 'foundation'],
                'edges': [{'from': 'creator', 'to': 'foundation', 'label': '参考'}],
            },
            {
                'id': 'review',
                'title': '复核',
                'description': '说明。',
                'skills': ['extra'],
                'edges': [],
            },
        ],
        'layout': {
            'compose': {'creator': {'x': 1, 'y': 1}, 'foundation': {'x': 2, 'y': 2}},
            'shared': {'extra': {'x': 3, 'y': 3}},
            'review': {'extra': {'x': 4, 'y': 4}},
        },
    }
    before = copy.deepcopy(value)

    pruned = prune_architecture(value, {'creator', 'extra'})

    assert value == before  # real business data is never mutated
    assert pruned['layout'] == {
        'compose': {'creator': {'x': 1, 'y': 1}},
        'shared': {'extra': {'x': 3, 'y': 3}},
        'review': {'extra': {'x': 4, 'y': 4}},
    }
    assert pruned['nodes'] == [{'skill': 'creator'}, {'skill': 'extra'}]
    assert pruned['paradigms'][0]['edges'] == []
    # Pruning is not semantic repair: this fixture intentionally lists extra in
    # both shared and review. It must remain rejected, not silently reassigned.
    with pytest.raises(ValueError, match='通用技能只放 shared'):
        architecture_value(pruned, {'creator', 'extra'})


def test_prune_drops_memberless_paradigm_layout_context():
    value = {
        'nodes': [{'skill': 'creator'}, {'skill': 'extra'}],
        'shared': ['extra'],
        'paradigms': [
            {
                'id': 'compose',
                'title': '材料成稿',
                'description': '说明。',
                'skills': ['creator'],
                'edges': [],
            },
            {
                'id': 'review',
                'title': '复核',
                'description': '说明。',
                'skills': ['extra'],
                'edges': [],
            },
        ],
        'layout': {
            'compose': {'creator': {'x': 1, 'y': 1}},
            'shared': {'extra': {'x': 3, 'y': 3}},
            'review': {'extra': {'x': 4, 'y': 4}},
        },
    }

    pruned = prune_architecture(value, {'creator'})

    assert pruned['layout'] == {'compose': {'creator': {'x': 1, 'y': 1}}}
    assert [p['id'] for p in pruned['paradigms']] == ['compose']
    assert architecture_value(pruned, {'creator'}) == pruned


def test_place_skills_never_invents_layout_coordinates():
    value = shared_architecture()
    value['layout'] = {'compose': {'creator': {'x': 1, 'y': 1}}}
    placed = place_skills(value, ['new-skill'], 'compose')
    assert placed['layout'] == value['layout']
    assert 'new-skill' not in placed['layout']['compose']
    legacy = place_skills(shared_architecture(), ['new-skill'], 'shared')
    assert 'layout' not in legacy


# --- environment round trip and guide contract ----------------------------


def test_mode_save_round_trips_layout_and_edge_semantics(tmp_path: Path):
    from test_mode_only import _environment

    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    value = {
        'nodes': [],
        'shared': [],
        'paradigms': [
            {
                'id': 'compose',
                'title': '材料成稿',
                'description': '根据已有资料组织文章，缺少资料时调用通用检索。',
                'skills': ['creator', 'foundation'],
                'edges': [
                    {
                        'from': 'creator',
                        'to': 'foundation',
                        'label': '参考',
                        'condition': '当需要引用既有素材时',
                        'sourceHandle': 'right',
                        'targetHandle': 'top',
                    }
                ],
            }
        ],
        'layout': {
            'compose': {
                'creator': {'x': 12.5, 'y': -8},
                'foundation': {'x': 0, 'y': 0},
            }
        },
    }
    management.edit(
        root,
        {
            'operation': 'mode.save',
            'id': mode['id'],
            'expected': mode['fingerprint'],
            'skills': mode['roots'],
            'document': mode['document'],
            'architecture': value,
        },
    )

    assert management.catalog(root)['modes'][0]['architecture'] == value
    assert Workspace.open(root).modes[mode['id']].architecture == value
    stored = yaml.safe_load((root / 'modes/creator-studio/mode.yaml').read_text(encoding='utf-8'))
    assert stored['spec']['architecture']['layout'] == value['layout']
    assert stored['spec']['architecture']['paradigms'][0]['edges'][0]['condition'] == '当需要引用既有素材时'


def test_invalid_layout_is_rejected_before_any_file_is_written(tmp_path: Path):
    from test_mode_only import _environment

    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    path = root / 'modes/creator-studio/mode.yaml'
    before = path.read_bytes()
    with pytest.raises(HarnessError):
        management.edit(
            root,
            {
                'operation': 'mode.save',
                'id': mode['id'],
                'expected': mode['fingerprint'],
                'skills': mode['roots'],
                'document': mode['document'],
                'architecture': {**shared_architecture(), 'layout': {'compose': {'creator': {'x': 1e9, 'y': 0}}}},
            },
        )
    assert path.read_bytes() == before


def test_environment_guide_documents_optional_layout_and_edge_fields(tmp_path: Path):
    from test_mode_only import _environment

    root = _environment(tmp_path)
    guide = management.editing_guide(root, 'creator-studio')['document']
    assert 'spec.architecture' in guide
    assert '不要求操作步骤' in guide
    assert 'layout' in guide
    assert 'condition' in guide
    assert 'sourceHandle' in guide and 'targetHandle' in guide
    assert 'top' in guide and 'bottom' in guide
    assert '100000' in guide
    assert '不被执行' in guide
    assert '不需要填写 layout' not in guide
