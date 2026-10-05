"""A frozen CLI reports the authoritative project version, not a second constant."""
import importlib.metadata
import importlib.util
import json
from pathlib import Path
from subprocess import CompletedProcess
import pytest


def test_build_core_metadata_uses_project_version(tmp_path):
    script = Path(__file__).resolve().parents[1] / "scripts/build_desktop.py"
    spec = importlib.util.spec_from_file_location("asl_build", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    root = tmp_path / "source"
    root.mkdir()
    (root / "pyproject.toml").write_text('[project]\nname="asl-harness"\nversion="9.8.7"\n', encoding="utf-8")
    output = tmp_path / "build"
    output.mkdir()
    metadata = module.core_metadata(root, output)
    distributions = list(importlib.metadata.distributions(path=[str(output)]))
    assert metadata.parent == output
    assert len(distributions) == 1
    assert distributions[0].metadata["Name"] == "asl-harness"
    assert distributions[0].version == "9.8.7"


@pytest.mark.parametrize('rejects_invalid,rendered', [(True, 1), (False, 1), (True, 0)])
def test_packaged_smoke_checks_real_render_and_invalid_rejection(tmp_path, monkeypatch, rejects_invalid, rendered):
    script = Path(__file__).resolve().parents[1] / "scripts/build_desktop.py"
    spec = importlib.util.spec_from_file_location("asl_build", script)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    requests = []
    def edit(command, *, input, **kwargs):
        request = json.loads(input)
        requests.append(request)
        assert '```mermaid' in request['document']
        assert kwargs['timeout'] == 70
        target = tmp_path / 'modes' / request['id'] / 'MODE.md'
        if request['id'] == 'invalid-smoke' and rejects_invalid:
            return CompletedProcess(command, 2, json.dumps({'ok': False, 'error': {'code': 'MERMAID_RENDER_FAILED'}}).encode())
        target.parent.mkdir(parents=True)
        target.write_text(request['document'], encoding='utf-8')
        (tmp_path / 'WORKSPACE.md').write_text('模式视图', encoding='utf-8')
        return CompletedProcess(command, 0, json.dumps({'ok': True, 'diagrams': {'rendered': rendered}}).encode())
    monkeypatch.setattr(module.subprocess, 'run', edit)
    if not rendered:
        with pytest.raises(ValueError, match='real Mermaid render'):
            module.smoke_core(tmp_path / 'app', tmp_path)
    elif rejects_invalid:
        module.smoke_core(tmp_path / 'app', tmp_path)
    else:
        with pytest.raises(ValueError, match='invalid Mermaid'):
            module.smoke_core(tmp_path / 'app', tmp_path)
    assert [request['id'] for request in requests] == (['unicode-smoke', 'invalid-smoke'] if rendered else ['unicode-smoke'])
