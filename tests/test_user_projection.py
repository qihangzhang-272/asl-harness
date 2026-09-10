from pathlib import Path

import pytest

from asl_harness import user_projection
from asl_harness.workspace import HarnessError, Workspace
from test_mode_only import _environment, _mode, _write


@pytest.mark.parametrize("host", ["codex-app", "claude-code"])
def test_user_sync_preserves_other_skills_and_instructions(tmp_path, host):
    workspace = Workspace.open(_environment(tmp_path))
    home = tmp_path / "home"
    paths = user_projection.locations(host, home=home, env={})
    _write(paths["instructions"], "# My instructions\nKeep this.\n")
    _write(paths["skills"] / "unrelated" / "SKILL.md", "untouched")
    before = user_projection.sync_user(workspace, "creator-studio", host, home=home, env={}, check=True)
    assert before["scope"] == "user"
    assert not (paths["skills"] / "creator").exists()
    result = user_projection.sync_user(workspace, "creator-studio", host, home=home, env={}, expected=before["fingerprint"])
    assert result["status"] == "synced"
    assert (paths["skills"] / "creator" / "SOURCE.md").is_file()
    assert (paths["skills"] / "unrelated" / "SKILL.md").read_text() == "untouched"
    assert paths["instructions"].read_text().startswith("# My instructions\nKeep this.")
    assert not user_projection.inspect_user(workspace, "creator-studio", host, home=home, env={})["needsSync"]


def test_user_sync_switches_only_managed_content_and_detects_modified_copy(tmp_path):
    root = _environment(tmp_path)
    _mode(root, "research", ("foundation",))
    workspace = Workspace.open(root)
    home = tmp_path / "home"
    user_projection.sync_user(workspace, "creator-studio", "claude-code", home=home, env={})
    paths = user_projection.locations("claude-code", home=home, env={})
    user_projection.sync_user(workspace, "research", "claude-code", home=home, env={})
    assert not (paths["skills"] / "creator").exists()
    _write(paths["skills"] / "foundation" / "SKILL.md", "user modified")
    preview = user_projection.sync_user(workspace, "research", "claude-code", home=home, env={}, check=True)
    assert preview["conflicts"]
    with pytest.raises(HarnessError):
        user_projection.sync_user(workspace, "research", "claude-code", home=home, env={})
    assert (paths["skills"] / "foundation" / "SKILL.md").read_text() == "user modified"


def test_user_sync_refuses_unmanaged_collision_and_stale_preview(tmp_path):
    root = _environment(tmp_path)
    workspace = Workspace.open(root)
    home = tmp_path / "home"
    before = user_projection.sync_user(workspace, "creator-studio", "codex-app", home=home, env={}, check=True)
    paths = user_projection.locations("codex-app", home=home, env={})
    _write(paths["skills"] / "creator" / "SKILL.md", "existing native skill")
    with pytest.raises(HarnessError):
        user_projection.sync_user(workspace, "creator-studio", "codex-app", home=home, env={}, expected=before["fingerprint"])
    assert (paths["skills"] / "creator" / "SKILL.md").read_text() == "existing native skill"


def test_native_user_paths_respect_host_configuration_without_moving_shared_skills(tmp_path):
    home = tmp_path / "home"
    custom = tmp_path / "custom"
    codex = user_projection.locations("codex-app", home=home, env={"CODEX_HOME": str(custom)})
    claude = user_projection.locations("claude-code", home=home, env={"CLAUDE_CONFIG_DIR": str(custom)})
    assert codex["skills"] == home / ".agents" / "skills"
    assert codex["instructions"] == custom / "AGENTS.md"
    assert claude["skills"] == custom / "skills"
    assert claude["instructions"] == custom / "CLAUDE.md"


def test_user_sync_rolls_back_if_instruction_write_fails(tmp_path, monkeypatch):
    workspace = Workspace.open(_environment(tmp_path))
    home = tmp_path / "home"
    paths = user_projection.locations("claude-code", home=home, env={})
    _write(paths["instructions"], "keep")
    original = user_projection._write_bytes_atomic
    def fail_instruction(path, data):
        if path == paths["instructions"]:
            raise OSError("simulated disk failure")
        original(path, data)
    monkeypatch.setattr(user_projection, "_write_bytes_atomic", fail_instruction)
    with pytest.raises(OSError):
        user_projection.sync_user(workspace, "creator-studio", "claude-code", home=home, env={})
    assert not (paths["skills"] / "creator").exists()
    assert paths["instructions"].read_text() == "keep"


def test_disable_user_mode_preserves_unmanaged_content(tmp_path):
    workspace = Workspace.open(_environment(tmp_path))
    home = tmp_path / "home"
    paths = user_projection.locations("codex-app", home=home, env={})
    _write(paths["instructions"], "# Keep my defaults\n")
    user_projection.sync_user(workspace, "creator-studio", "codex-app", home=home, env={})
    report = user_projection.sync_user(workspace, "creator-studio", "codex-app", home=home, env={}, remove=True)
    assert report["status"] == "removed"
    assert not (paths["skills"] / "creator").exists()
    assert paths["instructions"].read_text().strip() == "# Keep my defaults"


def test_user_can_choose_skill_directory_without_claiming_native_discovery(tmp_path):
    workspace = Workspace.open(_environment(tmp_path))
    home, selected = tmp_path / "home", tmp_path / "custom-skills"
    report = user_projection.sync_user(workspace, "creator-studio", "claude-code", home=home, env={}, skills_dir=selected)
    assert (selected / "creator" / "SKILL.md").is_file()
    assert report["discovery"] == "requires-connection"
    assert report["paths"]["instructions"] == str(home / ".claude" / "CLAUDE.md")
    with pytest.raises(HarnessError):
        user_projection.sync_user(workspace, "creator-studio", "claude-code", home=home, env={})
    user_projection.sync_user(workspace, "creator-studio", "claude-code", home=home, env={}, skills_dir=selected, remove=True)
    result = user_projection.sync_user(workspace, "creator-studio", "claude-code", home=home, env={})
    assert result["discovery"] == "native-directory"


def test_stop_clears_mode_instructions_even_when_copies_are_already_missing(tmp_path):
    workspace = Workspace.open(_environment(tmp_path))
    home = tmp_path / "home"
    paths = user_projection.locations("claude-code", home=home, env={})
    user_projection.sync_user(workspace, "creator-studio", "claude-code", home=home, env={})
    import shutil
    shutil.rmtree(paths["skills"])
    result = user_projection.sync_user(workspace, "creator-studio", "claude-code", home=home, env={}, remove=True)
    assert result["status"] == "removed"
    assert "ASL default Mode" not in paths["instructions"].read_text()
