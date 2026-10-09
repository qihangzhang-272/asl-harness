"""Read existing Git history; no event store, model execution or inferred decisions."""
from pathlib import Path
from datetime import datetime
import difflib
import hashlib
import os
import re
import subprocess
import tempfile
import threading
import yaml

from .workspace import HarnessError, _safe_id, _UniqueKeyLoader, safe_write_path
from .portable import OMIT, SECRET_NAMES, _review, _safe_path


NOTES_REF = 'refs/notes/asl'


def _git(root: Path, *args: str, limit: int = 256 * 1024, index=None) -> bytes:
    env = {key: value for key, value in os.environ.items() if not key.startswith('GIT_')}
    env.update(GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0', GIT_NO_REPLACE_OBJECTS='1', GIT_NO_LAZY_FETCH='1')
    if index is not None:
        env['GIT_INDEX_FILE'] = str(index)
    try:
        with subprocess.Popen(['git', '--no-pager', '--literal-pathspecs', '-c', 'core.fsmonitor=false', '-c', 'commit.gpgsign=false',
                              '-c', 'i18n.logOutputEncoding=UTF-8', '-c', 'i18n.commitEncoding=UTF-8', '-C', str(root), *args],
                              stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                              env=env, creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0)) as process:
            timer = threading.Timer(10, process.kill)
            timer.start()
            try:
                output = process.stdout.read(limit + 1)
                if len(output) > limit:
                    process.kill()
                    raise HarnessError('HISTORY_LIMIT', '这条记录过大，请在本地 Git 中查看')
                if process.wait() != 0:
                    raise HarnessError('HISTORY_UNAVAILABLE', '暂时无法读取 Git 记录')
                return output
            finally:
                timer.cancel()
    except OSError as error:
        raise HarnessError('HISTORY_UNAVAILABLE', '本机 Git 不可用') from error


def _root(root: str | Path) -> Path:
    root = Path(root).resolve()
    for name in ('WORKSPACE.md', 'PROFILE.md'):
        safe_write_path(root, root / name)
        if not (root / name).is_file():
            raise HarnessError('RESOURCE_INVALID', '请选择已有本地工作库')
    return root


def _repository(root: Path) -> bool:
    if not (root / '.git').exists():
        return False
    return Path(_git(root, 'rev-parse', '--show-toplevel', limit=8192).decode().strip()).resolve() == root


def _head(root: Path, ref: str = 'HEAD') -> str | None:
    try:
        return _git(root, 'rev-parse', '--verify', ref, limit=256).decode().strip()
    except HarnessError as error:
        if error.code != 'HISTORY_UNAVAILABLE':
            raise
        return None


def _ref(mode: str) -> str:
    return 'refs/asl/modes/' + _safe_id(mode, '模式名称').replace('.', '%2E')


def _refs(root: Path, mode: str | None = None) -> list[str]:
    ref = _ref(mode) if mode else None
    refs = [ref] if ref and _head(root, ref) else []
    if not mode:
        refs = _git(root, 'for-each-ref', '--count=101', '--format=%(refname)', 'refs/asl/modes/', limit=32768).decode().splitlines()
        if len(refs) > 100:
            raise HarnessError('HISTORY_LIMIT', '请先选择一个模式再查看版本记录')
    if _head(root):
        refs.append('HEAD')
    return refs


def _checked_revision(root: Path, revision: str, refs: list[str]) -> str:
    if not isinstance(revision, str) or not re.fullmatch(r'[0-9a-f]{40}|[0-9a-f]{64}', revision):
        raise HarnessError('HISTORY_INVALID', '请选择列表中的完整版本编号')
    for ref in refs:
        try:
            _git(root, 'merge-base', '--is-ancestor', revision, ref)
            return 'save' if ref.startswith('refs/asl/modes/') else 'commit'
        except HarnessError as error:
            if error.code != 'HISTORY_UNAVAILABLE':
                raise
    raise HarnessError('HISTORY_INVALID', '版本不属于当前工作库记录')


def _file(file: str) -> str:
    if not isinstance(file, str) or any(ord(char) < 32 for char in file):
        raise HarnessError('HISTORY_INVALID', '请选择记录中的文件')
    try:
        path = _safe_path(file)
        if path.parts[0] not in {'WORKSPACE.md', 'PROFILE.md', 'skills', 'modes', 'feedback', 'archive', 'candidates', 'trials'}:
            raise ValueError()
        if any(part.lower() in SECRET_NAMES or part in OMIT or part.lower().startswith('.env') for part in path.parts):
            raise ValueError()
        _review({file: b''})
    except (HarnessError, ValueError) as error:
        raise HarnessError('HISTORY_PRIVATE', '此文件不在可查看的内容范围内') from error
    return file


def _blob(root: Path, revision: str | None, file: str, *, limit: int = 128 * 1024) -> bytes:
    if revision is None:
        return b''
    entry = _git(root, 'ls-tree', '-z', revision, '--', file, limit=8192)
    if not entry:
        return b''
    metadata, _name = entry.rstrip(b'\0').split(b'\t', 1)
    mode, kind, digest = metadata.decode().split()
    if kind != 'blob' or mode not in {'100644', '100755'}:
        raise HarnessError('HISTORY_INVALID', '链接和子仓库不能在这里读取')
    if int(_git(root, 'cat-file', '-s', digest, limit=256)) > limit:
        raise HarnessError('HISTORY_LIMIT', '文件过大，请在本地 Git 中查看')
    content = _git(root, 'cat-file', 'blob', digest, limit=limit)
    try:
        text = content.decode('utf-8')
        if '\0' in text:
            raise UnicodeError()
        _review({file: content})
    except UnicodeError as error:
        raise HarnessError('HISTORY_BINARY', '此文件请在本地 Git 中查看') from error
    except HarnessError as error:
        raise HarnessError('HISTORY_PRIVATE', '此文件可能含敏感信息，请在本地检查') from error
    return content


def _note(root: Path, revision: str) -> dict | None:
    try:
        content = _git(root, 'notes', '--ref=' + NOTES_REF, 'show', revision, limit=64 * 1024)
    except HarnessError as error:
        if error.code == 'HISTORY_UNAVAILABLE':
            return None
        raise
    try:
        document = content.decode('utf-8')
        if '\0' in document:
            raise UnicodeError()
        _review({'feedback/note.md': content})
    except (UnicodeError, HarnessError) as error:
        raise HarnessError('HISTORY_PRIVATE', '这条说明请在本地 Git 中检查') from error
    return {'document': document, 'fingerprint': hashlib.sha256(content).hexdigest()}


def _snapshot(root: Path, mode: str, revision: str) -> dict:
    document = _blob(root, revision, f'modes/{mode}/MODE.md', limit=1024 * 1024).decode('utf-8')
    raw = _blob(root, revision, f'modes/{mode}/mode.yaml', limit=1024 * 1024)
    try:
        data = yaml.load(raw, Loader=_UniqueKeyLoader)
        if not isinstance(data, dict) or data.get('kind') != 'ModeProjection' or data.get('metadata', {}).get('id') != mode or not document.strip():
            raise ValueError()
        spec = data['spec']
        skills = spec['skills']
        if not isinstance(skills, list) or not skills or any(not isinstance(value, str) for value in skills):
            raise ValueError()
        return {'document': document, 'skills': skills,
                'capabilities': spec.get('capabilities'), 'architecture': spec.get('architecture')}
    except (KeyError, TypeError, AttributeError, ValueError, yaml.YAMLError) as error:
        raise HarnessError('HISTORY_INVALID', '这个版本没有可读取的模式结构') from error


def history(root: str | Path, *, mode: str | None = None, revision: str | None = None,
            file: str | None = None, limit: int = 20, offset: int = 0) -> dict:
    root = _root(root)
    if type(limit) is not int or not 1 <= limit <= 50 or type(offset) is not int or not 0 <= offset <= 10000:
        raise HarnessError('HISTORY_INVALID', '请选择有效的记录页')
    if not _repository(root):
        return {'status': 'not-repository', 'entries': [], 'nextOffset': None}
    refs = _refs(root, mode)
    if revision is not None:
        source = _checked_revision(root, revision, refs)
        parents = _git(root, 'rev-list', '--parents', '--max-count=1', revision, limit=8192).decode().split()[1:]
        parent = parents[0] if parents else None
        arguments = [parent, revision] if parent else ['--root', revision]
        names = _git(root, 'diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', '-z', *arguments, '--').decode('utf-8', errors='replace').split('\0')
        files = []
        for name in filter(None, names):
            try:
                _file(name)
                if not mode or name.startswith(f'modes/{mode}/'):
                    files.append(name)
            except HarnessError:
                continue
        result = {'status': 'ready', 'revision': revision, 'parent': parent, 'source': source,
                  'files': files, 'note': _note(root, revision)}
        if mode:
            result['snapshot'] = _snapshot(root, mode, revision)
        if file is not None:
            _file(file)
            if file not in files:
                raise HarnessError('HISTORY_INVALID', '文件不属于这次修改')
            before = _blob(root, parent, file).decode('utf-8').splitlines(keepends=True)
            after = _blob(root, revision, file).decode('utf-8').splitlines(keepends=True)
            diff = ''.join(difflib.unified_diff(before, after, fromfile='之前/' + file, tofile='之后/' + file))
            result.update(file=file, diff=diff[:256 * 1024], truncated=len(diff) > 256 * 1024)
        return result
    if file is not None:
        raise HarnessError('HISTORY_INVALID', '请先选择一个版本')
    if not refs:
        return {'status': 'empty', 'entries': [], 'nextOffset': None}
    paths = [f'modes/{mode}/'] if mode else []
    raw = _git(root, 'log', '--source', '--date-order', '--no-show-signature', f'--max-count={limit + 1}', f'--skip={offset}',
               '--format=%H%x00%cI%x00%s%x00%S', *refs, '--', *paths).decode('utf-8', errors='replace')
    entries = []
    for line in raw.splitlines():
        revision, date, title, source = line.split('\0', 3)
        entries.append({'revision': revision, 'date': date, 'title': title,
                        'source': 'save' if source.startswith('refs/asl/modes/') else 'commit'})
    return {'status': 'ready', 'entries': entries[:limit],
            'nextOffset': offset + limit if len(entries) > limit else None}


def record_mode(root: str | Path, mode: str, *, title: str = '更新模式结构') -> dict:
    """Caller saves through management.edit; this stores only its two structural files."""
    root = _root(root)
    ref = _ref(mode)
    scope = [f'modes/{mode}/{name}' for name in ('MODE.md', 'mode.yaml')]
    if not _repository(root):
        return {'status': 'not-repository', 'scope': scope}
    files = {}
    for name in scope:
        path = root / name
        safe_write_path(root, path)
        if not path.is_file():
            return {'status': 'missing-mode', 'scope': scope}
        if path.stat().st_size > 1024 * 1024:
            raise HarnessError('HISTORY_LIMIT', '模式文件过大，未保存版本记录')
        files[name] = path.read_bytes()
    previous = _head(root, ref)
    if previous:
        entries = _git(root, 'ls-tree', '-r', '-z', previous).split(b'\0')
        stored = dict(entry.split(b'\t', 1)[::-1] for entry in entries if entry)
        algorithm = hashlib.sha256 if len(previous) == 64 else hashlib.sha1
        unchanged = all(stored.get(name.encode()) == b'100644 blob ' + algorithm(
            b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest().encode() for name, data in files.items())
        if unchanged and len(stored) == len(files):
            return {'status': 'unchanged', 'revision': previous, 'scope': scope}
    with tempfile.TemporaryDirectory(prefix='asl-history-') as temporary:
        index = Path(temporary) / 'index'
        _git(root, 'read-tree', '--empty', index=index)
        for number, (name, data) in enumerate(files.items()):
            # Raw blobs avoid repository clean filters and leave the user's index untouched.
            blob = Path(temporary) / str(number)
            blob.write_bytes(data)
            digest = _git(root, 'hash-object', '-w', '--no-filters', str(blob), limit=256).decode().strip()
            _git(root, 'update-index', '--add', '--cacheinfo', '100644', digest, name, index=index)
        tree = _git(root, 'write-tree', index=index, limit=256).decode().strip()
        if any((root / name).read_bytes() != data for name, data in files.items()):
            raise HarnessError('HISTORY_STALE', '模式已改变，请重新读取后保存版本记录')
        message = f'{datetime.now():%Y-%m-%d %H:%M}｜{title}：{mode}'
        parent = ['-p', previous] if previous else []
        try:
            revision = _git(root, 'commit-tree', tree, *parent, '-m', message, limit=256).decode().strip()
        except HarnessError:
            try:
                _git(root, 'var', 'GIT_AUTHOR_IDENT', limit=8192)
                _git(root, 'var', 'GIT_COMMITTER_IDENT', limit=8192)
            except HarnessError as error:
                raise HarnessError('HISTORY_IDENTITY', '尚未设置 Git 作者，无法保存版本记录') from error
            raise
        _git(root, 'update-ref', ref, revision, previous or '0' * len(revision))
    return {'status': 'recorded', 'revision': revision, 'scope': scope}


def annotate(root: str | Path, revision: str, document: str, *, expected: str | None = None) -> dict:
    """Explicit user/Agent explanations only; not inferred reasoning or a transcript."""
    root = _root(root)
    if not _repository(root):
        raise HarnessError('HISTORY_UNAVAILABLE', '这个工作库尚无 Git 记录')
    _checked_revision(root, revision, _refs(root))
    if not isinstance(document, str) or not document.strip() or '\0' in document or len(document.encode('utf-8')) > 60 * 1024:
        raise HarnessError('HISTORY_INVALID', '请输入不超过 60 KB 的说明')
    content = (document.rstrip() + '\n').encode('utf-8')
    _review({'feedback/note.md': content})
    from .sync import environment_write_lock
    with environment_write_lock(root):
        previous = _head(root, NOTES_REF)
        note = _note(root, revision)
        if (note['fingerprint'] if note else None) != expected:
            raise HarnessError('HISTORY_STALE', '说明已改变，请重新读取后保存')
        if note and note['document'].encode('utf-8') == content:
            return note
        with tempfile.TemporaryDirectory(prefix='asl-note-') as temporary:
            index = Path(temporary) / 'index'
            _git(root, 'read-tree', previous or '--empty', index=index)
            paths = _git(root, 'ls-tree', '-r', '--name-only', previous, limit=256 * 1024).decode().splitlines() if previous else []
            path = next((item for item in paths if item.replace('/', '') == revision), revision)
            file = Path(temporary) / 'note'
            file.write_bytes(content)
            digest = _git(root, 'hash-object', '-w', '--no-filters', str(file), limit=256).decode().strip()
            _git(root, 'update-index', '--add', '--cacheinfo', '100644', digest, path, index=index)
            tree = _git(root, 'write-tree', index=index, limit=256).decode().strip()
            parent = ['-p', previous] if previous else []
            message = f'{datetime.now():%Y-%m-%d %H:%M}｜补充版本说明'
            commit = _git(root, 'commit-tree', tree, *parent, '-m', message, limit=256).decode().strip()
            _git(root, 'update-ref', NOTES_REF, commit, previous or '0' * len(commit))
    return {'document': content.decode('utf-8'), 'fingerprint': hashlib.sha256(content).hexdigest()}


def restore_mode(root: str | Path, mode: str, revision: str, *, expected: str, check: bool = False) -> dict:
    """Restore structure through the normal write/render gate, never reset Git or Skills."""
    from . import management
    root = _root(root)
    if not _repository(root):
        raise HarnessError('HISTORY_UNAVAILABLE', '这个工作库尚无 Git 记录')
    _checked_revision(root, revision, _refs(root, mode))
    snapshot = _snapshot(root, mode, revision)
    request = {'operation': 'mode.save', 'id': mode, 'expected': expected, **snapshot}
    # The existing command owns locking, one render gate, saving, and the new history entry.
    result = management.edit(root, request, check=check)
    result.update(revision=revision, snapshot=snapshot,
                  scope=[f'modes/{mode}/MODE.md', f'modes/{mode}/mode.yaml'])
    return result
