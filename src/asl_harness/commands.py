from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from collections.abc import Sequence

import yaml

from .adapters import (
    HOST_LAYOUTS,
    activation_report,
    project_mode,
    verify_mode_projection,
)
from .deepseek import export_preset, verify_preset
from .sync import sync_environment
from .portable import export_pack, inspect_pack, import_pack
from .workspace import HarnessError, Workspace
from .management import catalog, edit, skill_files, editing_guide
from .discovery import scan_skills, unpack_skills
from .user_projection import sync_user
from .readiness import inspect_mode, setup_brief


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="asl-harness",
        description="Validate ASL Environments, sync complete Skills, and project one Mode to a native Host.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    scan = commands.add_parser("skill.scan")
    scan.add_argument("--source", action="append", required=True)
    unpack = commands.add_parser("skill.unpack")
    unpack.add_argument("--source", required=True)
    unpack.add_argument("--output", required=True)

    catalog_command = commands.add_parser("environment.catalog")
    catalog_command.add_argument("--workspace", required=True)
    files_command = commands.add_parser('skill.files')
    files_command.add_argument('--workspace', required=True)
    files_command.add_argument('--skill', required=True)
    files_command.add_argument('--file', default='SKILL.md')
    guide_command = commands.add_parser('environment.guide')
    guide_command.add_argument('--workspace', required=True)
    guide_command.add_argument('--mode')
    edit_command = commands.add_parser("environment.edit")
    edit_command.add_argument("--workspace", required=True)
    edit_command.add_argument("--check", action="store_true")

    validate = commands.add_parser("workspace.validate")
    validate.add_argument("--workspace", required=True, help="Personal Harness Environment root")

    state = commands.add_parser("state")
    state.add_argument("--workspace", required=True, help="Personal Harness Environment root")

    sync_view = commands.add_parser("workspace.view.sync")
    sync_view.add_argument("--workspace", required=True)

    project = commands.add_parser("host.project")
    project.add_argument("--workspace", required=True)
    project.add_argument("--project", required=True)
    project.add_argument("--mode", required=True)
    project.add_argument("--host-id", choices=sorted(HOST_LAYOUTS), required=True)

    verify = commands.add_parser("host.verify")
    verify.add_argument("--workspace", required=True)
    verify.add_argument("--project", required=True)
    verify.add_argument("--mode", required=True)
    verify.add_argument("--host-id", choices=sorted(HOST_LAYOUTS), required=True)

    user_sync = commands.add_parser("host.user.sync", help="Sync one Mode to native current-user locations")
    user_sync.add_argument("--workspace", required=True)
    user_sync.add_argument("--mode", required=True)
    user_sync.add_argument("--host-id", choices=["codex-app", "claude-code"], required=True)
    user_sync.add_argument("--check", action="store_true")
    user_sync.add_argument("--expected")
    user_sync.add_argument("--remove", action="store_true")
    user_sync.add_argument("--skills-dir", type=Path)

    setup = commands.add_parser("host.setup.inspect", help="Inspect this computer without installing dependencies")
    setup.add_argument("--workspace", required=True)
    setup.add_argument("--mode", required=True)
    setup.add_argument("--host-id", choices=sorted(HOST_LAYOUTS), required=True)
    setup.add_argument("--scope", choices=["project", "user", "preset"], required=True)
    setup.add_argument("--project")
    setup.add_argument("--probe", action="store_true")
    setup.add_argument("--skills-dir", type=Path)

    preset = commands.add_parser("deepseek.preset.export")
    preset.add_argument("--workspace", required=True)
    preset.add_argument("--mode", required=True)
    preset.add_argument("--base-preset", required=True)
    preset.add_argument("--output", required=True)

    verify_preset_command = commands.add_parser("deepseek.preset.verify")
    verify_preset_command.add_argument("--workspace", required=True)
    verify_preset_command.add_argument("--mode", required=True)
    verify_preset_command.add_argument("--output", required=True)

    sync = commands.add_parser("environment.sync")
    sync.add_argument("--source", required=True)
    sync.add_argument("--target", required=True)
    sync.add_argument("--skill", required=True)
    sync.add_argument("--mode")
    sync.add_argument("--check", action="store_true")
    sync.add_argument("--replace", action="store_true")

    pack_export = commands.add_parser("mode.export", help="Share one Mode as an editable Agent Plugins layout or ZIP")
    pack_export.add_argument("--workspace", required=True)
    pack_export.add_argument("--mode", required=True)
    pack_export.add_argument("--output", required=True)
    pack_export.add_argument("--include-profile", action="store_true")
    pack_export.add_argument("--check", action="store_true")

    inspect = commands.add_parser("mode.inspect", help="Inspect an ASL snapshot without installing or activating it")
    inspect.add_argument("--source", required=True)
    pack_import = commands.add_parser("mode.import", help="Import a complete Mode snapshot into a local Environment")
    pack_import.add_argument("--source", required=True)
    pack_import.add_argument("--target", required=True)
    pack_import.add_argument("--check", action="store_true")
    pack_import.add_argument("--replace", action="store_true")
    pack_import.add_argument("--expected", help="Fingerprint of the reviewed import plan")
    return parser


def _execute(args: argparse.Namespace) -> dict:
    if args.command == "skill.scan":
        return {"ok": True, **scan_skills(args.source)}
    if args.command == "skill.unpack":
        return {"ok": True, **unpack_skills(args.source, args.output)}
    if args.command == "environment.catalog":
        return {"ok": True, **catalog(args.workspace)}
    if args.command == 'skill.files':
        return {'ok': True, **skill_files(args.workspace, args.skill, args.file)}
    if args.command == 'environment.guide':
        return {'ok': True, **editing_guide(args.workspace, args.mode)}
    if args.command == "environment.edit":
        raw = sys.stdin.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise HarnessError("EDIT_INVALID", "修改请求过大")
        return {"ok": True, **edit(args.workspace, json.loads(raw), check=args.check)}
    if args.command == "mode.export":
        return {"ok": True, **export_pack(args.workspace, args.mode, args.output,
                                          include_profile=args.include_profile, check=args.check)}
    if args.command == "mode.inspect":
        return {"ok": True, **inspect_pack(args.source)}
    if args.command == "mode.import":
        return {"ok": True, **import_pack(args.source, args.target, check=args.check, replace=args.replace, expected=args.expected)}
    if args.command == "environment.sync":
        return {
            "ok": True,
            **sync_environment(
                args.source,
                args.target,
                args.skill,
                mode_id=args.mode,
                check=args.check,
                replace=args.replace,
            ),
        }
    workspace = Workspace.open(args.workspace, mode_id=getattr(args, "mode", None))
    if args.command == "workspace.validate":
        return {"ok": True, **workspace.summary()}
    if args.command == "state":
        return {"ok": True, **workspace.state()}
    if args.command == "workspace.view.sync":
        path = workspace.sync_workspace_view()
        return {
            "ok": True,
            "workspaceView": str(path),
            "workspaceViewCurrent": Workspace.open(args.workspace).workspace_view_current(),
        }
    if args.command == "host.project":
        projection = project_mode(
            workspace, args.project, args.mode, host_id=args.host_id
        )
        return {
            "ok": True,
            "projection": projection,
            "activation": activation_report(
                workspace, args.project, args.mode, host_id=args.host_id
            ),
        }
    if args.command == "host.user.sync":
        return {"ok": True, **sync_user(workspace, args.mode, args.host_id,
                                       check=args.check, expected=args.expected, remove=args.remove, skills_dir=args.skills_dir)}
    if args.command == "host.setup.inspect":
        if args.scope in {"project", "preset"} and not args.project:
            raise HarnessError("SETUP_SCOPE", "请先选择项目或预设位置")
        project = Path(args.project).resolve() if args.project else None
        if project and not project.is_dir():
            raise HarnessError("SETUP_SCOPE", "所选工作位置不存在")
        report = inspect_mode(workspace, args.mode, args.host_id, project=project, probe=args.probe)
        if args.skills_dir:
            if args.scope != "user":
                raise HarnessError("SETUP_SCOPE", "自选用户技能目录只适用于用户级范围")
            report["chosenSkillsDirectory"] = str(args.skills_dir.resolve())
            report["nativeDiscoveryUnverified"] = report["chosenSkillsDirectory"] != report["userPaths"].get("skills")
        return {"ok": True, **report, "brief": setup_brief(workspace, args.mode, report, scope=args.scope, project=project)}
    if args.command == "host.verify":
        warnings = verify_mode_projection(
            workspace, args.project, args.mode, host_id=args.host_id
        )
        return {"ok": True, "warnings": warnings}
    if args.command == "deepseek.preset.export":
        projection = export_preset(
            workspace, args.mode, args.base_preset, args.output
        )
        return {"ok": True, "preset": projection}
    if args.command == "deepseek.preset.verify":
        warnings = verify_preset(workspace, args.mode, args.output)
        return {"ok": True, "warnings": warnings}
    raise HarnessError("UNKNOWN_COMMAND", args.command)


def main(argv: Sequence[str] | None = None) -> int:
    for stream in (sys.stdin, sys.stdout):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="strict")
    try:
        result = _execute(_parser().parse_args(argv))
        output = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    except HarnessError as error:
        output = json.dumps(
            {"ok": False, "error": {"code": error.code, "message": str(error)}},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        print(output)
        return 2
    except (OSError, TypeError, ValueError, yaml.YAMLError) as error:
        output = json.dumps(
            {"ok": False, "error": {"code": "INPUT_INVALID", "message": str(error)}},
            ensure_ascii=False,
            separators=(",", ":"),
        )
        print(output)
        return 2
    print(output)
    return 0


if __name__ == "__main__":
    sys.exit(main())
