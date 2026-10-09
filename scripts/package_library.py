"""Pair a native App with an explicitly published content commit, never a worktree."""
from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import zipfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from asl_harness.portable import MAX_BYTES, MAX_FILES, OMIT, _review, _safe_path
from asl_harness.workspace import LIFECYCLE_AREAS, Workspace

CONTENT = {'PROFILE.md', 'WORKSPACE.md', 'README.md', 'README_EN.md', 'LICENSE', 'LICENSES', 'docs', 'skills', 'modes'}


def published_content(repository: Path, revision: str) -> tuple[list, dict]:
    if not re.fullmatch(r'[0-9a-f]{40}|[0-9a-f]{64}', revision):
        raise ValueError('Use the full published commit hash, not a branch or working directory')
    command = ['git', '-c', 'core.autocrlf=false', '-c', 'core.eol=lf', '-C', str(repository.resolve())]
    environment = {key: value for key, value in os.environ.items() if not key.upper().startswith('GIT_')}
    check = subprocess.run([*command, 'merge-base', '--is-ancestor', revision, 'refs/remotes/origin/main'],
                           env=environment, capture_output=True, timeout=30)
    if check.returncode:
        raise ValueError('Commit is not in the fetched published origin/main history; fetch and review it first')
    raw = subprocess.check_output([*command, 'archive', '--format=zip', revision], env=environment, timeout=60)
    entries, files = [], {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        for entry in archive.infolist():
            if entry.is_dir():
                continue
            path = _safe_path(entry.filename)
            if path.parts[0] not in CONTENT or any(part in OMIT for part in path.parts):
                continue
            if stat.S_ISLNK(entry.external_attr >> 16):
                raise ValueError(f'Content symlinks are not a complete local Skill: {entry.filename}')
            if entry.file_size > MAX_BYTES or len(entries) >= MAX_FILES:
                raise ValueError('Content snapshot exceeds the existing package limits')
            files[entry.filename] = archive.read(entry)
            entries.append(entry)
    if sum(map(len, files.values())) > MAX_BYTES:
        raise ValueError('Content snapshot exceeds the existing package limits')
    if not {'PROFILE.md', 'WORKSPACE.md'} <= files.keys() or not any(name.startswith('modes/') for name in files):
        raise ValueError('Published snapshot has no complete Environment entry')
    _review(files)  # Same secret/path gate as sharing a Mode; no rewriting Skill bytes.
    with tempfile.TemporaryDirectory(prefix='asl-release-content-') as temporary:
        root = Path(temporary)
        for name, data in files.items():
            target = root / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        for area in LIFECYCLE_AREAS:
            (root / area).mkdir()
        files['WORKSPACE.md'] = Workspace.open(root).sync_workspace_view().read_bytes()
    return entries, files


def package(app: Path, repository: Path, revision: str, output: Path) -> dict:
    app, output = app.resolve(), output.resolve()
    checksum = output.with_suffix(output.suffix + '.sha256')
    if output.exists() or checksum.exists():
        raise ValueError('Output already exists; use a new package path')
    if output.is_relative_to(app):
        raise ValueError('Output must stay outside the App directory')
    mac = app.suffix == '.app'
    expected_name = 'ASL Workspace.app' if mac else 'ASL Workspace'
    if app.name != expected_name:
        raise ValueError(f'Use the native built {expected_name} directory')
    resources = app / ('Contents/Resources' if mac else 'resources')
    executable = app / ('Contents/MacOS/Electron' if mac else 'ASL Workspace.exe')
    core = resources / 'core' / ('asl-harness' if mac else 'asl-harness.exe')
    if not executable.is_file() or not core.is_file():
        raise ValueError('The native App and its frozen CLI are required')
    version = json.loads((resources / 'app/package.json').read_text(encoding='utf-8'))['version']
    entries, files = published_content(repository, revision)
    app_files = sorted(path for path in app.rglob('*') if path.is_file() or path.is_symlink())
    for path in app_files:
        if path.is_symlink() and not path.resolve(strict=True).is_relative_to(app):
            raise ValueError(f'App symlink leaves its bundle: {path.relative_to(app)}')
    launcher = ('#!/bin/sh\nROOT=$(CDPATH= cd -- "$(dirname "$0")" && pwd)\n'
                'exec "$ROOT/ASL Workspace.app/Contents/MacOS/Electron" --workspace "$ROOT/Agent Skill Library"\n') if mac else (
                '@echo off\r\nstart "" "%~dp0ASL Workspace\\ASL Workspace.exe" --workspace "%~dp0Agent Skill Library"\r\n')
    manifest = {'appVersion': version, 'libraryRevision': revision, 'platform': 'macOS' if mac else 'Windows',
                'generatedViews': ['WORKSPACE.md'],
                'content': 'Published files only; local changes, feedback, archives and Git metadata are excluded.'}
    with zipfile.ZipFile(output, 'x', zipfile.ZIP_DEFLATED, compresslevel=6, strict_timestamps=False) as archive:
        for path in app_files:
            name = f'{app.name}/{path.relative_to(app).as_posix()}'
            if path.is_symlink():
                info = zipfile.ZipInfo(name)
                info.create_system = 3
                info.external_attr = (stat.S_IFLNK | 0o777) << 16
                archive.writestr(info, os.readlink(path).encode('utf-8'))
            else:
                archive.write(path, name)
        for entry in entries:
            info = zipfile.ZipInfo('Agent Skill Library/' + entry.filename, entry.date_time)
            info.create_system, info.external_attr = entry.create_system, entry.external_attr
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, files[entry.filename])
        for area in LIFECYCLE_AREAS:
            archive.writestr(f'Agent Skill Library/{area}/', b'')
        info = zipfile.ZipInfo('Start.command' if mac else 'Start.cmd')
        info.create_system = 3
        info.external_attr = (stat.S_IFREG | (0o755 if mac else 0o644)) << 16
        archive.writestr(info, launcher)
        archive.writestr('RELEASE.json', json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr('开始使用.txt', '完整解压后打开 Start.command（Mac）或 Start.cmd（Windows）。\n'
                         'App 与工作库放在一起；技能和模式可以继续在本地使用、修改。\n'
                         '这是未签名／未公证的预览版。系统可能要求你确认来源；无需关闭系统防护。\n'
                         'CLI 位于 App 的 resources/core（Windows）或 Contents/Resources/core（Mac）。\n'
                         '版本历史需要本机 Git 和已建立的仓库；此内容快照不包含 Git 历史。\n')
    with zipfile.ZipFile(output) as archive:
        if archive.testzip():
            raise ValueError('Package verification failed; do not publish it')
    with output.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    with checksum.open('x', encoding='utf-8') as stream:
        stream.write(f'{digest}  {output.name}\n')
    return {**manifest, 'output': str(output), 'sha256': digest, 'contentFiles': len(files)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='把已发布内容与共用原生 App 打成内容版，不读取本地未提交内容')
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--repository', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(package(args.app, args.repository, args.revision, args.output), ensure_ascii=False))
