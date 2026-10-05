"""Real-render gate for locally adopted diagrams; no model calls or generated business data."""
from __future__ import annotations
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
from .workspace import HarnessError


def renderer_command() -> list[str]:
    if getattr(sys, 'frozen', False):
        executable = Path(sys.executable).resolve().parents[2] / 'ASL Workspace.exe'
        return [str(executable), '--validate-mermaid']
    else:
        desktop = Path(__file__).resolve().parents[2] / 'desktop'
        executable = desktop / 'node_modules/electron/dist' / ('electron.exe' if os.name == 'nt' else 'electron')
        return [str(executable), str(desktop), '--validate-mermaid']


def validate_documents(documents: list[dict]) -> dict:
    pending = [d for d in documents if d['file'].lower().endswith(('.mmd', '.mermaid')) or
               re.search(r'(?im)^[ \t>]*(?:`{3,}|~{3,})[ \t]*mermaid\b', d['text'])]
    if not pending:
        return {'ok': True, 'rendered': 0, 'errors': []}
    for document in pending:
        if len(document['text'].encode('utf-8')) > 1024 * 1024:
            raise HarnessError('MERMAID_DOCUMENT_TOO_LARGE', f"含图文档超过 1 MB，请拆分后重新提交：{document['file']}")
    command = renderer_command()
    executable = Path(command[0])
    if not executable.is_file():
        raise HarnessError('MERMAID_RENDERER_UNAVAILABLE', '需要随 App 提供的 Mermaid 渲染器才能验收。保留草稿，请使用当前 ASL App 附带的核心重新提交，不要跳过校验。')
    # The renderer is independent of a host's Node preload/debug hooks.
    environment = {k: v for k, v in os.environ.items() if k.upper() not in {'ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS'}}
    try:
        # Windows GUI executables do not reliably expose stdin. Use one private temporary input.
        with tempfile.TemporaryDirectory(prefix='asl-mermaid-') as temporary:
            input_file = Path(temporary) / 'diagrams.json'
            input_file.write_text(json.dumps(pending, ensure_ascii=False), encoding='utf-8')
            result = subprocess.run([*command, str(input_file)], capture_output=True,
                                    text=True, encoding='utf-8', errors='replace', timeout=55, env=environment,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    except (OSError, subprocess.TimeoutExpired) as failure:
        raise HarnessError('MERMAID_RENDERER_UNAVAILABLE', f'Mermaid 渲染验收未完成，原文未写入；请重试：{failure}') from failure
    try:
        report = json.loads(result.stdout.strip())
        if not isinstance(report, dict):
            raise ValueError('Renderer report is not an object')
    except ValueError as cause:
        failure = HarnessError('MERMAID_RENDERER_UNAVAILABLE', '图示校验程序未能正常运行，内容未保存。请保留草稿，用正式安装版重试；如果仍失败，请检查程序目录权限。')
        failure.details = [{'executable': str(executable), 'exitCode': result.returncode,
                            'exitCodeHex': f'0x{result.returncode & 0xffffffff:08X}',
                            'stderr': result.stderr.strip()[:2000], 'message': str(cause),
                            'action': '使用正式安装版随附核心重新验收；检查运行目录权限，不要修改图或绕过校验。'}]
        raise failure from cause
    if 'rendered' not in report:
        raise HarnessError('MERMAID_RENDERER_UNAVAILABLE', '渲染器未完成检查；保留草稿后重试：' + str(report.get('errors')))
    if result.returncode or not report.get('ok'):
        errors = report.get('errors') or [{'file': pending[0]['file'], 'message': '渲染器未返回成功'}]
        message = '\n'.join(f"{e.get('file', pending[0]['file'])} · 第 {e.get('diagram', 1)} 张图 · 代码块起始行 {e.get('line', '?')}：{e['message']}" for e in errors)
        failure = HarnessError('MERMAID_RENDER_FAILED', message + '\n请修正 Mermaid 原文后重新提交，原有有效文件未被覆盖。')
        failure.details = errors
        raise failure
    return report


def validate_packages(packages, *, file_roots: dict[Path, str] | None = None) -> dict:
    from .sync import _ignore_generated
    documents = []
    for package in packages:
        for directory, dirs, files in os.walk(package, followlinks=False):
            ignored = _ignore_generated(directory, dirs + files)
            dirs[:] = [d for d in dirs if d not in ignored and not Path(directory, d).is_symlink()]
            for name in files:
                file = Path(directory, name)
                if name in ignored or file.suffix.lower() not in {'.md', '.mmd', '.mermaid'} or file.is_symlink():
                    continue
                label = (file_roots or {}).get(package)
                documents.append({'file': f'{label}/{file.relative_to(package).as_posix()}' if label else str(file),
                                  'text': file.read_text(encoding='utf-8')})
    return validate_documents(documents)
