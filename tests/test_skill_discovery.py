from asl_harness.discovery import scan_skills
from asl_harness.discovery import unpack_skills
from asl_harness.discovery import inspect_skill
from asl_harness.workspace import HarnessError
import zipfile
import pytest


def test_scan_finds_standard_skills_and_reports_invalid_ones(tmp_path):
    for name, text in {"good": "---\nname: good\ndescription: A useful skill\n---\n# Good\n",
                       "bad": "not a skill"}.items():
        path = tmp_path / name
        path.mkdir()
        (path / "SKILL.md").write_text(text, encoding="utf-8")
    report = scan_skills([tmp_path, tmp_path, tmp_path / "missing"])
    assert [s["id"] for s in report["skills"]] == ["good"]
    assert report["skills"][0]["source"] == str(tmp_path / "good")
    assert len(report["issues"]) == 2


def test_unpack_does_not_allow_zip_escape_or_execute_code(tmp_path):
    archive = tmp_path / "repo.zip"
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("repo/skill/SKILL.md", "---\nname: safe\ndescription: test\n---\n# Safe")
        z.writestr("repo/skill/install.ps1", "throw 'must not run'")
    report = unpack_skills(archive, tmp_path / "content")
    assert report["skills"][0]["id"] == "safe"
    assert report["repositoryFiles"] == ["skill/SKILL.md", "skill/install.ps1"]
    assert (tmp_path / "content/skill/SKILL.md").is_file()
    with zipfile.ZipFile(archive, "w") as z:
        z.writestr("../escape.txt", "bad")
    with pytest.raises(HarnessError):
        unpack_skills(archive, tmp_path / "blocked")
    assert not (tmp_path / "escape.txt").exists()


def test_inspection_distinguishes_bundled_files_from_shared_repository_paths(tmp_path):
    skill = tmp_path / "skills/research"
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text("---\nname: research\ndescription: Research\n---\nRead [the shared setup](../../setup.md).", encoding="utf-8")
    (skill / "package.json").write_text('{"dependencies":{"example":"1"},"scripts":{"postinstall":"do not execute"}}', encoding="utf-8")
    result = inspect_skill(skill)
    assert result["status"] == "needs-review"
    assert any("../../setup.md" in reason for reason in result["reasons"])
    assert result["dependencies"][0]["kind"] == "Node.js"
    (skill / "SKILL.md").write_text("---\nname: research\ndescription: Research\n---\nRead [guide](guide.md).", encoding="utf-8")
    (skill / "guide.md").write_text("A complete local guide.", encoding="utf-8")
    # Dependency declarations are displayed, never executed or mistaken for successful setup.
    assert inspect_skill(skill)["status"] == "needs-review"


def test_declared_skill_dependencies_and_setup_instructions_are_review_clues(tmp_path):
    skill = tmp_path / "skill"
    skill.mkdir()
    (skill / "SKILL.md").write_text("---\nname: research\ndescription: Research\nmetadata:\n  asl:\n    requires: [reader]\n---\n# Research\n", encoding="utf-8")
    found = scan_skills([tmp_path])["skills"][0]
    assert found["inspection"]["status"] == "needs-review"
    assert any("其他技能依赖" in value for value in found["inspection"]["reasons"])
    (skill / "SKILL.md").write_text("---\nname: research\ndescription: Research\n---\n```bash\npip install example\n```", encoding="utf-8")
    assert any("终端命令" in value for value in inspect_skill(skill)["reasons"])
