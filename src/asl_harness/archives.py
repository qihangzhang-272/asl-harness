"""Read and restore existing archives; cleanup is a preview for the OS recycle bin."""
from dataclasses import replace
from pathlib import Path
import hashlib
import os
import re

from .workspace import (HarnessError, Workspace, safe_write_path, _read_mode, _read_skill,
                        SECRET_FILE_SUFFIXES)
from .portable import SECRET_NAMES
from .sync import _environment_fingerprints, _require_unchanged, _rollback_paths


def _root(root):
    root = Path(root).resolve()
    for name in ('PROFILE.md', 'WORKSPACE.md', 'archive'):
        safe_write_path(root, root / name)
        if not (root / name).exists():
            raise HarnessError('RESOURCE_INVALID', '请选择已有本地工作库')
    return root


def _entry(root, entry):
    if (not isinstance(entry, str) or not entry or len(entry) > 200 or entry.startswith('.')
            or entry.endswith((' ', '.')) or re.search(r'[\\/:*?"<>|\x00-\x1f]', entry)
            or re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?', entry, re.I)):
        raise HarnessError('ARCHIVE_INVALID', '请选择归档中的一个项目')
    source = root / 'archive' / entry
    safe_write_path(root, source)
    if not source.exists():
        raise HarnessError('ARCHIVE_MISSING', '这项归档已移出，请刷新')
    return source


def _snapshot(root, source):
    digest, files, size, count = hashlib.sha256(), [], 0, 0
    # ponytail: inspect one archive at a time, bounded to 5,000 entries / 64 MB; larger archives stay on disk.
    walk = os.walk(source, followlinks=False) if source.is_dir() else [(source.parent, [], [source.name])]
    for directory, dirs, names in walk:
        dirs.sort()
        for name in sorted([*dirs, *names]):
            path = Path(directory) / name
            safe_write_path(root, path)
            count += 1
            if count > 5000:
                raise HarnessError('ARCHIVE_LIMIT', '归档文件较多，请在本地查看')
            relative = path.relative_to(source).as_posix() if source.is_dir() else name
            digest.update(relative.encode() + b'\0')
            if path.is_dir():
                digest.update(b'dir\0')
                continue
            if not path.is_file():
                raise HarnessError('ARCHIVE_INVALID', '归档包含不支持的文件类型')
            lower = name.lower()
            if (lower in SECRET_NAMES or lower.startswith('.env.') and lower != '.env.example'
                    or path.suffix.lower() in SECRET_FILE_SUFFIXES):
                raise HarnessError('SECRET_FILE_PRESENT', '归档包含受保护文件，请在本地查看')
            remaining = 64 * 1024 * 1024 - size
            if path.stat().st_size > remaining:
                raise HarnessError('ARCHIVE_LIMIT', '归档超过 64 MB，请在本地查看')
            with path.open('rb') as stream:
                raw = stream.read(remaining + 1)
            size += len(raw)
            if size > 64 * 1024 * 1024:
                raise HarnessError('ARCHIVE_LIMIT', '归档超过 64 MB，请在本地查看')
            digest.update(b'file\0' + hashlib.sha256(raw).digest())
            files.append({'path': relative, 'size': len(raw)})
    return {'fingerprint': digest.hexdigest(), 'size': size, 'files': files}


def _record(root, source):
    snapshot = _snapshot(root, source)
    kind, target, title = 'unknown', None, source.name
    matched = re.fullmatch(r'(mode|skill)-([A-Za-z0-9][A-Za-z0-9._-]*)-\d{8}T\d{6}-[0-9a-f]{6}', source.name)
    try:
        if source.is_dir() and matched:
            candidate, identifier = matched.groups()
            required = ('mode.yaml', 'MODE.md') if candidate == 'mode' else ('SKILL.md', 'SOURCE.md')
            if any((source / name).stat().st_size > 1024 * 1024 for name in required):
                raise HarnessError('ARCHIVE_LIMIT', '归档入口文件超过 1 MB，请在本地查看')
            if candidate == 'mode':
                _read_mode(source, identifier)
            else:
                _read_skill(source, identifier, root)
            kind, target, title = candidate, f'{candidate}s/{identifier}', identifier
        elif (source.is_dir() and re.fullmatch(r'feedback-[0-9a-f]{32}', source.name)
              and len(snapshot['files']) == 1 and len(list(source.iterdir())) == 1):
            file = snapshot['files'][0]['path']
            from .environment_documents import _path
            _path(root, f'feedback/{file}')
            kind, target, title = 'feedback', f'feedback/{file}', Path(file).stem
    except (HarnessError, OSError, ValueError, AttributeError):
        pass
    entry_file = 'MODE.md' if kind == 'mode' else 'SKILL.md' if kind == 'skill' else Path(target).name if target else None
    if entry_file and (source / entry_file).is_file() and (source / entry_file).stat().st_size <= 1024 * 1024:
        try:
            heading = re.search(r'^#\s+(.+)$', (source / entry_file).read_text(encoding='utf-8'), re.M)
            title = heading.group(1).strip() if heading else title
        except UnicodeError:
            pass
    return {'entry': source.name, 'title': title, 'kind': kind, 'target': target,
            'restorable': target is not None, 'cleanupAllowed': target is not None, **snapshot}


def archives(root, entry=None, file=None):
    root = _root(root)
    if entry is None:
        entries, issues = [], []
        for source in sorted((root / 'archive').iterdir()):
            if source.name == '.gitkeep':
                continue
            if len(entries) + len(issues) >= 500:
                issues.append({'code': 'ARCHIVE_LIMIT', 'message': '归档超过 500 项，其余请在本地查看'})
                break
            try:
                item = _record(root, _entry(root, source.name))
                entries.append({key: value for key, value in item.items() if key != 'files'})
            except (HarnessError, OSError) as error:
                issues.append({'entry': source.name, 'code': getattr(error, 'code', 'ARCHIVE_INVALID'), 'message': str(error)})
        return {'entries': entries, 'issues': issues}
    source = _entry(root, entry)
    record = _record(root, source)
    paths = [item['path'] for item in record['files']]
    if file is None:
        file = next((name for name in ('MODE.md', 'SKILL.md') if name in paths), paths[0] if paths else None)
    if file is not None and file not in paths:
        raise HarnessError('ARCHIVE_INVALID', '文件不在所选归档中')
    document = None
    if file is not None:
        selected = source / file if source.is_dir() else source
        if selected.stat().st_size <= 1024 * 1024:
            try:
                document = selected.read_bytes().decode('utf-8')
                if '\0' in document:
                    document = None
            except UnicodeError:
                pass
    return {**record, 'file': file, 'document': document}


def cleanup_preview(root, entry, *, expected=None):
    root = _root(root)
    source = _entry(root, entry)
    record = _record(root, source)
    if not record['cleanupAllowed']:
        raise HarnessError('ARCHIVE_UNKNOWN', '这项历史资料请在本地管理')
    if expected is not None and expected != record['fingerprint']:
        raise HarnessError('EDIT_STALE', '归档已改变，请重新查看后清理')
    return {key: record[key] for key in ('entry', 'title', 'kind', 'fingerprint', 'size')} | {'archivePath': str(source)}


def restore(root, request, *, check=False):
    root = _root(root)
    source = _entry(root, request.get('entry'))
    record = _record(root, source)
    if not record['restorable']:
        raise HarnessError('ARCHIVE_UNKNOWN', '这项历史资料没有可确认的原位置，请在本地管理')
    if record['fingerprint'] != request.get('expected'):
        raise HarnessError('EDIT_STALE', '归档已改变，请重新查看后恢复')
    target = root / record['target']
    safe_write_path(root, target)
    if target.exists():
        raise HarnessError('ARCHIVE_CONFLICT', '原位置已有内容，未覆盖；请先处理同名项目')
    workspace = Workspace.open(root)
    observed = _environment_fingerprints(workspace)
    observed[target] = None
    kind = record['kind']
    if kind == 'mode':
        item = _read_mode(source, target.name)
        replace(workspace, modes={**workspace.modes, item.id: item})._validate_graph()
    elif kind == 'skill':
        item = _read_skill(source, target.name, root)
        replace(workspace, skills={**workspace.skills, item.id: item})._validate_graph()
    else:
        from .environment_documents import _read
        document, _ = _read(source / target.name)
        if not document.strip():
            raise HarnessError('EDIT_INVALID', '归档记录为空，请先在本地检查')
    from .mermaid import validate_packages
    diagrams = validate_packages([source])
    paths = [f'archive/{source.name}', record['target'], 'WORKSPACE.md']
    report = {'operation': 'archive.restore', 'entry': source.name, 'target': record['target'],
              'check': check, 'changed': True, 'changedPaths': paths, 'diagrams': diagrams,
              'affectedModes': [target.name] if kind == 'mode' else []}
    if check:
        return report
    if _record(root, source)['fingerprint'] != record['fingerprint']:
        raise HarnessError('EDIT_STALE', '归档在检查期间已改变，未恢复')
    _require_unchanged(observed, 'EDIT_STALE')
    safe_write_path(root, target)
    with _rollback_paths(root, paths):
        target.parent.mkdir(parents=True, exist_ok=True)
        if kind == 'feedback':
            (source / target.name).rename(target)
            source.rmdir()
        else:
            source.rename(target)
        Workspace.open(root).sync_workspace_view()
    return report
