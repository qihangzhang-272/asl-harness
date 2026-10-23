from asl_harness.adapters import project_mode, verify_mode_projection
from asl_harness.readiness import inspect_mode
from asl_harness.workspace import Workspace
from test_mode_only import _environment


def test_windows_junction_output_is_not_decoded_as_the_process_locale(tmp_path, monkeypatch):
    from pathlib import Path
    from types import SimpleNamespace
    import asl_harness.adapters as adapters

    workspace = Workspace.open(_environment(tmp_path))
    monkeypatch.setattr(adapters.sys, "platform", "win32")

    def no_symlink(*args, **kwargs):
        raise OSError("Symbolic links are not available")

    def junction(command, **kwargs):
        assert command[:4] == ["cmd", "/c", "mklink", "/J"]
        assert not kwargs.get("text"), "mklink output is not consumed and must stay as bytes"
        return SimpleNamespace(returncode=1, stdout="中文路径".encode("utf-8"), stderr=b"")

    monkeypatch.setattr(Path, "symlink_to", no_symlink)
    monkeypatch.setattr(adapters.subprocess, "run", junction)
    skill_id = workspace.mode_skill_ids("creator-studio")[0]
    report = adapters._project_skill(workspace, tmp_path / "中文项目", "creator-studio",
                                     "workbuddy", skill_id, "isolated-fingerprint")
    assert report["projection"] == "copy"
    assert (tmp_path / "中文项目/.codebuddy/skills" / skill_id / "SKILL.md").is_file()


def test_workbuddy_uses_project_native_paths_without_user_config(tmp_path):
    workspace = Workspace.open(_environment(tmp_path))
    project = tmp_path / "中文项目"
    project_mode(workspace, project, "creator-studio", host_id="workbuddy")
    assert (project / ".codebuddy/CODEBUDDY.md").is_file()
    assert len(list((project / ".codebuddy/skills").glob("*/SKILL.md"))) == 2
    assert not (project / "AGENTS.md").exists()
    verify_mode_projection(workspace, project, "creator-studio", host_id="workbuddy")
    report = inspect_mode(workspace, "creator-studio", "workbuddy", project=project, home=tmp_path, env={})
    assert report["userPaths"] == {}
