"""A frozen CLI reports the authoritative project version, not a second constant."""
import importlib.metadata
import importlib.util
from pathlib import Path


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
