"""Describe existing native manifests without resolving, installing or executing them."""
from __future__ import annotations

import json
import re
import tomllib
from pathlib import PurePosixPath


def describe_dependencies(files: dict[str, bytes]) -> list[dict]:
    reports = []
    formats = {"package.json": "Node.js", "pyproject.toml": "Python", "requirements.txt": "Python",
               "mcp.json": "MCP", ".mcp.json": "MCP"}
    for path, data in sorted(files.items()):
        name = PurePosixPath(path).name.lower()
        if name not in formats:
            continue
        report = {"file": path, "kind": formats[name], "requirements": [],
                  "environmentVariables": [], "setupScripts": [], "parseWarning": None}
        reports.append(report)
        try:
            if len(data) > 2 * 1024 * 1024:
                raise ValueError("Manifest too large for preview")
            text = data.decode("utf-8")
            if name == "requirements.txt":
                lines = [line.strip() for line in text.splitlines() if line.strip() and not line.lstrip().startswith("#")]
                report["requirements"] = [line for line in lines if not line.startswith("-")]
                if len(lines) != len(report["requirements"]):
                    report["parseWarning"] = "含安装器选项或其他文件引用，需按原文件处理；未自动展开。"
                continue
            doc = tomllib.loads(text) if name == "pyproject.toml" else json.loads(text)
            if not isinstance(doc, dict):
                raise ValueError("Manifest must be an object")
            if name == "package.json":
                for field in ("engines", "dependencies"):
                    for key, value in doc.get(field, {}).items():
                        if not isinstance(value, str):
                            raise ValueError("Invalid requirement")
                        report["requirements"].append(f"{key} {value}")
                report["setupScripts"] = sorted(set(doc.get("scripts", {})) & {"preinstall", "install", "postinstall", "prepare", "build"})
            elif name == "pyproject.toml":
                project = doc.get("project", {})
                if project.get("requires-python"):
                    report["requirements"].append(f"Python {project['requires-python']}")
                requirements = project.get("dependencies", [])
                if not isinstance(requirements, list) or any(not isinstance(item, str) for item in requirements):
                    raise ValueError("Invalid Python requirements")
                report["requirements"].extend(requirements)
                if "dependencies" in project.get("dynamic", []):
                    report["parseWarning"] = "依赖由项目动态生成；未运行项目代码来获取。"
                elif doc.get("build-system") or project.get("optional-dependencies"):
                    report["parseWarning"] = "这里只列基础直接依赖；构建与可选依赖仍以原声明为准。"
            else:
                variables = set()
                for server, config in doc.get("mcpServers", {}).items():
                    if not isinstance(config, dict):
                        raise ValueError("Invalid MCP server")
                    transport = "stdio" if config.get("command") else "http" if config.get("url") else "unknown"
                    report["requirements"].append(f"{server} ({transport})")
                    variables.update(config.get("env", {}).keys())
                    variables.update(re.findall(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}", json.dumps(config)))
                report["environmentVariables"] = sorted(variables)
        except (UnicodeDecodeError, ValueError, TypeError, AttributeError, RecursionError):
            # A manifest preview is not a new gate on transferring complete content.
            report["parseWarning"] = "声明无法完整解析；请查看原文件。未执行任何检查或安装命令。"
    return reports
