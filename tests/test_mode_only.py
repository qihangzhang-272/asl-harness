from __future__ import annotations

import json
from pathlib import Path

import pytest

from asl_harness.adapters import HOST_LAYOUTS, project_mode, verify_mode_projection
from asl_harness.commands import main
from asl_harness.deepseek import PRESET_MARKER, export_preset
from asl_harness.workspace import HarnessError, Workspace


def _write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def _skill(root: Path, skill_id: str, requires: tuple[str, ...] = ()) -> None:
    dependency = ""
    if requires:
        values = "\n".join(f"      - {item}" for item in requires)
        dependency = f"metadata:\n  asl:\n    requires:\n{values}\n"
    _write(
        root / "skills" / skill_id / "SKILL.md",
        f"""---
name: {skill_id}
description: {skill_id} capability
{dependency}---
# {skill_id}

完整执行这个能力。

## 完成标准

- 交付可独立检查的结果。
""",
    )


def _mode(
    root: Path,
    mode_id: str,
    skills: tuple[str, ...],
    *,
    mutate: bool = False,
    permission_key: str = "mutateEnvironment",
) -> None:
    _write(
        root / "modes" / mode_id / "MODE.md",
        f"# {mode_id}\n\n这是一个覆盖长期工作的广域工作场。\n",
    )
    roots = "\n".join(f"    - {item}" for item in skills)
    _write(
        root / "modes" / mode_id / "mode.yaml",
        f"""apiVersion: asl-wep/v0.3.0-design
kind: ModeProjection
metadata:
  id: {mode_id}
spec:
  skills:
{roots}
  permissions:
    {permission_key}: {str(mutate).lower()}
""",
    )


def _environment(tmp_path: Path) -> Path:
    root = tmp_path / "personal-environment"
    _write(root / "WORKSPACE.md", "# 我的工作环境\n\n当前能力地图。\n")
    _write(root / "PROFILE.md", "# Profile\n\n偏好清楚、直接、低复杂度。\n")
    _skill(root, "foundation")
    _skill(root, "creator", ("foundation",))
    _mode(root, "creator-studio", ("creator",))
    _mode(root, "skill-foundry", ("foundation",), mutate=True)
    return root


def test_workspace_opens_mode_graph_and_ignores_cultivation_areas(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    _write(
        root / "candidates" / "untrusted" / "SKILL.md",
        "---\nname: untrusted\ndescription: no\n---\n## 完成标准\nno\n",
    )
    workspace = Workspace.open(root)

    assert list(workspace.skills) == ["creator", "foundation"]
    assert workspace.mode_skill_ids("creator-studio") == ("creator", "foundation")
    assert workspace.modes["skill-foundry"].mutate_environment is True
    assert workspace.summary()["environmentId"] == "personal-environment"


@pytest.mark.parametrize("legacy", ["workspace.yaml", "workflows", ".asl/runs"])
def test_workspace_rejects_legacy_active_surfaces(tmp_path: Path, legacy: str) -> None:
    root = _environment(tmp_path)
    path = root / legacy
    if path.suffix:
        _write(path, "legacy: true\n")
    else:
        path.mkdir(parents=True)

    with pytest.raises(HarnessError, match="legacy active surfaces") as captured:
        Workspace.open(root)
    assert captured.value.code == "LEGACY_LAYOUT_PRESENT"


def test_workspace_rejects_missing_and_cyclic_dependencies(tmp_path: Path) -> None:
    missing = _environment(tmp_path / "missing")
    _skill(missing, "creator", ("absent",))
    with pytest.raises(HarnessError) as captured:
        Workspace.open(missing)
    assert captured.value.code == "SKILL_DEPENDENCY_MISSING"

    cyclic = _environment(tmp_path / "cyclic")
    _skill(cyclic, "foundation", ("creator",))
    with pytest.raises(HarnessError) as captured:
        Workspace.open(cyclic)
    assert captured.value.code == "SKILL_DEPENDENCY_CYCLE"


def test_mode_requires_the_current_permission_name(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    _mode(
        root,
        "creator-studio",
        ("creator",),
        permission_key="mutateWorkspace",
    )
    with pytest.raises(HarnessError) as captured:
        Workspace.open(root)
    assert captured.value.code == "MODE_INVALID"


def test_source_fingerprint_detects_uncommitted_content_changes(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    workspace = Workspace.open(root)
    before = workspace.source_fingerprint("creator-studio")
    with (root / "skills" / "creator" / "SKILL.md").open("a", encoding="utf-8") as stream:
        stream.write("\n新增一条能力说明。\n")
    assert workspace.source_fingerprint("creator-studio") != before


def test_syncs_workspace_capability_view_without_replacing_user_text(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    workspace = Workspace.open(root)
    assert workspace.workspace_view_current() is False

    workspace.sync_workspace_view()

    refreshed = Workspace.open(root)
    assert refreshed.workspace_view_current() is True
    text = (root / "WORKSPACE.md").read_text(encoding="utf-8")
    assert text.startswith("# 我的工作环境")
    assert "`creator`：creator capability" in text
    assert "`creator-studio`：creator, foundation" in text
    assert "Candidates：无" in text


@pytest.mark.parametrize("host_id", sorted(HOST_LAYOUTS))
def test_projects_and_verifies_native_host_surfaces(tmp_path: Path, host_id: str) -> None:
    root = _environment(tmp_path)
    workspace = Workspace.open(root)
    project = tmp_path / f"project-{host_id}"
    custom = "# 用户自己的规则\n"
    instruction = project / HOST_LAYOUTS[host_id]["instructionFile"]
    _write(instruction, custom)

    manifest = project_mode(workspace, project, "creator-studio", host_id=host_id)

    assert manifest["mode"] == "creator-studio"
    assert manifest["permissions"] == {"mutateEnvironment": False}
    assert [item["skill"] for item in manifest["skillProjections"]] == [
        "creator",
        "foundation",
    ]
    for skill_id in ("creator", "foundation"):
        assert (project / HOST_LAYOUTS[host_id]["skillRoot"] / skill_id / "SKILL.md").is_file()
    text = instruction.read_text(encoding="utf-8")
    assert text.startswith(custom.strip())
    assert "ASL current Mode: creator-studio" in text
    assert "偏好清楚、直接、低复杂度" in text
    assert verify_mode_projection(
        workspace, project, "creator-studio", host_id=host_id
    ) == []


def test_switching_mode_removes_only_old_managed_skills(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    workspace = Workspace.open(root)
    project = tmp_path / "project"
    project_mode(workspace, project, "creator-studio", host_id="codex-app")

    project_mode(workspace, project, "skill-foundry", host_id="codex-app")

    skill_root = project / ".agents" / "skills"
    assert not (skill_root / "creator").exists()
    assert (skill_root / "foundation" / "SKILL.md").is_file()
    manifest = json.loads(
        (project / ".asl/host-projections/codex-app/current.json").read_text(
            encoding="utf-8"
        )
    )
    assert manifest["mode"] == "skill-foundry"
    assert manifest["permissions"] == {"mutateEnvironment": True}


def test_projection_refuses_user_owned_skill_collision(tmp_path: Path) -> None:
    workspace = Workspace.open(_environment(tmp_path))
    project = tmp_path / "project"
    _write(project / ".agents/skills/creator/SKILL.md", "user owned\n")

    with pytest.raises(HarnessError) as captured:
        project_mode(workspace, project, "creator-studio", host_id="codex-app")
    assert captured.value.code == "HOST_PROJECTION_COLLISION"
    assert (
        project / ".agents/skills/creator/SKILL.md"
    ).read_text(encoding="utf-8") == "user owned\n"


def test_verify_warns_when_environment_changes(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    workspace = Workspace.open(root)
    project = tmp_path / "project"
    project_mode(workspace, project, "creator-studio", host_id="claude-code")
    with (root / "PROFILE.md").open("a", encoding="utf-8") as stream:
        stream.write("\n新增明确偏好。\n")

    warnings = verify_mode_projection(
        workspace, project, "creator-studio", host_id="claude-code"
    )
    assert warnings == [
        "Environment content changed after projection; run host.project again."
    ]


def _deepseek_base(path: Path) -> Path:
    _write(
        path / "agent.cordis.yml",
        """- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: Base persona.
- id: skill-filesystem
  name: '@deepseek-ai/dsh-skill-filesystem'
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
  disabled: !!js process.platform === 'win32'
""",
    )
    _write(path / "preset.yml", "name: Base\ndescription: Known good base.\n")
    _write(path / "assets" / "keep.txt", "keep\n")
    return path


def test_exports_self_contained_deepseek_agent_preset(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    _write(root / "skills/creator/package.json", '{"private":true}\n')
    _write(root / "skills/creator/node_modules/heavy/index.js", "generated\n")
    _write(root / "skills/creator/__pycache__/cache.pyc", "generated\n")
    _write(root / "skills/creator/.env", "SECRET=do-not-copy\n")
    _write(root / "skills/creator/.env.example", "SECRET=placeholder\n")
    _write(root / "skills/creator/.git/config", "generated\n")
    workspace = Workspace.open(root)
    base = _deepseek_base(tmp_path / "standard-copy")
    output = tmp_path / ".dsh/.agent-presets/creator-studio"

    result = export_preset(workspace, "creator-studio", base, output)

    assert result["mode"] == "creator-studio"
    assert result["skills"] == ["creator", "foundation"]
    assert (output / "skills/creator/SKILL.md").is_file()
    assert (output / "skills/foundation/SKILL.md").is_file()
    assert (output / "skills/creator/package.json").is_file()
    assert (output / "skills/creator/.env.example").is_file()
    assert not (output / "skills/creator/node_modules").exists()
    assert not (output / "skills/creator/__pycache__").exists()
    assert not (output / "skills/creator/.env").exists()
    assert not (output / "skills/creator/.git").exists()
    assert (output / "assets/keep.txt").read_text(encoding="utf-8") == "keep\n"
    composition = (output / "agent.cordis.yml").read_text(encoding="utf-8")
    assert "ASL Mode creator-studio" in composition
    assert "includeDefaultRoots: false" in composition
    assert json.dumps(str(output / "skills")) in composition
    assert "- id: tool-bash" in composition
    assert "!!js process.platform" in composition
    assert "Generated by ASL Harness" in composition
    assert json.loads((output / PRESET_MARKER).read_text(encoding="utf-8"))["basePreset"] == str(base)

    with (root / "PROFILE.md").open("a", encoding="utf-8") as stream:
        stream.write("\n刷新。\n")
    refreshed = export_preset(workspace, "creator-studio", base, output)
    assert refreshed["sourceFingerprint"] != result["sourceFingerprint"]


def test_deepseek_export_refuses_unknown_output_and_malformed_base(tmp_path: Path) -> None:
    workspace = Workspace.open(_environment(tmp_path))
    base = _deepseek_base(tmp_path / "base")
    output = tmp_path / "user-presets/creator-studio"
    _write(output / "user.txt", "mine\n")
    with pytest.raises(HarnessError) as captured:
        export_preset(workspace, "creator-studio", base, output)
    assert captured.value.code == "DEEPSEEK_PRESET_COLLISION"

    malformed = tmp_path / "malformed"
    _write(malformed / "agent.cordis.yml", "- id: tool-bash\n  name: tool\n")
    with pytest.raises(HarnessError) as captured:
        export_preset(
            workspace,
            "creator-studio",
            malformed,
            tmp_path / "user-presets/another-mode",
        )
    assert captured.value.code == "DEEPSEEK_BASE_INVALID"


def test_cli_exposes_only_mode_only_workflows(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    root = _environment(tmp_path)
    assert main(["workspace.validate", "--workspace", str(root)]) == 0
    output = json.loads(capsys.readouterr().out)
    assert output["ok"] is True
    assert {item["id"] for item in output["modes"]} == {
        "creator-studio",
        "skill-foundry",
    }
