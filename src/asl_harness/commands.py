from __future__ import annotations

import argparse
import json
import sys
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


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="asl-harness",
        description="Validate ASL Environments, sync complete Skills, and project one Mode to a native Host.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

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
    return parser


def _execute(args: argparse.Namespace) -> dict:
    if args.command == "mode.export":
        return {"ok": True, **export_pack(args.workspace, args.mode, args.output,
                                          include_profile=args.include_profile, check=args.check)}
    if args.command == "mode.inspect":
        return {"ok": True, **inspect_pack(args.source)}
    if args.command == "mode.import":
        return {"ok": True, **import_pack(args.source, args.target, check=args.check, replace=args.replace)}
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
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
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
