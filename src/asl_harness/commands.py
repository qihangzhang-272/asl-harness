from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Sequence

import yaml

from .adapters import HOST_LAYOUTS, project_mode, verify_mode_projection
from .deepseek import export_preset
from .workspace import HarnessError, Workspace


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="asl-harness",
        description="Validate one ASL Environment and project one Mode to a native Host.",
    )
    commands = parser.add_subparsers(dest="command", required=True)

    validate = commands.add_parser("workspace.validate")
    validate.add_argument("--workspace", required=True, help="Personal Harness Environment root")

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
    return parser


def _execute(args: argparse.Namespace) -> dict:
    workspace = Workspace.open(args.workspace)
    if args.command == "workspace.validate":
        return {"ok": True, **workspace.summary()}
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
        return {"ok": True, "projection": projection}
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
    raise HarnessError("UNKNOWN_COMMAND", args.command)


def main(argv: Sequence[str] | None = None) -> int:
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
