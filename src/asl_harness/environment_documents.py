"""The existing Profile and feedback documents, not a second content store."""
from pathlib import Path
import hashlib
import re
from uuid import uuid4

from .workspace import HarnessError, Workspace, safe_write_path
from .sync import _environment_fingerprints, _require_unchanged, _rollback_paths


def _path(root: Path, file: str) -> Path:
    if not isinstance(file, str) or any(ord(char) < 32 for char in file) or (file != 'PROFILE.md' and not re.fullmatch(r'feedback/[^/\\.:*?"<>|][^/\\:*?"<>|]{0,140}\.md', file)):
        raise HarnessError('EDIT_INVALID', '请选择工作偏好或反馈目录中的 Markdown 文件')
    if any(part in {'.', '..'} for part in file.split('/')):
        raise HarnessError('EDIT_INVALID', '无效的文件位置')
    if re.fullmatch(r'(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])', Path(file).stem, re.I):
        raise HarnessError('EDIT_INVALID', '请使用普通文档名称')
    path = root / file
    safe_write_path(root, path)
    return path


def _read(path: Path) -> tuple[str, str]:
    if not path.is_file() or path.stat().st_size > 1024 * 1024:
        raise HarnessError('EDIT_INVALID', '文件不存在或超过 1 MB，请在本地查看')
    try:
        raw = path.read_bytes()
        text = raw.decode('utf-8')
    except (OSError, UnicodeError) as error:
        raise HarnessError('RESOURCE_INVALID', f'无法读取文档：{path}') from error
    if '\0' in text:
        raise HarnessError('EDIT_INVALID', '请选择文本文件')
    return text, hashlib.sha256(raw).hexdigest()


def documents(root: str | Path, file: str = 'PROFILE.md') -> dict:
    root = Path(root).resolve()
    for name in ('WORKSPACE.md', 'PROFILE.md'):
        safe_write_path(root, root / name)
        if not (root / name).is_file():
            raise HarnessError('RESOURCE_INVALID', '请选择已有本地工作库')
    target = _path(root, file)
    text, fingerprint = _read(target)
    files = [{'path': 'PROFILE.md', 'title': '工作偏好'}]
    issues = []
    safe_write_path(root, root / 'feedback')
    for path in sorted((root / 'feedback').glob('*.md')):
        relative = path.relative_to(root).as_posix()
        try:
            content, _ = _read(_path(root, relative))
            title = re.search(r'^#\s+(.+)$', content, re.M)
            files.append({'path': relative, 'title': title.group(1).strip() if title else path.stem})
        except HarnessError as error:
            issues.append({'path': relative, 'code': error.code, 'message': str(error)})
    return {'file': file, 'document': text, 'fingerprint': fingerprint, 'files': files, 'issues': issues}


def edit_document(root: str | Path, request: dict, *, check=False) -> dict:
    # management.edit owns the same write lock as every other managed content edit.
    workspace = Workspace.open(root)
    root = workspace.root
    file = request.get('file')
    target = _path(root, file)
    archive = request['operation'].endswith('.archive')
    if archive and file == 'PROFILE.md':
        raise HarnessError('EDIT_INVALID', '工作偏好不能归档')
    existing = _read(target)[1] if target.exists() else None
    if existing != request.get('expected'):
        raise HarnessError('EDIT_STALE', '内容已改变，请重新读取后保存；未覆盖现有内容')
    if archive and existing is None:
        raise HarnessError('EDIT_INVALID', '反馈记录不存在')
    observed = _environment_fingerprints(workspace)
    observed[target] = existing
    changed = [file, 'WORKSPACE.md']
    result = {'operation': request['operation'], 'file': file, 'check': check, 'changed': True,
              'changedPaths': changed, 'affectedModes': sorted(workspace.modes) if file == 'PROFILE.md' else []}
    if archive:
        archive_directory = f'archive/feedback-{uuid4().hex}'
        destination = f'{archive_directory}/{target.name}'
        safe_write_path(root, root / destination)
        changed.append(archive_directory)
        result['archivePath'] = destination
    else:
        document = request.get('document')
        if not isinstance(document, str) or not document.strip() or '\0' in document or len(document.encode('utf-8')) > 1024 * 1024:
            raise HarnessError('EDIT_INVALID', '请输入不超过 1 MB 的非空文本')
        if file == 'PROFILE.md':
            from .adapters import MANAGED_START, MANAGED_END
            if MANAGED_START in document or MANAGED_END in document:
                raise HarnessError('HOST_INSTRUCTION_COLLISION', '工作偏好不能包含 ASL 生成标记')
        from .mermaid import validate_documents
        result['diagrams'] = validate_documents([{'file': str(target), 'text': document}])
    if check:
        return result
    _require_unchanged(observed, 'EDIT_STALE')
    safe_write_path(root, target)
    with _rollback_paths(root, changed):
        if archive:
            (root / destination).parent.mkdir(parents=True)
            target.rename(root / destination)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(document.encode('utf-8'))
        Workspace.open(root).sync_workspace_view()
    return result
