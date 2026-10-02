"""The architecture collection is split without losing diagrams or old entry anchors."""
from pathlib import Path
import re


DOCS = Path(__file__).resolve().parents[1] / "docs"


def test_architecture_views_have_single_topic_files_and_compatible_index():
    index = (DOCS / "asl-architecture-views.md").read_text(encoding="utf-8")
    files = sorted((DOCS / "architecture").glob("*.md"))
    assert len(files) >= 19, "专项视图尚未拆分"
    assert "## View 9 · 当前项目状态" in index
    assert "```mermaid" not in index, "总览不重复维护专项图"
    assert sum(p.read_text(encoding="utf-8").count("```mermaid") for p in files) >= 25
    for label in ("Master", "View 2D", "View 4", "View 6", "View 8"):
        assert re.search(r"^## " + re.escape(label) + r" ·", index, re.M)
        assert sum(re.search(r"^# " + re.escape(label) + r" ·", p.read_text(encoding="utf-8"), re.M) is not None for p in files) == 1


def test_architecture_local_links_exist():
    files = [DOCS / "asl-architecture-views.md", DOCS / "product-decisions.md", *(DOCS / "architecture").glob("*.md")]
    for file in files:
        for raw in re.findall(r"\[[^\]]+\]\(([^)]+)\)", file.read_text(encoding="utf-8")):
            target = raw.split("#", 1)[0].strip().strip("<>")
            if not target or "://" in target or target.startswith("mailto:"):
                continue
            assert (file.parent / target).resolve().exists(), f"{file.name} -> {raw}"
