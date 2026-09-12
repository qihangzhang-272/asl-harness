from pathlib import Path
import json
import os
import subprocess
import sys

import pytest

from asl_harness import management
from asl_harness.workspace import HarnessError, Workspace
from test_mode_only import _environment, _mode


def test_complete_skill_file_read_edit_and_stale_protection(tmp_path):
    root = _environment(tmp_path)
    script = root / 'skills/creator/scripts/main.py'
    script.parent.mkdir()
    script.write_bytes(b'print(1)\n')
    data = management.skill_files(root, 'creator', 'scripts/main.py')
    assert data['document'] == 'print(1)\n'
    assert any(f['path'] == 'scripts/main.py' for f in data['files'])
    request = {'operation': 'skill.file.save', 'id': 'creator', 'file': 'scripts/main.py',
               'document': 'print(2)\n', 'expected': data['fingerprint']}
    management.edit(root, request, check=True)
    assert script.read_text() == 'print(1)\n'
    management.edit(root, request)
    assert script.read_text() == 'print(2)\n'
    with pytest.raises(HarnessError, match='刷新'):
        management.edit(root, request)
    for path in ('../SOURCE.md', '/etc/passwd', '.env', 'scripts/../../PROFILE.md'):
        with pytest.raises(HarnessError):
            management.skill_files(root, 'creator', path)


def test_invalid_skill_file_edit_never_overwrites_original(tmp_path):
    root = _environment(tmp_path)
    data = management.skill_files(root, 'creator')
    request = {'operation': 'skill.file.save', 'id': 'creator', 'file': 'SKILL.md',
               'document': 'Not valid skill metadata', 'expected': data['fingerprint']}
    with pytest.raises(HarnessError):
        management.edit(root, request)
    assert (root / 'skills/creator/SKILL.md').read_text() == data['document']


def test_file_editor_preserves_windows_line_endings(tmp_path):
    root = _environment(tmp_path)
    path = root / 'skills/creator/example.txt'
    path.write_bytes(b'one\r\ntwo\r\n')
    data = management.skill_files(root, 'creator', 'example.txt')
    management.edit(root, {'operation': 'skill.file.save', 'id': 'creator', 'file': 'example.txt',
                          'document': 'one\ntwo\nthree\n', 'expected': data['fingerprint']})
    assert path.read_bytes() == b'one\r\ntwo\r\nthree\r\n'


def test_packaged_guide_names_its_own_core_not_an_old_global_cli(tmp_path, monkeypatch):
    root = _environment(tmp_path)
    monkeypatch.setattr(management.sys, 'frozen', True, raising=False)
    monkeypatch.setattr(management.sys, 'executable', 'C:/ASL Workspace/resources/core/asl-harness.exe')
    guide = management.editing_guide(root, 'creator-studio')['document']
    assert '"C:/ASL Workspace/resources/core/asl-harness.exe" environment.catalog' in guide
    assert '不要误用电脑上旧版本' in guide


def test_map_schema_is_editable_portable_and_rejects_unsafe_fields(tmp_path):
    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    request = {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
               'document': mode['document'], 'skills': mode['roots'],
               'capabilities': [{'title': '探索', 'skills': ['creator'], 'icon': '🔎', 'color': '#007AFF'}]}
    management.edit(root, request)
    current = management.catalog(root)['modes'][0]
    assert current['capabilities'][0]['icon'] == '🔎'
    request['expected'] = current['fingerprint']
    with pytest.raises(HarnessError):
        management.edit(root, {**request, 'presentation': {'layout': 'tree'}})
    for icon in ('<svg onload="alert(1)"/>', '<svg><script>1</script></svg>', '<svg><image href="https://evil"/></svg>'):
        with pytest.raises(HarnessError):
            management.edit(root, {**request, 'capabilities': [{'title': '探索', 'skills': ['creator'], 'icon': icon}]})
    request['capabilities'][0]['icon'] = '<svg viewBox="0 0 24 24"><path d="M2 2 L20 20" stroke="currentColor"/></svg>'
    management.edit(root, request)


def test_mode_architecture_is_local_editable_and_portable_without_process_fields(tmp_path):
    from asl_harness.portable import export_pack, import_pack
    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    architecture = {'nodes': [
        {'skill': 'foundation', 'title': '内容积累', 'icon': '🧠', 'color': '#007AFF'},
        {'skill': 'creator', 'note': '本地沉淀的表达经验'}],
        'edges': [{'from': 'foundation', 'to': 'creator', 'label': '参考'},
                  {'from': 'creator', 'to': 'foundation'}]}
    request = {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
               'document': mode['document'], 'skills': mode['roots'], 'architecture': architecture}
    management.edit(root, request, check=True)
    assert management.catalog(root)['modes'][0].get('architecture') is None
    management.edit(root, request)
    assert management.catalog(root)['modes'][0]['architecture'] == architecture
    assert Workspace.open(root).modes[mode['id']].architecture == architecture
    pack = tmp_path / 'architecture.zip'
    export_pack(root, mode['id'], pack)
    target = tmp_path / 'imported'
    import_pack(pack, target)
    assert management.catalog(target)['modes'][0]['architecture'] == architecture
    guide = management.editing_guide(root, mode['id'])['document']
    assert 'spec.architecture' in guide and '不要求操作步骤' in guide
    mode = management.catalog(root)['modes'][0]
    management.edit(root, {**request, 'expected': mode['fingerprint'], 'architecture': None})
    assert management.catalog(root)['modes'][0]['architecture'] is None
    assert (root / 'skills/creator/SKILL.md').exists()


def test_architecture_rejects_only_structural_errors_and_prunes_removed_references(tmp_path):
    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    request = {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
               'document': mode['document'], 'skills': mode['roots']}
    invalid = [
        {'nodes': [{'skill': 'outside'}]},
        {'nodes': [{'skill': 'creator', 'parent': 'foundation'}]},
        {'nodes': [{'title': '非技能节点'}]},
        {'nodes': [{'skill': 'creator'}, {'skill': 'creator'}]},
        {'edges': [{'from': 'creator', 'to': 'missing'}]},
        {'nodes': [{'skill': 'creator', 'script': 'run()'}]},
        {'nodes': [{'skill': 'creator', 'icon': '<svg onload="bad()"/>'}]},
    ]
    for value in invalid:
        with pytest.raises(HarnessError, match='架构|SVG'):
            management.edit(root, {**request, 'architecture': value})
    architecture = {'nodes': [{'skill': 'creator'}, {'skill': 'foundation'}],
                    'edges': [{'from': 'creator', 'to': 'foundation'}]}
    management.edit(root, {**request, 'architecture': architecture})
    mode = management.catalog(root)['modes'][0]
    management.edit(root, {**request, 'expected': mode['fingerprint'], 'skills': ['foundation']})
    assert management.catalog(root)['modes'][0]['architecture'] == {'nodes': [{'skill': 'foundation'}], 'edges': []}
    assert (root / 'skills/creator/SKILL.md').exists()


def test_architecture_edges_reference_mode_skills_without_redeclaring_nodes(tmp_path):
    root = _environment(tmp_path)
    mode = management.catalog(root)['modes'][0]
    management.edit(root, {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
        'document': mode['document'], 'skills': mode['roots'],
        'architecture': {'edges': [{'from': 'foundation', 'to': 'creator'}]}})
    assert management.catalog(root)['modes'][0]['architecture'] == {
        'nodes': [], 'edges': [{'from': 'foundation', 'to': 'creator'}]}


def test_cli_saves_utf8_input_even_when_host_stdio_is_ascii(tmp_path):
    root = _environment(tmp_path)
    document = "# 中文模式验收\n\n包含配图、研究与表达 🎨。\n"
    result = subprocess.run(
        [sys.executable, "-m", "asl_harness.commands", "environment.edit", "--workspace", str(root)],
        input=json.dumps({"operation": "mode.save", "id": "unicode-mode", "document": document,
                          "skills": ["foundation"]}, ensure_ascii=False).encode("utf-8"),
        capture_output=True,
        env={**os.environ, "PYTHONPATH": str(Path(__file__).resolve().parents[1] / "src"),
             "PYTHONIOENCODING": "ascii:surrogateescape", "PYTHONUTF8": "0"},
    )
    assert result.returncode == 0, result.stdout.decode("utf-8")
    assert (root / "modes/unicode-mode/MODE.md").read_text(encoding="utf-8") == document


def test_catalog_uses_real_modes_and_reports_membership(tmp_path):
    root = _environment(tmp_path)
    report = management.catalog(root)
    assert report["modes"][0]["roots"] == ["creator"]
    assert report["skills"][0]["usedBy"] == ["creator-studio"]
    assert report["skills"][0]["fingerprint"]
    assert report["modes"][0]["title"] == "creator-studio"


def test_mode_edit_previews_then_updates_without_changing_skills(tmp_path):
    root = _environment(tmp_path)
    previous = (root / "skills/creator/SKILL.md").read_bytes()
    request = {
        "operation": "mode.save",
        "id": "analysis",
        "document": "# 分析\n\n研究产品。\n",
        "skills": ["foundation"],
    }
    preview = management.edit(root, request, check=True)
    assert not (root / "modes/analysis").exists()
    assert preview["changedPaths"] == ["modes/analysis", "WORKSPACE.md"]
    result = management.edit(root, request)
    assert result["changed"]
    assert Workspace.open(root).modes["analysis"].skill_roots == ("foundation",)
    assert (root / "skills/creator/SKILL.md").read_bytes() == previous


def test_mode_update_requires_fresh_fingerprint(tmp_path):
    root = _environment(tmp_path)
    mode = management.catalog(root)["modes"][0]
    request = {
        "operation": "mode.save",
        "id": mode["id"],
        "document": "# 新名字\n\n说明。",
        "skills": ["foundation"],
        "expected": mode["fingerprint"],
    }
    (root / "modes/creator-studio/MODE.md").write_text(
        "# 别的任务修改\n", encoding="utf-8"
    )
    with pytest.raises(HarnessError, match="已被修改"):
        management.edit(root, request)


def test_skill_edit_preserves_assets_and_reports_all_modes(tmp_path):
    root = _environment(tmp_path)
    _mode(root, "other", ("foundation",))
    asset = root / "skills/foundation/example.txt"
    asset.write_text("keep", encoding="utf-8")
    skill = next(
        s for s in management.catalog(root)["skills"] if s["id"] == "foundation"
    )
    text = (
        (root / "skills/foundation/SKILL.md")
        .read_text(encoding="utf-8")
        .replace("完整执行", "认真执行")
    )
    request = {
        "operation": "skill.save",
        "id": "foundation",
        "document": text,
        "expected": skill["fingerprint"],
    }
    preview = management.edit(root, request, check=True)
    assert preview["affectedModes"] == ["creator-studio", "other"]
    management.edit(root, request)
    assert asset.read_text() == "keep"


def test_invalid_skill_edit_rolls_back(tmp_path):
    root = _environment(tmp_path)
    skill = next(s for s in management.catalog(root)["skills"] if s["id"] == "creator")
    original = (root / "skills/creator/SKILL.md").read_bytes()
    with pytest.raises(HarnessError):
        management.edit(
            root,
            {
                "operation": "skill.save",
                "id": "creator",
                "document": "invalid",
                "expected": skill["fingerprint"],
            },
        )
    assert (root / "skills/creator/SKILL.md").read_bytes() == original


def test_archive_is_explicit_and_preserves_full_mode(tmp_path):
    root = _environment(tmp_path)
    _mode(root, "other", ("foundation",))
    mode = next(m for m in management.catalog(root)["modes"] if m["id"] == "other")
    note = root / "modes/other/notes.md"
    note.write_text("personal note", encoding="utf-8")
    # Refresh the fingerprint after adding the note.
    mode = next(m for m in management.catalog(root)["modes"] if m["id"] == "other")
    request = {
        "operation": "mode.archive",
        "id": "other",
        "expected": mode["fingerprint"],
    }
    preview = management.edit(root, request, check=True)
    assert note.exists()
    result = management.edit(root, request)
    assert not (root / "modes/other").exists()
    assert (Path(result["archivePath"]) / "notes.md").read_text() == "personal note"


def test_referenced_skill_cannot_disappear(tmp_path):
    root = _environment(tmp_path)
    skill = next(
        s for s in management.catalog(root)["skills"] if s["id"] == "foundation"
    )
    with pytest.raises(HarnessError, match="仍被"):
        management.edit(
            root,
            {
                "operation": "skill.archive",
                "id": "foundation",
                "expected": skill["fingerprint"],
            },
        )


def test_local_skill_import_preserves_source_and_assets(tmp_path):
    root = _environment(tmp_path)
    source = _environment(tmp_path / "source") / "skills/foundation"
    (source / "manual.txt").write_text("complete package", encoding="utf-8")
    request = {
        "operation": "skill.import",
        "id": "foundation",
        "source": str(source),
        "mode": "creator-studio",
        "expected": next(
            s for s in management.catalog(root)["skills"] if s["id"] == "foundation"
        )["fingerprint"],
    }
    preview = management.edit(root, request, check=True)
    assert preview["affectedModes"] == ["creator-studio"]
    management.edit(root, request)
    assert (root / "skills/foundation/manual.txt").read_text() == "complete package"


def test_standard_skill_import_does_not_rewrite_upstream_instructions(tmp_path):
    root = _environment(tmp_path)
    source = tmp_path / "ordinary"
    source.mkdir()
    text = "---\nname: ordinary\ndescription: >-\n  A standard skill.\n---\n# 普通技能\n\nRead references first.\n"
    (source / "SKILL.md").write_text(text, encoding="utf-8")
    (source / "script.js").write_text("console.log('原脚本')", encoding="utf-8")
    request = {"operation": "skill.import", "id": "ordinary", "source": str(source), "mode": "creator-studio"}
    management.edit(root, request, check=True)
    assert not (root / "skills/ordinary").exists()
    management.edit(root, request)
    assert (root / "skills/ordinary/SKILL.md").read_text(encoding="utf-8") == text
    assert (root / "skills/ordinary/script.js").read_bytes() == (source / "script.js").read_bytes()
    assert not (source / "SOURCE.md").exists()
    assert source.as_uri() in (root / "skills/ordinary/SOURCE.md").read_text(encoding="utf-8")


def test_general_guide_supports_empty_environment_without_creating_files(tmp_path):
    root = tmp_path / 'new-environment'
    result = management.editing_guide(root)
    assert not root.exists()
    assert str(root.resolve()) in result['document']
    for text in ['工作目的', '不是一个人', 'ModeProjection', 'SOURCE.md', 'PROFILE.md', 'workspace.validate']:
        assert text in result['document']


def test_general_guide_describes_all_existing_modes_and_reports_invalid_content(tmp_path):
    root = _environment(tmp_path)
    (root / 'modes/creator-studio/MODE.md').write_text('# 长说明\n\n' + '重复原文' * 2000, encoding='utf-8')
    result = management.editing_guide(root)
    assert 'creator' in result['document']
    assert '一个完整 Skill 一个节点' in result['document']
    assert str(root / 'modes/creator-studio/MODE.md') in result['document']
    assert '重复原文' not in result['document']
    (root / 'modes/creator-studio/mode.yaml').write_text('broken: true', encoding='utf-8')
    result = management.editing_guide(root)
    assert '需要修正' in result['document']


def test_mode_categories_persist_and_do_not_change_membership(tmp_path):
    root = _environment(tmp_path)
    mode = management.catalog(root)["modes"][0]
    groups = [{"title": "我的研究", "skills": ["foundation"]}, {"title": "待培养", "skills": []}]
    request = {"operation": "mode.save", "id": mode["id"], "expected": mode["fingerprint"],
               "document": mode["document"], "skills": mode["roots"], "capabilities": groups}
    management.edit(root, request)
    mode = management.catalog(root)["modes"][0]
    assert mode["capabilities"] == groups
    assert mode["roots"] == ["creator"]
    # A normal Mode edit must not discard the user's map.
    request.pop("capabilities")
    request["expected"] = mode["fingerprint"]
    management.edit(root, request)
    assert management.catalog(root)["modes"][0]["capabilities"] == groups
    request["expected"] = management.catalog(root)["modes"][0]["fingerprint"]
    request["capabilities"] = [{"title": "重复", "skills": ["creator"]}, {"title": "重复", "skills": []}]
    with pytest.raises(HarnessError):
        management.edit(root, request)


def test_categories_travel_with_exported_mode_and_skill_import(tmp_path):
    from asl_harness.portable import export_pack, import_pack

    root = _environment(tmp_path)
    mode = management.catalog(root)["modes"][0]
    groups = [{"title": "我的分类", "skills": ["creator"]}, {"title": "待整理", "skills": []}]
    management.edit(root, {"operation": "mode.save", "id": mode["id"], "expected": mode["fingerprint"],
                           "document": mode["document"], "skills": mode["roots"], "capabilities": groups})
    source = tmp_path / "external"
    source.mkdir()
    (source / "SKILL.md").write_text("---\nname: external\ndescription: External skill\n---\n# External\n", encoding="utf-8")
    (source / "SOURCE.md").write_text("# Original source\n\n- Author: preserved\n", encoding="utf-8")
    origin = "https://github.com/example/skills/tree/" + "a" * 40 + "/external"
    management.edit(root, {"operation": "skill.import", "id": "external", "source": str(source),
                           "sourceOrigin": origin, "mode": mode["id"], "category": "待整理"})
    groups[1]["skills"] = ["external"]
    assert management.catalog(root)["modes"][0]["capabilities"] == groups
    assert "Author: preserved" in (root / "skills/external/SOURCE.md").read_text(encoding="utf-8")
    assert origin in (root / "skills/external/SOURCE.md").read_text(encoding="utf-8")
    package = tmp_path / "mode.zip"
    export_pack(root, mode["id"], package)
    target = tmp_path / "received"
    import_pack(package, target)
    assert management.catalog(target)["modes"][0]["capabilities"] == groups


def test_unknown_operation_and_path_escape_are_rejected(tmp_path):
    root = _environment(tmp_path)
    for request in [
        {"operation": "exec", "id": "x"},
        {"operation": "mode.save", "id": "../x"},
    ]:
        with pytest.raises(HarnessError):
            management.edit(root, request)


def test_changed_import_source_requires_another_preview(tmp_path):
    root = _environment(tmp_path)
    source = _environment(tmp_path / "source") / "skills/foundation"
    request = {
        "operation": "skill.import",
        "id": "foundation",
        "source": str(source),
        "expected": next(
            s for s in management.catalog(root)["skills"] if s["id"] == "foundation"
        )["fingerprint"],
    }
    preview = management.edit(root, request, check=True)
    (source / "extra.md").write_text("changed after preview", encoding="utf-8")
    with pytest.raises(HarnessError, match="导入来源已变化"):
        management.edit(
            root, {**request, "expectedSource": preview["sourceFingerprint"]}
        )
    assert not (root / "skills/foundation/extra.md").exists()


def test_linked_authored_file_is_not_edited_in_place(tmp_path):
    root = _environment(tmp_path)
    document = root / "skills/foundation/SKILL.md"
    origin = root / "skills/foundation/original.md"
    origin.write_bytes(document.read_bytes())
    document.unlink()
    try:
        document.symlink_to(origin)
    except OSError:
        pytest.skip("symlinks unavailable")
    skill = next(
        s for s in management.catalog(root)["skills"] if s["id"] == "foundation"
    )
    with pytest.raises(HarnessError, match="链接"):
        management.edit(
            root,
            {
                "operation": "skill.save",
                "id": "foundation",
                "document": origin.read_text(encoding="utf-8"),
                "expected": skill["fingerprint"],
            },
        )
