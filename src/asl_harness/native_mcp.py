"""Edit native MCP entries in place; no credential store, launcher or mirror database."""
from __future__ import annotations

import hashlib
import json
import os
import re
from itertools import islice
from pathlib import Path
from urllib.parse import urlparse

import tomlkit

from .adapters import _write_bytes_atomic
from .workspace import HarnessError

MASK = '••••••••'
LIMIT = 2 * 1024 * 1024


def _paths(host, home, env, project):
    home, env = home or Path.home(), os.environ if env is None else env
    if host == 'codex-app':
        paths = {'user': Path(env.get('CODEX_HOME') or home / '.codex') / 'config.toml'}
        if project:
            paths['project'] = project / '.codex/config.toml'
    elif host == 'claude-code':
        user = Path(env['CLAUDE_CONFIG_DIR']) / '.claude.json' if env.get('CLAUDE_CONFIG_DIR') else home / '.claude.json'
        paths = {'user': user}
        if project:
            paths.update(project=project / '.mcp.json', local=user)
    else:
        raise HarnessError('MCP_HOST', '此处只管理 Claude Code 和 Codex 的原生 MCP 配置')
    return paths


def _raw(file):
    if not file.exists():
        return b''
    if not file.is_file() or file.stat().st_size > LIMIT:
        raise HarnessError('MCP_CONFIG', '配置不是普通文件或超过 2 MB，请在原位置检查')
    return file.read_bytes()


def _parse(file, raw):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('duplicate key')
            result[key] = value
        return result
    try:
        data = tomlkit.parse(raw.decode('utf-8-sig')) if file.suffix == '.toml' else json.loads(raw or b'{}', object_pairs_hook=unique)
        if not isinstance(data, dict):
            raise ValueError()
        return data
    except Exception as error:
        # Parser messages can contain the original credentials. Never return the raw exception.
        raise HarnessError('MCP_CONFIG', '原生配置格式损坏，请先在原文件修正；没有覆盖它') from error


def _project(data, project, create=False):
    projects = data.setdefault('projects', {}) if create else data.get('projects', {})
    if not isinstance(projects, dict):
        raise HarnessError('MCP_CONFIG', 'projects 字段不是对象')
    target = os.path.normcase(os.path.normpath(str(project)))
    key = next((key for key in projects if os.path.normcase(os.path.normpath(key)) == target), project.as_posix())
    result = projects.setdefault(key, {}) if create else projects.get(key, {})
    if not isinstance(result, dict):
        raise HarnessError('MCP_CONFIG', '项目配置不是对象')
    return result


def _servers(data, host, scope, project, create=False):
    target = _project(data, project, create) if scope == 'local' else data
    key = 'mcp_servers' if host == 'codex-app' else 'mcpServers'
    result = target.setdefault(key, {}) if create else target.get(key, {})
    if not isinstance(result, dict):
        raise HarnessError('MCP_CONFIG', 'MCP 列表不是对象')
    return result


def _masked(value, key=''):
    if isinstance(value, dict):
        return {k: (MASK if key in {'env', 'headers', 'http_headers'} and isinstance(v, str) else _masked(v, k)) for k, v in value.items()}
    if isinstance(value, list):
        return [_masked(v) for v in value]
    if isinstance(value, str) and re.search(r'(secret|password|token|api.?key)', key, re.I) and not key.endswith('_env_var'):
        return MASK
    return value


def _restore(value, original):
    if value == MASK:
        if not isinstance(original, str):
            raise HarnessError('MCP_SECRET', '新字段不能使用隐藏占位符，请填写实际值或环境变量引用')
        return original
    if isinstance(value, dict):
        return {k: _restore(v, original.get(k) if isinstance(original, dict) else None) for k, v in value.items()}
    if isinstance(value, list):
        return [_restore(v, original[i] if isinstance(original, list) and i < len(original) else None) for i, v in enumerate(value)]
    return value


def inspect_mcp(host, *, project=None, home=None, env=None, _snapshot=None):
    project = Path(project).resolve() if project else None
    paths = _paths(host, home, env, project)
    snapshot = {} if _snapshot is None else _snapshot
    def read(file):
        if file not in snapshot:
            raw = _raw(file)
            snapshot[file] = raw, _parse(file, raw)
        return snapshot[file]
    sources = []
    disabled, toggle_hash = [], None
    if host == 'claude-code' and project:
        try:
            raw, data = read(paths['user'])
            disabled = _project(data, project).get('disabledMcpServers', [])
            if not isinstance(disabled, list) or any(not isinstance(v, str) for v in disabled):
                raise HarnessError('MCP_CONFIG', '停用列表格式无效')
            toggle_hash = hashlib.sha256(raw).hexdigest()
        except (OSError, HarnessError):
            disabled, toggle_hash = [], None
    for scope, file in paths.items():
        row = {'scope': scope, 'file': str(file), 'servers': [], 'error': None, 'fingerprint': None,
               'toggleFingerprint': toggle_hash, 'canToggle': host == 'codex-app' or bool(project and toggle_hash)}
        try:
            raw, data = read(file)
            row['fingerprint'] = hashlib.sha256(raw).hexdigest()
            for name, definition in _servers(data, host, scope, project).items():
                if not isinstance(definition, dict):
                    raise HarnessError('MCP_CONFIG', 'MCP 条目不是对象')
                _validate(definition, host)
                row['servers'].append({'name': name, 'definition': _masked(definition),
                    'enabled': definition.get('enabled', True) if host == 'codex-app' else name not in disabled})
        except (OSError, HarnessError):
            row.update(error='配置无法读取或格式无效，请检查原文件；不会覆盖原内容', servers=[])
        sources.append(row)
    return {'host': host, 'project': str(project) if project else None, 'sources': sources,
            'notice': '仅展示原生配置声明，未连接测试。插件、组织托管和账号连接请在原 Agent 管理。'}


def _validate(definition, host):
    if not isinstance(definition, dict) or bool(definition.get('command')) == bool(definition.get('url')):
        raise HarnessError('MCP_ENTRY', '请选择一种连接：本地命令或服务 URL')
    for key in ('command', 'url'):
        if key in definition and (not isinstance(definition[key], str) or not definition[key].strip() or '\0' in definition[key]):
            raise HarnessError('MCP_ENTRY', '命令或 URL 无效')
    if 'url' in definition:
        try:
            url = urlparse(definition['url'])
            if url.scheme not in {'http', 'https'} or not url.hostname:
                raise ValueError()
        except ValueError as error:
            raise HarnessError('MCP_ENTRY', '服务 URL 只支持有效的 HTTP 或 HTTPS 地址') from error
    if 'enabled' in definition and type(definition['enabled']) is not bool:
        raise HarnessError('MCP_ENTRY', '启用状态必须为布尔值')
    if 'args' in definition and (not isinstance(definition['args'], list) or any(not isinstance(v, str) or '\0' in v for v in definition['args'])):
        raise HarnessError('MCP_ENTRY', '命令参数必须是字符串列表')
    for key in ('env', 'headers', 'http_headers'):
        if key in definition and (not isinstance(definition[key], dict) or any(not isinstance(v, str) for v in definition[key].values())):
            raise HarnessError('MCP_ENTRY', '环境变量和请求头必须是文本键值对')
    if host == 'claude-code' and definition.get('type', 'stdio') not in {'stdio', 'http', 'sse'}:
        raise HarnessError('MCP_ENTRY', '未知的 Claude MCP 连接类型')
    if 'type' in definition and (definition['type'] == 'stdio') != bool(definition.get('command')):
        raise HarnessError('MCP_ENTRY', '连接类型和命令 / URL 不匹配')


def edit_mcp(host, scope, request, *, project=None, home=None, env=None):
    project = Path(project).resolve() if project else None
    paths = _paths(host, home, env, project)
    if scope not in paths or project and not project.is_dir():
        raise HarnessError('MCP_SCOPE', '请先选择有效的项目和配置范围')
    name, operation = request.get('name'), request.get('operation', 'save')
    if not isinstance(name, str) or not re.fullmatch(r'[\w.-]{1,128}', name) or operation not in {'save', 'remove', 'toggle'}:
        raise HarnessError('MCP_ENTRY', '条目名称或操作无效')
    file = paths['user'] if operation == 'toggle' and host == 'claude-code' else paths[scope]
    if file.is_symlink():
        raise HarnessError('MCP_CONFIG', '此配置是符号链接，请在原文件编辑；ASL 不会替换链接')
    raw = _raw(file)
    if request.get('expected') != hashlib.sha256(raw).hexdigest():
        raise HarnessError('MCP_STALE', '配置已变化，请重新读取后再保存')
    data = _parse(file, raw)
    servers = _servers(data, host, 'user' if operation == 'toggle' and host == 'claude-code' else scope, project, True)
    if operation == 'toggle':
        if type(request.get('enabled')) is not bool:
            raise HarnessError('MCP_ENTRY', '开关必须为布尔值')
        if host == 'claude-code':
            if not project:
                raise HarnessError('MCP_SCOPE', 'Claude 的停用状态属于项目，请先选择项目')
            target_file = paths[scope]
            target_data = data if target_file == file else _parse(target_file, _raw(target_file))
            if name not in _servers(target_data, host, scope, project):
                raise HarnessError('MCP_ENTRY', '条目已不存在')
            target = _project(data, project, True)
            disabled = target.get('disabledMcpServers', [])
            if not isinstance(disabled, list):
                raise HarnessError('MCP_CONFIG', '原停用列表格式无效')
            target['disabledMcpServers'] = [v for v in disabled if v != name] + ([] if request['enabled'] else [name])
        elif name in servers:
            servers[name]['enabled'] = request['enabled']
        else:
            raise HarnessError('MCP_ENTRY', '条目已不存在')
    elif operation == 'remove':
        if name not in servers:
            raise HarnessError('MCP_ENTRY', '条目已不存在')
        del servers[name]
    else:
        definition = _restore(request.get('definition'), servers.get(name))
        _validate(definition, host)
        servers[name] = definition
    rendered = (tomlkit.dumps(data) if file.suffix == '.toml' else json.dumps(data, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if len(rendered) > LIMIT:
        raise HarnessError('MCP_ENTRY', '配置超过 2 MB')
    _parse(file, rendered)
    # One latest backup beside the native file, never inside a portable Mode or app log.
    file.parent.mkdir(parents=True, exist_ok=True)
    lock = file.with_name(file.name + '.asl-lock')
    try:
        descriptor = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError as error:
        raise HarnessError('MCP_BUSY', '另一项配置操作尚未结束') from error
    backup = file.with_name(file.name + '.asl-backup')
    try:
        os.close(descriptor)
        if _raw(file) != raw:
            raise HarnessError('MCP_STALE', '配置已变化，请重新读取后再保存')
        if raw:
            _write_bytes_atomic(backup, raw)
        _write_bytes_atomic(file, rendered)
    finally:
        lock.unlink()
    return {'file': str(file), 'backup': str(backup) if raw else None, 'scope': scope,
            'name': name, 'configured': True, 'verified': False}


def discover_mcp(roots=(), *, home=None, env=None):
    """Read standard files and registered projects, never recursively search a home/disk."""
    projects, issues = {}, []
    candidates = list(roots)
    for host in ('claude-code', 'codex-app'):
        file = _paths(host, home, env, None)['user']
        try:
            registered = _parse(file, _raw(file)).get('projects', {})
            if isinstance(registered, dict):
                candidates.extend(islice(registered, 256))
        except (OSError, HarnessError):
            issues.append({'path': str(file), 'message': '无法读取已登记项目'})
    truncated = False
    for value in candidates:
        try:
            path = Path(value)
            if not path.is_absolute() or not path.is_dir():
                continue
            path = path.resolve()
            if path in projects:
                continue
            if len(projects) == 64:
                truncated = True
                break
            projects[path] = str(path)
        except (OSError, ValueError, TypeError):
            continue
    sources, snapshot = [], {}
    for host in ('codex-app', 'claude-code'):
        for project in (None, *projects):
            for row in inspect_mcp(host, project=project, home=home, env=env, _snapshot=snapshot)['sources']:
                if project and row['scope'] == 'user' or not row['servers'] and not row['error']:
                    continue
                sources.append({'host': host, 'project': str(project) if project else None,
                    'scope': row['scope'], 'file': row['file'], 'error': row['error'],
                    'servers': [{'name': s['name'], 'enabled': s['enabled']} for s in row['servers']]})
    return {'projects': list(projects.values()), 'sources': sources, 'issues': issues, 'truncated': truncated}
