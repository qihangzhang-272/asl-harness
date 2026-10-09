from __future__ import annotations

import argparse
import json
import sys
import tomllib
from importlib.metadata import PackageNotFoundError, version
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
from .workspace import HarnessError, Workspace, MODE_API_VERSION
from .management import catalog, edit, create_mode, skill_files, mode_files, editing_guide, EDIT_FIELDS, CREATE_FIELDS, CREATE_SOURCE_FIELDS, AUTHORING_POLICY, ORGANIZATION_GUIDE
from .discovery import scan_skills, unpack_skills
from .user_projection import sync_user
from .readiness import inspect_mode, setup_brief
from .local_modes import scan_modes
from .native_mcp import inspect_mcp, edit_mcp, discover_mcp
from .projection_lifecycle import disconnect
from .environment_documents import documents
from .archives import archives, cleanup_preview
from .history import history, annotate, restore_mode


class _JsonParser(argparse.ArgumentParser):
    def error(self, message: str) -> None:
        raise HarnessError('INPUT_INVALID', message)


def _parser() -> argparse.ArgumentParser:
    parser = _JsonParser(
        prog="asl-harness",
        description="Validate ASL Environments, sync complete Skills, and project one Mode to a native Host.",
    )
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser('cli.describe', help='Describe the current Agent CLI contract without reading or writing a library')
    local = commands.add_parser('environment.discover')
    local.add_argument('--source', action='append', default=[])
    local.add_argument('--parent', type=Path)
    commands.add_parser('mcp.discover').add_argument('--source', action='append', default=[])
    for name in ('mcp.inspect', 'mcp.edit'):
        mcp = commands.add_parser(name)
        mcp.add_argument('--host-id', choices=['codex-app', 'claude-code'], required=True)
        mcp.add_argument('--project', type=Path)
        if name == 'mcp.edit':
            mcp.add_argument('--scope', choices=['user', 'project', 'local'], required=True)
    scan = commands.add_parser("skill.scan")
    scan.add_argument("--source", action="append", required=True)
    unpack = commands.add_parser("skill.unpack")
    unpack.add_argument("--source", required=True)
    unpack.add_argument("--output", required=True)

    catalog_command = commands.add_parser("environment.catalog")
    catalog_command.add_argument("--workspace", required=True)
    document_command = commands.add_parser('environment.documents', help='Read the local Profile and feedback documents')
    document_command.add_argument('--workspace', required=True)
    document_command.add_argument('--file', default='PROFILE.md')
    archive_command = commands.add_parser('environment.archive', help='Browse existing local archives without changing them')
    archive_command.add_argument('--workspace', required=True)
    archive_command.add_argument('--entry')
    archive_command.add_argument('--file')
    cleanup_command = commands.add_parser('environment.archive.cleanup', help='Preview or verify one archive before moving it to the OS recycle bin; never deletes')
    cleanup_command.add_argument('--workspace', required=True)
    cleanup_command.add_argument('--entry', required=True)
    cleanup_command.add_argument('--expected')
    history_command = commands.add_parser('environment.history', help='Read local saved Mode structures and existing Git commits')
    history_command.add_argument('--workspace', required=True)
    history_command.add_argument('--mode')
    history_command.add_argument('--revision')
    history_command.add_argument('--file')
    history_command.add_argument('--limit', type=int, default=20)
    history_command.add_argument('--offset', type=int, default=0)
    note_command = commands.add_parser('environment.history.note', help='Add an explicit explanation to an existing version; JSON on stdin')
    note_command.add_argument('--workspace', required=True)
    note_command.add_argument('--revision', required=True)
    restore_command = commands.add_parser('mode.history.restore', help='Preview or restore two Mode structure files through the normal write gate')
    restore_command.add_argument('--workspace', required=True)
    restore_command.add_argument('--mode', required=True)
    restore_command.add_argument('--revision', required=True)
    restore_command.add_argument('--expected', required=True)
    restore_command.add_argument('--check', action='store_true')
    files_command = commands.add_parser('skill.files')
    files_command.add_argument('--workspace', required=True)
    files_command.add_argument('--skill', required=True)
    files_command.add_argument('--file', default='SKILL.md')
    mode_files_command = commands.add_parser('mode.files')
    mode_files_command.add_argument('--workspace', required=True)
    mode_files_command.add_argument('--mode', required=True)
    mode_files_command.add_argument('--file', default='MODE.md')
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

    detach = commands.add_parser('host.disconnect', help='Preview and archive an owned project or preset projection')
    detach.add_argument('--workspace', required=True)
    detach.add_argument('--mode', required=True)
    detach.add_argument('--host-id', choices=sorted(HOST_LAYOUTS), required=True)
    detach.add_argument('--scope', choices=['project', 'preset'], required=True)
    detach.add_argument('--project', required=True)
    detach.add_argument('--check', action='store_true')
    detach.add_argument('--expected')

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
    create = commands.add_parser('mode.create', help='Create a first local Mode from complete Skill packages; JSON on stdin')
    create.add_argument('--target', required=True)
    create.add_argument('--check', action='store_true')
    create.add_argument('--expected')
    return parser


def _describe_cli() -> dict:
    from .mermaid import renderer_command
    project_file = Path(__file__).resolve().parents[2] / 'pyproject.toml'
    if project_file.is_file():
        with project_file.open('rb') as stream:
            current_version = tomllib.load(stream)['project']['version']
    else:
        try:
            current_version = version('asl-harness')
        except PackageNotFoundError:
            current_version = None
    registered = next(action.choices for action in _parser()._actions if isinstance(action, argparse._SubParsersAction))
    descriptions = []
    for name, parser in registered.items():
        arguments = []
        for action in parser._actions:
            if isinstance(action, argparse._HelpAction):
                continue
            arguments.append({'flags': action.option_strings, 'required': action.required,
                              'type': 'boolean' if isinstance(action, (argparse._StoreTrueAction, argparse._StoreFalseAction)) else (action.type.__name__ if action.type else 'str'),
                              'repeatable': isinstance(action, argparse._AppendAction),
                              'default': action.default,
                              **({'choices': list(action.choices)} if action.choices is not None else {})})
        descriptions.append({'name': name, 'arguments': arguments})
    command = renderer_command()
    return {'version': current_version, 'protocol': MODE_API_VERSION, 'commands': descriptions,
            'organization': {'entry': 'environment.guide', 'instructions': ORGANIZATION_GUIDE},
            'editOperations': {name: {'fields': sorted(fields)} for name, fields in EDIT_FIELDS.items()},
            'createRequest': {'fields': sorted(CREATE_FIELDS), 'sources': {'fields': sorted(CREATE_SOURCE_FIELDS)},
                              'target': 'must not exist; review with --check, then apply with --expected'},
            'history': {'storage': 'local Git refs/asl/modes/*; does not move HEAD or change the user index',
                        'scope': ['MODE.md', 'mode.yaml'], 'notesRef': 'refs/notes/asl', 'automaticPush': False,
                        'agentUse': 'Read environment.history before explaining a change. Add only an explicit change summary, user request and decision with environment.history.note; never internal reasoning or private chat transcripts.',
                        'notesRequest': {'fields': ['document', 'expected'], 'expected': 'current note fingerprint, or null when absent'}},
            'transport': {'input': {'environment.edit': 'UTF-8 JSON object on stdin', 'mode.create': 'UTF-8 JSON object on stdin', 'mcp.edit': 'UTF-8 JSON object on stdin', 'environment.history.note': 'UTF-8 JSON object on stdin'},
                          'output': 'UTF-8 JSON on stdout', 'exitCodes': {'0': 'success', '2': 'failure'}},
            'renderer': {'available': Path(command[0]).is_file(), 'executable': command[0],
                         'availabilityCheck': 'executable-file-only; actual render is checked on write',
                         'requiredFor': 'Mermaid real-render validation'},
            'writeBoundary': {'contentCommands': ['environment.edit', 'mode.create', 'mode.import', 'environment.sync', 'mode.history.restore', 'environment.history.note'],
                              'authorization': AUTHORING_POLICY,
                              'workspaceSelection': 'explicit local path; each Environment remains independent',
                              'expected': 'existing content must use fresh fingerprints; reread after a stale result',
                              'validation': 'protocol, references, lifecycle, paths, secrets and real Mermaid rendering',
                              'directFileWritesAreControlled': False, 'startsModelTasks': False, 'runsSkillScripts': False}}


def _execute(args: argparse.Namespace) -> dict:
    if args.command == 'cli.describe':
        return {'ok': True, **_describe_cli()}
    if args.command == 'environment.discover':
        return {'ok': True, **scan_modes(args.source, parent=args.parent)}
    if args.command == 'mcp.inspect':
        return {'ok': True, **inspect_mcp(args.host_id, project=args.project)}
    if args.command == 'mcp.discover':
        return {'ok': True, **discover_mcp(args.source)}
    if args.command == 'mcp.edit':
        raw = sys.stdin.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise HarnessError('MCP_ENTRY', '配置请求过大')
        request = json.loads(raw)
        if not isinstance(request, dict):
            raise HarnessError('MCP_ENTRY', '配置请求必须是对象')
        return {'ok': True, **edit_mcp(args.host_id, args.scope, request, project=args.project)}
    if args.command == "skill.scan":
        return {"ok": True, **scan_skills(args.source)}
    if args.command == "skill.unpack":
        return {"ok": True, **unpack_skills(args.source, args.output)}
    if args.command == "environment.catalog":
        return {"ok": True, **catalog(args.workspace)}
    if args.command == 'environment.documents':
        return {'ok': True, **documents(args.workspace, args.file)}
    if args.command == 'environment.archive':
        return {'ok': True, **archives(args.workspace, args.entry, args.file)}
    if args.command == 'environment.archive.cleanup':
        return {'ok': True, **cleanup_preview(args.workspace, args.entry, expected=args.expected)}
    if args.command == 'environment.history':
        return {'ok': True, **history(args.workspace, mode=args.mode, revision=args.revision,
                                      file=args.file, limit=args.limit, offset=args.offset)}
    if args.command == 'environment.history.note':
        raw = sys.stdin.read(64 * 1024 + 1)
        if len(raw) > 64 * 1024:
            raise HarnessError('HISTORY_INVALID', '说明请求过大')
        request = json.loads(raw)
        if not isinstance(request, dict) or set(request) - {'document', 'expected'}:
            raise HarnessError('HISTORY_INVALID', '说明请求包含不支持的字段')
        return {'ok': True, **annotate(args.workspace, args.revision, request.get('document'), expected=request.get('expected'))}
    if args.command == 'mode.history.restore':
        return {'ok': True, **restore_mode(args.workspace, args.mode, args.revision, expected=args.expected, check=args.check)}
    if args.command == 'skill.files':
        return {'ok': True, **skill_files(args.workspace, args.skill, args.file)}
    if args.command == 'mode.files':
        return {'ok': True, **mode_files(args.workspace, args.mode, args.file)}
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
    if args.command == 'mode.create':
        raw = sys.stdin.read(2 * 1024 * 1024 + 1)
        if len(raw) > 2 * 1024 * 1024:
            raise HarnessError('EDIT_INVALID', '修改请求过大')
        return {'ok': True, **create_mode(args.target, json.loads(raw), check=args.check, expected=args.expected)}
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
        from .mermaid import validate_packages
        diagrams = validate_packages([m.path for m in workspace.modes.values()] + [s.path for s in workspace.skills.values()])
        return {"ok": True, **workspace.summary(), "diagrams": diagrams}
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
    if args.command == 'host.disconnect':
        return {'ok': True, **disconnect(workspace, args.mode, args.host_id, args.scope,
                                        args.project, check=args.check, expected=args.expected)}
    if args.command == "host.user.sync":
        return {"ok": True, **sync_user(workspace, args.mode, args.host_id,
                                       check=args.check, expected=args.expected, remove=args.remove, skills_dir=args.skills_dir)}
    if args.command == "host.setup.inspect":
        if args.scope in {"project", "preset"} and not args.project:
            raise HarnessError("SETUP_SCOPE", "请先选择项目或 DeepSeek 工作模式的位置")
        project = Path(args.project).resolve() if args.project else None
        if project and not project.is_dir():
            raise HarnessError("SETUP_SCOPE", "所选工作位置不存在")
        report = inspect_mode(workspace, args.mode, args.host_id, project=project, probe=args.probe, scope=args.scope)
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
            {"ok": False, "error": {"code": error.code, "message": str(error), **({'details': error.details} if hasattr(error, 'details') else {})}},
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
