from asl_harness.adapters import project_mode, verify_mode_projection
from asl_harness.readiness import inspect_mode
from asl_harness.workspace import Workspace
from test_mode_only import _environment


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
