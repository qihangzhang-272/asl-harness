"""Bounded discovery of known environments, not a new content database."""
from __future__ import annotations

import configparser
from itertools import islice
from pathlib import Path

from .management import _title, mode_upstream
from .workspace import HarnessError, SAFE_ID, _read_mode


def scan_modes(roots: list[str], *, parent: Path | None = None) -> dict:
    if len(roots) > 64:
        raise HarnessError('DISCOVERY_LIMIT', '一次最多检查 64 个已知目录')
    locations = [Path(root) for root in roots]
    issues, rows, seen = [], [], set()
    if parent:
        # ponytail: explicit folder and its direct children only; never walk a disk.
        locations.append(parent)
        try:
            locations.extend(p for p in islice(parent.iterdir(), 256) if p.is_dir() and not p.name.startswith('.'))
        except OSError:
            issues.append({'path': str(parent), 'message': '无法读取所选目录'})
    for root in locations:
        try:
            root = root.resolve(strict=True)
            if root in seen:
                continue
            seen.add(root)
            if not ((root / 'WORKSPACE.md').is_file() and (root / 'modes').is_dir() and (root / 'skills').is_dir()):
                continue
            repository = None
            config = root / '.git' / 'config'
            if config.is_file() and config.stat().st_size < 256000:
                git = configparser.ConfigParser(interpolation=None)
                git.read(config, encoding='utf-8')
                repository = git.get('remote "origin"', 'url', fallback=None)
            for package in islice((root / 'modes').iterdir(), 256):
                if not package.is_dir() or not SAFE_ID.fullmatch(package.name):
                    continue
                try:
                    for name in ('mode.yaml', 'MODE.md', 'SOURCE.md'):
                        file = package / name
                        if file.exists() and (not file.resolve().is_relative_to(root) or file.stat().st_size > 256000):
                            raise ValueError('定义越界或过大')
                    mode = _read_mode(package, package.name)
                    upstream = mode_upstream(package)
                    rows.append({'id': mode.id, 'title': _title(mode.document, mode.id),
                                 'workspace': str(root), 'skills': list(mode.skill_roots),
                                 'upstream': upstream, 'repository': upstream['repository'] if upstream else repository})
                except (OSError, ValueError, HarnessError) as error:
                    issues.append({'path': str(package), 'message': str(error)})
        except (OSError, ValueError, configparser.Error):
            issues.append({'path': str(root), 'message': '目录无法读取或来源配置无效'})
    return {'modes': rows, 'issues': issues, 'scope': 'known-roots-and-selected-direct-children'}
