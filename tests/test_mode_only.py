from __future__ import annotations

import json
from types import SimpleNamespace
from pathlib import Path

import pytest

import asl_harness.adapters as adapters
from asl_harness.adapters import HOST_LAYOUTS, project_mode, verify_mode_projection
from asl_harness.commands import main
from asl_harness.deepseek import PRESET_MARKER, export_preset, verify_preset
from asl_harness.hooks import hook_config, run_hook
from asl_harness.sync import sync_environment
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
    _write(
        root / "skills" / skill_id / "SOURCE.md",
        f"# Source\n\n- Origin: local://tests/{skill_id}\n",
    )


def _mode(
    root: Path,
    mode_id: str,
    skills: tuple[str, ...],
) -> None:
    _write(
        root / "modes" / mode_id / "MODE.md",
        f"# {mode_id}\n\n这是一个覆盖长期工作的广域工作场。\n",
    )
    roots = "\n".join(f"    - {item}" for item in skills)
    _write(
        root / "modes" / mode_id / "mode.yaml",
        f"""apiVersion: asl-wep/v0.3.0
kind: ModeProjection
metadata:
  id: {mode_id}
spec:
  skills:
{roots}
""",
    )


def _environment(tmp_path: Path) -> Path:
    root = tmp_path / "personal-environment"
    _write(root / "WORKSPACE.md", "# 我的工作环境\n\n当前能力地图。\n")
    _write(root / "PROFILE.md", "# Profile\n\n偏好清楚、直接、低复杂度。\n")
    _skill(root, "foundation")
    _skill(root, "creator", ("foundation",))
    _mode(root, "creator-studio", ("creator",))
    for directory in ("candidates", "trials", "feedback", "archive"):
        (root / directory).mkdir(parents=True)
    return root


def test_workspace_opens_mode_graph_and_ignores_cultivation_areas(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    _write(
        root / "candidates" / "untrusted" / "SOURCE.md",
        "# Candidate\n\n- Origin: https://example.com/untrusted\n",
    )
    workspace = Workspace.open(root)

    assert list(workspace.skills) == ["creator", "foundation"]
    assert workspace.mode_skill_ids("creator-studio") == ("creator", "foundation")
    assert workspace.summary()["environmentId"] == "personal-environment"
    assert workspace.summary()["cultivation"] == {
        "candidates": ["untrusted"],
        "trials": [],
        "feedback": [],
        "archive": [],
    }


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


def test_mode_rejects_permissions_and_other_non_projection_fields(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    _write(
        root / "modes" / "creator-studio" / "mode.yaml",
        """apiVersion: asl-wep/v0.3.0
kind: ModeProjection
metadata:
  id: creator-studio
spec:
  skills:
    - creator
  permissions:
    mutateEnvironment: false
""",
    )
    with pytest.raises(HarnessError) as captured:
        Workspace.open(root)
    assert captured.value.code == "MODE_INVALID"


def test_workspace_requires_all_lifecycle_areas(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    (root / "feedback").rmdir()

    with pytest.raises(HarnessError) as captured:
        Workspace.open(root)
    assert captured.value.code == "ENVIRONMENT_INVALID"
    assert "feedback/" in str(captured.value)


def test_formal_skill_requires_a_traceable_source(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    (root / "skills" / "creator" / "SOURCE.md").unlink()

    with pytest.raises(HarnessError) as captured:
        Workspace.open(root)

    assert captured.value.code == "SKILL_SOURCE_INVALID"


def test_candidate_requires_source_and_trial_is_a_complete_skill(tmp_path: Path) -> None:
    missing_source = _environment(tmp_path / "candidate")
    (missing_source / "candidates" / "unknown").mkdir()
    with pytest.raises(HarnessError) as captured:
        Workspace.open(missing_source)
    assert captured.value.code == "CANDIDATE_INVALID"

    invalid_trial = _environment(tmp_path / "trial")
    _write(invalid_trial / "trials" / "draft" / "SKILL.md", "# incomplete\n")
    with pytest.raises(HarnessError) as captured:
        Workspace.open(invalid_trial)
    assert captured.value.code == "TRIAL_INVALID"

    valid_trial = _environment(tmp_path / "valid-trial")
    _write(
        valid_trial / "trials" / "draft" / "SKILL.md",
        """---
name: draft
description: isolated draft capability
---
# Draft

## 完成标准

- 交付可检查结果。
""",
    )
    _write(
        valid_trial / "trials" / "draft" / "SOURCE.md",
        "# Source\n\n- Origin: local://tests/draft\n",
    )
    workspace = Workspace.open(valid_trial)
    assert workspace.summary()["cultivation"]["trials"] == ["draft"]


@pytest.mark.parametrize("name", [".env", "private.pem", "id_rsa"])
def test_workspace_rejects_secret_bearing_file_names(tmp_path: Path, name: str) -> None:
    root = _environment(tmp_path)
    _write(root / "skills" / "creator" / name, "do not inspect values\n")

    with pytest.raises(HarnessError) as captured:
        Workspace.open(root)
    assert captured.value.code == "SECRET_FILE_PRESENT"
    assert name in str(captured.value)


def test_generated_directories_are_reported_without_blocking_work(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    _write(root / "skills" / "creator" / "__pycache__" / "cache.pyc", "cache\n")

    summary = Workspace.open(root).summary()

    assert summary["warnings"] == [
        {
            "code": "GENERATED_CONTENT_PRESENT",
            "paths": ["skills/creator/__pycache__"],
        }
    ]


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
    assert "正式业务 Skills：2" in text
    assert "业务 Modes：1" in text
    assert "确定性提醒：无" in text
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
    assert manifest["operation"] == "mode.export"
    assert "permissions" not in manifest
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


def test_verify_rejects_tampered_copy_projection(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    workspace = Workspace.open(_environment(tmp_path))
    project = tmp_path / "project"

    def no_link(*_args: object, **_kwargs: object) -> None:
        raise OSError("links unavailable")

    monkeypatch.setattr(Path, "symlink_to", no_link)
    monkeypatch.setattr(
        adapters.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=1),
    )
    manifest = project_mode(
        workspace, project, "creator-studio", host_id="codex-app"
    )
    assert all(item["projection"] == "copy" for item in manifest["skillProjections"])
    with (project / ".agents/skills/creator/SKILL.md").open(
        "a", encoding="utf-8"
    ) as stream:
        stream.write("\ntampered\n")

    with pytest.raises(HarnessError) as captured:
        verify_mode_projection(
            workspace, project, "creator-studio", host_id="codex-app"
        )

    assert captured.value.code == "HOST_PROJECTION_INVALID"


def test_verify_rejects_tampered_managed_instructions(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    workspace = Workspace.open(root)
    project = tmp_path / "project"
    project_mode(workspace, project, "creator-studio", host_id="codex-app")
    instruction = project / "AGENTS.md"
    instruction.write_text(
        instruction.read_text(encoding="utf-8").replace(
            "ASL current Mode: creator-studio", "ASL current Mode: tampered"
        ),
        encoding="utf-8",
    )

    with pytest.raises(HarnessError) as captured:
        verify_mode_projection(
            workspace, project, "creator-studio", host_id="codex-app"
        )

    assert captured.value.code == "HOST_PROJECTION_INVALID"


def test_projection_rolls_back_when_instruction_write_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _environment(tmp_path)
    workspace = Workspace.open(root)
    project = tmp_path / "project"
    original = project_mode(
        workspace, project, "creator-studio", host_id="codex-app"
    )
    _skill(root, "research")
    _mode(root, "research-desk", ("research",))

    def fail_write(_path: Path, _block: str) -> None:
        raise OSError("simulated instruction write failure")

    monkeypatch.setattr(adapters, "_replace_managed_block", fail_write)
    with pytest.raises(OSError, match="simulated"):
        project_mode(
            Workspace.open(root), project, "research-desk", host_id="codex-app"
        )

    manifest_path = project / ".asl/host-projections/codex-app/current.json"
    assert json.loads(manifest_path.read_text(encoding="utf-8")) == original
    assert (project / ".agents/skills/creator/SKILL.md").is_file()
    assert (project / ".agents/skills/foundation/SKILL.md").is_file()
    assert not (project / ".agents/skills/research").exists()


def test_switching_mode_removes_only_old_managed_skills(tmp_path: Path) -> None:
    root = _environment(tmp_path)
    workspace = Workspace.open(root)
    project = tmp_path / "project"
    project_mode(workspace, project, "creator-studio", host_id="codex-app")

    _skill(root, "research")
    _mode(root, "research-desk", ("research",))
    workspace = Workspace.open(root)
    project_mode(workspace, project, "research-desk", host_id="codex-app")

    skill_root = project / ".agents" / "skills"
    assert not (skill_root / "creator").exists()
    assert not (skill_root / "foundation").exists()
    assert (skill_root / "research" / "SKILL.md").is_file()
    manifest = json.loads(
        (project / ".asl/host-projections/codex-app/current.json").read_text(
            encoding="utf-8"
        )
    )
    assert manifest["mode"] == "research-desk"


def test_reproject_removes_broken_managed_junction_after_skill_is_archived(
    tmp_path: Path,
) -> None:
    root = _environment(tmp_path)
    project = tmp_path / "project"
    manifest = project_mode(
        Workspace.open(root), project, "creator-studio", host_id="codex-app"
    )
    creator_projection = next(
        item for item in manifest["skillProjections"] if item["skill"] == "creator"
    )
    if creator_projection["projection"] != "junction":
        pytest.skip("regression is specific to Windows directory junctions")

    target = project / creator_projection["nativePath"]
    (root / "skills" / "creator").rename(root / "archive" / "creator")
    _mode(root, "creator-studio", ("foundation",))
    assert target.exists() is False
    target.lstat()

    project_mode(Workspace.open(root), project, "creator-studio", host_id="codex-app")

    with pytest.raises(FileNotFoundError):
        target.lstat()


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
    _write(root / "skills/creator/.env.example", "SECRET=placeholder\n")
    _write(root / "skills/creator/.git/config", "generated\n")
    workspace = Workspace.open(root)
    base = _deepseek_base(tmp_path / "standard-copy")
    output = tmp_path / ".dsh/.agent-presets/creator-studio"

    result = export_preset(workspace, "creator-studio", base, output)

    assert result["mode"] == "creator-studio"
    assert result["operation"] == "mode.export"
    assert result["skills"] == ["creator", "foundation"]
    assert result["hookIntegration"] == "@deepseek-ai/dsh-hooks-codex"
    assert result["hookActivation"] == "included-in-preset"
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
    assert "@deepseek-ai/dsh-hooks-codex" in composition
    assert json.dumps(str(output / "asl-hooks.json")) in composition
    assert json.loads((output / "asl-hooks.json").read_text(encoding="utf-8")) == hook_config(
        "asl-harness-hook --host-id deepseek-harness"
    )
    assert json.loads((output / PRESET_MARKER).read_text(encoding="utf-8"))["basePreset"] == str(base)
    assert verify_preset(workspace, "creator-studio", output) == []

    with (root / "PROFILE.md").open("a", encoding="utf-8") as stream:
        stream.write("\n刷新。\n")
    assert verify_preset(workspace, "creator-studio", output) == [
        "Environment content changed after preset export; run deepseek.preset.export again."
    ]
    refreshed = export_preset(workspace, "creator-studio", base, output)
    assert refreshed["sourceFingerprint"] != result["sourceFingerprint"]


def test_deepseek_verify_rejects_incomplete_preset(tmp_path: Path) -> None:
    workspace = Workspace.open(_environment(tmp_path))
    output = tmp_path / ".dsh/.agent-presets/creator-studio"
    export_preset(workspace, "creator-studio", _deepseek_base(tmp_path / "base"), output)
    (output / "skills" / "creator" / "SKILL.md").unlink()

    with pytest.raises(HarnessError) as captured:
        verify_preset(workspace, "creator-studio", output)
    assert captured.value.code == "DEEPSEEK_PRESET_INVALID"

    export_preset(workspace, "creator-studio", _deepseek_base(tmp_path / "base"), output)
    (output / "asl-hooks.json").unlink()

    with pytest.raises(HarnessError) as captured:
        verify_preset(workspace, "creator-studio", output)
    assert captured.value.code == "DEEPSEEK_PRESET_INVALID"


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
    }


def test_cli_state_is_compact_and_machine_readable(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = _environment(tmp_path)

    assert main(["state", "--workspace", str(root)]) == 0

    output = json.loads(capsys.readouterr().out)
    assert output["ok"] is True
    assert output["skillCount"] == 2
    assert output["modeCount"] == 1
    assert output["modes"] == [{"id": "creator-studio", "skillCount": 2}]
    assert "skills" not in output


def test_host_project_reports_how_to_enter_the_native_host(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    root = _environment(tmp_path)
    with (root / "skills" / "creator" / "SKILL.md").open(
        "a", encoding="utf-8"
    ) as stream:
        stream.write(
            "\n## 运行依赖\n\n- MCP：example-search；缺失时提醒用户使用宿主原生配置。\n"
        )
    project = tmp_path / "project"

    assert (
        main(
            [
                "host.project",
                "--workspace",
                str(root),
                "--project",
                str(project),
                "--mode",
                "creator-studio",
                "--host-id",
                "codex-app",
            ]
        )
        == 0
    )

    output = json.loads(capsys.readouterr().out)
    assert output["activation"] == {
        "hostId": "codex-app",
        "openProject": str(project),
        "instructionFile": "AGENTS.md",
        "skillRoot": ".agents/skills",
        "runtimeRequirementSkills": ["creator"],
        "hookIntegration": "asl-environment-host-plugin",
        "hookActivation": "install-or-enable-in-host",
        "nextSteps": [
            f"Open {project} in Codex App.",
            "Read runtime dependency notes in: creator.",
            "Install or enable the asl-environment-host plugin for automatic checks; the Mode itself is already usable without Hooks.",
        ],
    }


def test_hook_is_silent_outside_an_asl_project(tmp_path: Path) -> None:
    code, message = run_hook(
        {"hook_event_name": "SessionStart", "cwd": str(tmp_path)},
        host_id="codex-app",
    )

    assert code == 0
    assert message == ""


def test_host_plugin_exposes_the_same_minimal_hook_contract() -> None:
    repository = Path(__file__).parents[1]
    configured = json.loads(
        (repository / "plugins/asl-environment-host/hooks/hooks.json").read_text(
            encoding="utf-8"
        )
    )

    assert configured == hook_config()
    assert set(configured["hooks"]) == {"SessionStart", "PostToolUse", "Stop"}
    for marketplace in (
        repository / ".agents/plugins/marketplace.json",
        repository / ".claude-plugin/marketplace.json",
    ):
        listed = json.loads(marketplace.read_text(encoding="utf-8"))
        source = listed["plugins"][0]["source"]
        assert (
            source == "./plugins/asl-environment-host"
            or source
            == {"source": "local", "path": "./plugins/asl-environment-host"}
        )


def test_hook_loads_mode_context_and_blocks_only_managed_write_damage(
    tmp_path: Path,
) -> None:
    root = _environment(tmp_path)
    project = tmp_path / "project"
    workspace = Workspace.open(root)
    project_mode(workspace, project, "creator-studio", host_id="codex-app")

    code, message = run_hook(
        {"hook_event_name": "SessionStart", "cwd": str(project)},
        host_id="codex-app",
    )
    assert code == 0
    assert "ASL Mode creator-studio" in message
    assert "2 projected Skills" in message

    unrelated = tmp_path / "notes.md"
    code, message = run_hook(
        {
            "hook_event_name": "PostToolUse",
            "cwd": str(project),
            "tool_name": "write",
            "tool_input": {"path": str(unrelated)},
        },
        host_id="codex-app",
    )
    assert code == 0
    assert message == ""

    projected = project / ".agents" / "skills" / "creator" / "SKILL.md"
    projected.write_text("tampered\n", encoding="utf-8")
    code, message = run_hook(
        {
            "hook_event_name": "PostToolUse",
            "cwd": str(project),
            "tool_name": "apply_patch",
            "tool_input": {"path": str(projected)},
        },
        host_id="codex-app",
    )
    assert code == 2
    assert "SKILL_INVALID" in message

    code, message = run_hook(
        {"hook_event_name": "Stop", "cwd": str(project)},
        host_id="codex-app",
    )
    assert code == 0
    assert "SKILL_INVALID" in message


def test_environment_sync_check_reports_add_without_writing(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = _environment(tmp_path / "source")
    target = _environment(tmp_path / "target")
    _skill(source, "visual")

    assert (
        main(
            [
                "environment.sync",
                "--source",
                str(source),
                "--target",
                str(target),
                "--skill",
                "visual",
                "--check",
            ]
        )
        == 0
    )

    output = json.loads(capsys.readouterr().out)
    assert output["skillAction"] == "add"
    assert output["modeAction"] is None
    assert output["changed"] is True
    assert output["check"] is True
    assert not (target / "skills" / "visual").exists()


def test_environment_sync_adds_complete_skill_and_binds_one_mode(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = _environment(tmp_path / "source")
    target = _environment(tmp_path / "target")
    _skill(source, "visual")
    _mode(target, "research-desk", ("foundation",))
    _write(
        source / "skills/visual/SOURCE.md",
        "# Source\n\n- Origin: local://tests/visual-with-assets\n",
    )
    _write(source / "skills/visual/scripts/render.py", "print('render')\n")
    _write(source / "skills/visual/__pycache__/render.pyc", "generated\n")

    assert (
        main(
            [
                "environment.sync",
                "--source",
                str(source),
                "--target",
                str(target),
                "--skill",
                "visual",
                "--mode",
                "creator-studio",
            ]
        )
        == 0
    )

    output = json.loads(capsys.readouterr().out)
    assert output["skillAction"] == "add"
    assert output["modeAction"] == "add"
    assert output["changed"] is True
    assert output["check"] is False
    assert (target / "skills/visual/SKILL.md").is_file()
    assert (target / "skills/visual/SOURCE.md").is_file()
    assert (target / "skills/visual/scripts/render.py").is_file()
    assert not (target / "skills/visual/__pycache__").exists()
    refreshed = Workspace.open(target)
    assert "visual" in refreshed.modes["creator-studio"].skill_roots
    assert "visual" not in refreshed.modes["research-desk"].skill_roots
    assert refreshed.workspace_view_current() is True
    assert output["operation"] == "skill.import"
    assert len(output["sourcePackageFingerprint"]) == 64
    assert output["targetPackageFingerprint"] == output["sourcePackageFingerprint"]


def test_environment_sync_rolls_back_the_whole_change_on_late_failure(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = _environment(tmp_path / "source")
    target = _environment(tmp_path / "target")
    _skill(source, "visual")
    before_mode = (target / "modes/creator-studio/mode.yaml").read_bytes()
    before_view = (target / "WORKSPACE.md").read_bytes()

    def fail_view(_workspace: Workspace) -> Path:
        raise OSError("simulated view write failure")

    monkeypatch.setattr(Workspace, "sync_workspace_view", fail_view)
    with pytest.raises(OSError, match="simulated"):
        sync_environment(source, target, "visual", mode_id="creator-studio")

    assert not (target / "skills/visual").exists()
    assert (target / "modes/creator-studio/mode.yaml").read_bytes() == before_mode
    assert (target / "WORKSPACE.md").read_bytes() == before_view
    assert Workspace.open(target).modes["creator-studio"].skill_roots == ("creator",)


def test_environment_sync_reports_and_refuses_local_conflict(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = _environment(tmp_path / "source")
    target = _environment(tmp_path / "target")
    _mode(target, "research-desk", ("foundation",))
    with (target / "skills/creator/SKILL.md").open("a", encoding="utf-8") as stream:
        stream.write("\n目标 Environment 的本地修改。\n")

    assert (
        main(
            [
                "environment.sync",
                "--source",
                str(source),
                "--target",
                str(target),
                "--skill",
                "creator",
                "--mode",
                "research-desk",
                "--check",
            ]
        )
        == 0
    )
    check_output = json.loads(capsys.readouterr().out)
    assert check_output["skillAction"] == "conflict"
    assert check_output["modeAction"] == "blocked"
    assert "目标 Environment 的本地修改" in (
        target / "skills/creator/SKILL.md"
    ).read_text(encoding="utf-8")

    assert (
        main(
            [
                "environment.sync",
                "--source",
                str(source),
                "--target",
                str(target),
                "--skill",
                "creator",
                "--mode",
                "research-desk",
            ]
        )
        == 2
    )
    error = json.loads(capsys.readouterr().out)
    assert error["error"]["code"] == "SYNC_SKILL_CONFLICT"


def test_environment_sync_replaces_only_with_explicit_flag(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = _environment(tmp_path / "source")
    target = _environment(tmp_path / "target")
    with (target / "skills/creator/SKILL.md").open("a", encoding="utf-8") as stream:
        stream.write("\n只存在于目标的本地修改。\n")

    assert (
        main(
            [
                "environment.sync",
                "--source",
                str(source),
                "--target",
                str(target),
                "--skill",
                "creator",
                "--replace",
            ]
        )
        == 0
    )

    output = json.loads(capsys.readouterr().out)
    assert output["skillAction"] == "replace"
    assert output["changed"] is True
    assert (target / "skills/creator/SKILL.md").read_bytes() == (
        source / "skills/creator/SKILL.md"
    ).read_bytes()


def test_environment_sync_noop_does_not_refresh_unrelated_stale_view(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = _environment(tmp_path / "source")
    target = _environment(tmp_path / "target")

    assert (
        main(
            [
                "environment.sync",
                "--source",
                str(source),
                "--target",
                str(target),
                "--skill",
                "creator",
            ]
        )
        == 0
    )

    output = json.loads(capsys.readouterr().out)
    assert output["skillAction"] == "unchanged"
    assert output["changed"] is False
    assert output["changedPaths"] == []
    assert Workspace.open(target).workspace_view_current() is False


def test_environment_sync_rejects_missing_target_dependency(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    source = _environment(tmp_path / "source")
    target = _environment(tmp_path / "target")
    _skill(source, "visual", ("visual-runtime",))
    _skill(source, "visual-runtime")

    assert (
        main(
            [
                "environment.sync",
                "--source",
                str(source),
                "--target",
                str(target),
                "--skill",
                "visual",
            ]
        )
        == 2
    )

    output = json.loads(capsys.readouterr().out)
    assert output["error"]["code"] == "SYNC_DEPENDENCY_MISSING"
    assert not (target / "skills/visual").exists()
