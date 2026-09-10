from pathlib import Path
import json
import os
import subprocess
import sys

import pytest

from asl_harness import management
from asl_harness.workspace import HarnessError, Workspace
from test_mode_only import _environment, _mode


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
