import json
from pathlib import Path

from asl_harness import readiness
from asl_harness.workspace import Workspace
from test_mode_only import _environment, _write


def test_readiness_reports_missing_dependencies_without_running_skill_code(tmp_path, monkeypatch):
    root = _environment(tmp_path)
    skill = root / "skills" / "creator"
    _write(skill / "package.json", json.dumps({"engines": {"node": ">=22"}, "scripts": {"install": "DO NOT RUN"}}))
    _write(skill / ".mcp.json", json.dumps({"mcpServers": {"example": {"command": "missing-cli", "env": {"SECRET": "${EXAMPLE_TOKEN}"}}}}))
    monkeypatch.setattr(readiness.shutil, "which", lambda name: None)
    report = readiness.inspect_mode(Workspace.open(root), "creator-studio", "claude-code", home=tmp_path / "home", env={})
    assert any(check["kind"] == "binary" and check["name"] == "node" and check["status"] == "missing" for check in report["checks"])
    assert any(check["kind"] == "mcp" and check["name"] == "example" and check["status"] == "missing" for check in report["checks"])
    assert "DO NOT RUN" not in json.dumps(report)
    assert report["needsConfiguration"] is True


def test_readiness_distinguishes_declared_config_from_working_connection(tmp_path, monkeypatch):
    root = _environment(tmp_path)
    home = tmp_path / "home"
    _write(root / "skills" / "creator" / "agents" / "openai.yaml", "dependencies:\n  tools:\n    - type: mcp\n      value: example\n")
    _write(home / ".codex" / "config.toml", '[mcp_servers.example]\nurl="https://example.com/mcp"\n')
    report = readiness.inspect_mode(Workspace.open(root), "creator-studio", "codex-app", home=home, env={})
    item = next(c for c in report["checks"] if c["name"] == "example")
    assert item["status"] == "configured"
    assert item["verified"] is False


def test_setup_brief_carries_mode_full_skill_paths_and_machine_gaps_not_secrets(tmp_path):
    root = _environment(tmp_path)
    report = readiness.inspect_mode(Workspace.open(root), "creator-studio", "claude-code", home=tmp_path / "home", env={"PRIVATE_SECRET": "never-copy-this"})
    brief = readiness.setup_brief(Workspace.open(root), "creator-studio", report, scope="project", project=tmp_path / "project")
    assert str(root / "modes" / "creator-studio" / "MODE.md") in brief
    assert str(root / "skills" / "creator" / "SKILL.md") in brief
    assert str(root / "skills" / "foundation" / "SKILL.md") in brief
    assert "never-copy-this" not in brief
    assert "不能把文件存在或安装成功当成实际任务通过" in brief
    assert "密钥" in brief


def test_doctor_report_does_not_expose_free_text_or_mistake_warn_for_ok():
    result = readiness.doctor_summary({"web": {"status": "ok", "name": "网页", "message": "token=secret"}, "x": {"status": "warn", "name": "X"}})
    assert result[0]["status"] == "ok"
    assert result[1]["status"] == "warn"
    assert "secret" not in json.dumps(result)
