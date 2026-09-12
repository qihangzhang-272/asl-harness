from __future__ import annotations

import json
import os
import zipfile
from pathlib import Path

import pytest

from asl_harness.commands import main
from asl_harness.portable import NAMESPACE, export_pack, inspect_pack, import_pack
from asl_harness.workspace import HarnessError, Workspace
from test_mode_only import _environment, _mode, _skill, _write


def test_optional_map_is_a_mode_file_and_survives_sharing(tmp_path):
    from asl_harness.management import catalog, edit
    source = _environment(tmp_path)
    mode = catalog(source)['modes'][0]
    edit(source, {'operation': 'mode.save', 'id': mode['id'], 'expected': mode['fingerprint'],
                 'document': mode['document'], 'skills': mode['roots'],
                 'capabilities': [{'title': '我的工作', 'skills': ['creator'], 'icon': '🧠', 'color': '#0055AA'}],
                 'architecture': {'edges': [{'from': 'foundation', 'to': 'creator'}]}})
    package = tmp_path / 'shared.zip'
    export_pack(source, mode['id'], package)
    target = tmp_path / 'received'
    import_pack(package, target)
    restored = catalog(target)['modes'][0]
    assert restored['capabilities'][0]['icon'] == '🧠'
    assert restored['architecture'] == {'nodes': [], 'edges': [{'from': 'foundation', 'to': 'creator'}]}


def test_import_explains_newlines_and_preserves_identical_local_bytes(tmp_path):
    source = _environment(tmp_path)
    pack = tmp_path / 'pack.zip'
    export_pack(source, 'creator-studio', pack)
    target = tmp_path / 'local'
    import_pack(pack, target)
    file = target / 'skills/creator/SKILL.md'
    local = file.read_bytes().replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
    file.write_bytes(local)
    preview = import_pack(pack, target, check=True)
    assert not preview['conflicts']
    assert preview['actions']['skills/creator'] == 'unchanged'
    assert preview['differences']['skills/creator'][0]['kind'] == 'line-endings'
    import_pack(pack, target, expected=preview['fingerprint'])
    assert file.read_bytes() == local
    file.write_bytes(local + b'\r\nLocal decision.\r\n')
    preview = import_pack(pack, target, check=True)
    assert preview['conflicts'] == ['skills/creator']
    change = preview['differences']['skills/creator'][0]
    assert change['path'] == 'SKILL.md' and 'Local decision.' in change['diff']


def test_mode_origin_only_is_not_a_business_conflict(tmp_path):
    source = _environment(tmp_path)
    pack = tmp_path / 'pack.zip'
    export_pack(source, 'creator-studio', pack)
    target = tmp_path / 'local'
    import_pack(pack, target)
    _write(source / 'modes/creator-studio/SOURCE.md', '# Source\n\n<!-- asl:upstream -->\n- Commit: ' + 'a' * 40 + '\n<!-- /asl:upstream -->\n')
    newer = tmp_path / 'new.zip'
    export_pack(source, 'creator-studio', newer)
    preview = import_pack(newer, target, check=True)
    assert not preview['conflicts']
    assert preview['actions']['modes/creator-studio'] == 'source-update'
    import_pack(newer, target, expected=preview['fingerprint'])
    assert (target / 'modes/creator-studio/SOURCE.md').exists()


def test_cloud_origin_survives_export_import_without_importing_personal_content(tmp_path):
    from asl_harness.management import catalog
    source = _environment(tmp_path)
    origin = ('# Source\n\n<!-- asl:upstream -->\n'
              '- Repository: https://github.com/example/skills\n'
              '- URL: https://github.com/example/skills/tree/main/studio\n'
              '- Commit: ' + 'a' * 40 + '\n<!-- /asl:upstream -->\n')
    _write(source / 'modes/creator-studio/SOURCE.md', origin)
    package = tmp_path / 'cloud.zip'
    export_pack(source, 'creator-studio', package)
    target = tmp_path / 'imported'
    import_pack(package, target)
    assert (target / 'modes/creator-studio/SOURCE.md').read_text() == origin
    assert catalog(target)['modes'][0]['upstream'] == {
        'repository': 'https://github.com/example/skills',
        'url': 'https://github.com/example/skills/tree/main/studio', 'commit': 'a' * 40,
    }
    assert not inspect_pack(package)['includedProfile']


def test_import_rejects_changes_since_preview(tmp_path):
    source = _environment(tmp_path)
    package = tmp_path / 'incoming.zip'
    export_pack(source, 'creator-studio', package)
    target = tmp_path / 'imported'
    import_pack(package, target)
    preview = import_pack(package, target, check=True)
    _write(target / 'skills/creator/local-note.md', 'Locally maintained after preview')
    with pytest.raises(HarnessError, match='重新查看导入预览'):
        import_pack(package, target, replace=True, expected=preview['fingerprint'])
    assert (target / 'skills/creator/local-note.md').exists()


def test_mock_key_in_test_asset_is_preserved_but_actual_literals_still_blocked(tmp_path):
    source = _environment(tmp_path)
    file = source / 'skills/creator/scripts/main.test.ts'
    _write(file, 'const config = { OPENAI_API_KEY: "openai-key" };')
    exported = export_pack(source, 'creator-studio', tmp_path / 'safe.zip')
    assert 'skills/creator/scripts/main.test.ts' in exported['files']
    _write(file, 'const config = { OPENAI_API_KEY: "sk-' + 'a' * 40 + '" };')
    with pytest.raises(HarnessError, match='possible secret literal'):
        export_pack(source, 'creator-studio', tmp_path / 'unsafe.zip')


def test_pack_contains_complete_selected_mode_not_private_environment(tmp_path: Path) -> None:
    source = _environment(tmp_path)
    _skill(source, "other")
    _mode(source, "other-mode", ("other",))
    _write(source / "skills/creator/scripts/main.py", "print('example')\n")
    _write(source / "skills/creator/package.json", '{"dependencies":{"example":"1.0.0"}}')
    _write(source / "skills/creator/node_modules/cache.txt", "cache")
    _write(source / "skills/creator/.venv/cache.txt", "cache")
    _write(source / "modes/creator-studio/private-notes.md", "PRIVATE")
    package = tmp_path / "shared.zip"
    result = export_pack(source, "creator-studio", package)
    with zipfile.ZipFile(package) as archive:
        names = archive.namelist()
        manifest = json.loads(archive.read("plugin.json"))
        assert "skills/creator/scripts/main.py" in names
        assert "skills/creator/package.json" in names
        assert not any("other" in name or "cache.txt" in name for name in names)
        assert not any("PROFILE" in name or "private-notes" in name for name in names)
        assert str(source) not in json.dumps(manifest)
        assert manifest["$schema"] == "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json"
        assert manifest["extensions"][NAMESPACE]["mode"] == "creator-studio"
    shown = inspect_pack(package)
    assert shown["skills"] == ["creator", "foundation"]
    assert shown["contentDigest"] == result["contentDigest"]
    assert shown["runtimeStatus"] == "not-checked"
    assert "skills/creator/package.json" in shown["dependencyFiles"]


def test_native_dependency_preview_explains_requirements_without_execution(tmp_path: Path) -> None:
    source = _environment(tmp_path)
    _write(source / "skills/creator/package.json", json.dumps({
        "engines": {"node": ">=22"}, "dependencies": {"example-client": "^1.0.0"},
        "scripts": {"postinstall": "echo DO_NOT_EXECUTE", "build": "echo BUILD_ONLY"},
    }))
    _write(source / "skills/creator/pyproject.toml", '[project]\nrequires-python=">=3.11"\ndependencies=["httpx>=0.27"]\n')
    _write(source / "skills/creator/mcp.json", json.dumps({"mcpServers": {
        "research": {"command": "some-uninstalled-server", "env": {"SERVICE_KEY": "${SERVICE_KEY}"}},
        "remote": {"url": "https://example.com/private-endpoint", "headers": {"Authorization": "Bearer ${REMOTE_TOKEN}"}},
    }}))
    report = export_pack(source, "creator-studio", tmp_path / "shared.zip", check=True)
    details = {item["file"]: item for item in report["dependencyDetails"]}
    node = details["skills/creator/package.json"]
    assert "node >=22" in node["requirements"]
    assert "example-client ^1.0.0" in node["requirements"]
    assert node["setupScripts"] == ["build", "postinstall"]
    assert "httpx>=0.27" in details["skills/creator/pyproject.toml"]["requirements"]
    mcp = details["skills/creator/mcp.json"]
    assert mcp["environmentVariables"] == ["REMOTE_TOKEN", "SERVICE_KEY"]
    assert mcp["requirements"] == ["research (stdio)", "remote (http)"]
    assert "DO_NOT_EXECUTE" not in json.dumps(details)
    assert "private-endpoint" not in json.dumps(details)
    assert report["runtimeStatus"] == "not-checked"
    assert not (tmp_path / "shared.zip").exists()


@pytest.mark.parametrize("filename,content", [("package.json", "{broken"), ("pyproject.toml", "[broken"), ("mcp.json", "[]")])
def test_unreadable_dependency_declaration_is_visible_not_a_new_import_gate(tmp_path: Path, filename: str, content: str) -> None:
    source = _environment(tmp_path)
    _write(source / "skills/creator" / filename, content)
    report = export_pack(source, "creator-studio", tmp_path / "shared.zip")
    assert report["dependencyDetails"][0]["parseWarning"]
    assert (tmp_path / "shared.zip").exists()
    assert report["runtimeStatus"] == "not-checked"


def test_round_trip_to_new_environment_rebinds_paths_and_preserves_bytes(tmp_path: Path) -> None:
    source = _environment(tmp_path)
    _write(source / "skills/creator/assets/demo.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>')
    package = tmp_path / "shared"
    export_pack(source, "creator-studio", package, include_profile=True)
    target = tmp_path / "received"
    preview = import_pack(package, target, check=True)
    assert preview["changed"] and not target.exists()
    result = import_pack(package, target)
    workspace = Workspace.open(target)
    assert workspace.workspace_view_current()
    assert result["operation"] == "mode.import"
    assert (target / "PROFILE.md").read_bytes() == (source / "PROFILE.md").read_bytes()
    assert (target / "skills/creator/assets/demo.svg").read_bytes() == (source / "skills/creator/assets/demo.svg").read_bytes()
    assert not import_pack(package, target)["changed"]


def test_import_conflict_is_previewed_and_never_silently_replaces(tmp_path: Path) -> None:
    source = _environment(tmp_path / "one")
    target = _environment(tmp_path / "two")
    _write(source / "skills/creator/assets/new.txt", "incoming")
    _write(target / "PROFILE.md", "KEEP MY PROFILE")
    package = tmp_path / "shared.zip"
    export_pack(source, "creator-studio", package, include_profile=True)
    before = (target / "WORKSPACE.md").read_bytes()
    preview = import_pack(package, target, check=True)
    assert preview["conflicts"] == ["skills/creator"]
    assert preview["affectedModes"] == ["creator-studio"]
    with pytest.raises(HarnessError, match="conflict"):
        import_pack(package, target)
    assert (target / "WORKSPACE.md").read_bytes() == before
    import_pack(package, target, replace=True)
    assert (target / "skills/creator/assets/new.txt").read_text() == "incoming"
    assert (target / "PROFILE.md").read_text() == "KEEP MY PROFILE"


@pytest.mark.parametrize("bad_name", ["../outside", "C:/outside", "skills/a:stream", "skills/NUL", "skills/a/../../escape"])
def test_zip_paths_are_rejected_before_import(tmp_path: Path, bad_name: str) -> None:
    package = tmp_path / "bad.zip"
    with zipfile.ZipFile(package, "w") as archive:
        archive.writestr(bad_name, "bad")
    with pytest.raises(HarnessError):
        import_pack(package, tmp_path / "received")
    assert not (tmp_path / "received").exists()


def test_digest_detects_changed_payload_and_unlisted_files(tmp_path: Path) -> None:
    source = _environment(tmp_path)
    package = tmp_path / "shared"
    export_pack(source, "creator-studio", package)
    _write(package / "skills/creator/SKILL.md", "changed")
    with pytest.raises(HarnessError, match="digest"):
        inspect_pack(package)


def test_secret_and_absolute_local_reference_are_not_silently_shared(tmp_path: Path) -> None:
    source = _environment(tmp_path)
    _write(source / "skills/creator/config.json", '{"api_key":"not-a-placeholder"}')
    with pytest.raises(HarnessError, match="secret"):
        export_pack(source, "creator-studio", tmp_path / "shared.zip")
    assert not (tmp_path / "shared.zip").exists()


def test_export_reports_machine_specific_text_without_rewriting_skill(tmp_path: Path) -> None:
    source = _environment(tmp_path)
    _write(source / "skills/creator/references/local.md", "Run C:\\Users\\Alice\\tool.exe")
    report = export_pack(source, "creator-studio", tmp_path / "shared.zip", check=True)
    assert report["localReferences"] == ["skills/creator/references/local.md"]
    assert not (tmp_path / "shared.zip").exists()


def test_import_rolls_back_on_final_validation_failure(tmp_path: Path, monkeypatch) -> None:
    source = _environment(tmp_path / "one")
    target = _environment(tmp_path / "two")
    _write(source / "skills/creator/assets/new.txt", "incoming")
    package = tmp_path / "shared.zip"
    export_pack(source, "creator-studio", package)
    before = (target / "WORKSPACE.md").read_bytes()
    monkeypatch.setattr(Workspace, "sync_workspace_view", lambda _self: (_ for _ in ()).throw(RuntimeError("late failure")))
    with pytest.raises(RuntimeError, match="late failure"):
        import_pack(package, target, replace=True)
    assert not (target / "skills/creator/assets/new.txt").exists()
    assert (target / "WORKSPACE.md").read_bytes() == before


def test_cli_preview_is_structured_and_read_only(tmp_path: Path, capsys) -> None:
    source = _environment(tmp_path)
    package = tmp_path / "shared.zip"
    assert main(["mode.export", "--workspace", str(source), "--mode", "creator-studio", "--output", str(package), "--check"]) == 0
    assert json.loads(capsys.readouterr().out)["check"] is True
    assert not package.exists()


def test_unlisted_payload_and_invalid_manifest_are_rejected(tmp_path: Path) -> None:
    source = _environment(tmp_path)
    package = tmp_path / "shared"
    export_pack(source, "creator-studio", package)
    path = package / "plugin.json"
    manifest = json.loads(path.read_text())
    manifest["name"] = "INVALID NAME"
    _write(path, json.dumps(manifest))
    with pytest.raises(HarnessError, match="manifest"):
        inspect_pack(package)


@pytest.mark.parametrize("name", ["skills/Creator/SKILL.md", "skills/creator/SKILL.md"])
def test_duplicate_zip_names_are_rejected(tmp_path: Path, name: str) -> None:
    archive_path = tmp_path / "duplicate.zip"
    with zipfile.ZipFile(archive_path, "w") as archive:
        archive.writestr("skills/creator/SKILL.md", "a")
        if name == "skills/creator/SKILL.md":
            with pytest.warns(UserWarning, match="Duplicate name"):
                archive.writestr(name, "b")
        else:
            archive.writestr(name, "b")
    with pytest.raises(HarnessError, match="duplicate"):
        inspect_pack(archive_path)


@pytest.mark.skipif(os.name == "nt", reason="POSIX executable bits are verified on Linux CI")
def test_preserves_executable_script_metadata(tmp_path: Path) -> None:
    source = _environment(tmp_path)
    _write(source / "skills/creator/scripts/run.sh", "#!/bin/sh\nprintf hello\n")
    script = source / "skills/creator/scripts/run.sh"
    script.chmod(0o755)
    package = tmp_path / "shared.zip"
    export_pack(source, "creator-studio", package)
    with zipfile.ZipFile(package) as archive:
        mode = archive.getinfo("skills/creator/scripts/run.sh").external_attr >> 16
        assert mode & 0o111
    target = tmp_path / "received"
    import_pack(package, target)
    assert (target / "skills/creator/scripts/run.sh").stat().st_mode & 0o111


def test_linked_asset_is_not_copied_from_outside_package(tmp_path: Path) -> None:
    source = _environment(tmp_path)
    external = tmp_path / "private.txt"
    external.write_text("private")
    try:
        (source / "skills/creator/leak.txt").symlink_to(external)
    except OSError:
        pytest.skip("symlinks unavailable")
    with pytest.raises(HarnessError):
        export_pack(source, "creator-studio", tmp_path / "shared.zip")
