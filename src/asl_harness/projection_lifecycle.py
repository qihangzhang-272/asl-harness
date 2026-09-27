"""Preview and disconnect verified ASL projections; preserve originals and native settings."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from uuid import uuid4

from .adapters import (HOST_LAYOUTS, MANAGED_START, MANAGED_END, _manifest_path,
                       _write_bytes_atomic, verify_mode_projection)
from .deepseek import verify_preset
from .workspace import HarnessError, Workspace, package_fingerprint


def disconnect(workspace: Workspace, mode: str, host: str, scope: str,
               project: str | Path, *, check: bool = False, expected: str | None = None) -> dict:
    target = Path(project).absolute()
    if target.is_symlink() or target.resolve() != target:
        raise HarnessError('PATH_ESCAPE', '请在真实项目或预设目录管理配置')
    instruction = None
    original = None
    if scope == 'preset' and host == 'deepseek-harness':
        verify_preset(workspace, mode, target)
        paths = [target]
        archive_root = target.parent.parent / '.asl' / 'disabled-presets'
        state = package_fingerprint(target)
    elif scope == 'project' and host in HOST_LAYOUTS:
        verify_mode_projection(workspace, target, mode, host_id=host)
        marker = _manifest_path(target, host)
        record = json.loads(marker.read_text(encoding='utf-8'))
        paths = [target / row['nativePath'] for row in record['skillProjections']] + [marker]
        instruction = target / HOST_LAYOUTS[host]['instructionFile']
        for file in [*paths, instruction]:
            if not file.parent.resolve().is_relative_to(target):
                raise HarnessError('PATH_ESCAPE', '配置目录指向项目外，未作修改')
        original = instruction.read_bytes()
        state = record, original.hex()
        archive_root = target / '.asl' / 'disabled'
    else:
        raise HarnessError('HOST_UNSUPPORTED', '不支持的停用范围')
    if not archive_root.resolve().is_relative_to(target if scope == 'project' else target.parent.parent):
        raise HarnessError('PATH_ESCAPE', '归档目录越界')
    fingerprint = hashlib.sha256(json.dumps([str(target), host, mode, scope, state], sort_keys=True).encode()).hexdigest()
    report = {'status': 'preview', 'host': host, 'mode': mode, 'scope': scope,
              'fingerprint': fingerprint, 'paths': [str(p) for p in paths],
              'instruction': str(instruction) if instruction else None}
    if check:
        return report
    if expected != fingerprint:
        raise HarnessError('EDIT_STALE', '配置已变化，请刷新后重新确认停用')
    archive = archive_root / uuid4().hex
    archive.mkdir(parents=True, exist_ok=False)
    moved = []
    try:
        for file in paths:
            destination = archive / (file.relative_to(target) if scope == 'project' else file.name)
            destination.parent.mkdir(parents=True, exist_ok=True)
            file.rename(destination)
            moved.append((file, destination))
        if instruction:
            (archive / 'instructions-before.txt').write_bytes(original)
            text = original.decode('utf-8')
            before, rest = text.split(MANAGED_START, 1)
            _, after = rest.split(MANAGED_END, 1)
            _write_bytes_atomic(instruction, (before + after).encode('utf-8'))
    except BaseException:
        for file, destination in reversed(moved):
            destination.rename(file)
        if instruction:
            _write_bytes_atomic(instruction, original)
        raise
    return {**report, 'status': 'disconnected', 'archive': str(archive)}
