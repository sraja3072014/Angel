"""Safe, transactional project file management for a designated workspace."""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any, Mapping


class WorkspaceError(ValueError):
    """Raised when a plan attempts to escape the designated workspace."""


def _safe_path(workspace: Path, relative_path: str) -> Path:
    candidate = PurePosixPath(relative_path)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise WorkspaceError(f"unsafe workspace path: {relative_path!r}")
    resolved = (workspace / Path(*candidate.parts)).resolve()
    if resolved != workspace and workspace not in resolved.parents:
        raise WorkspaceError(f"path escapes workspace: {relative_path!r}")
    return resolved


def write_file(workspace: str | os.PathLike[str], relative_path: str, contents: str) -> Path:
    """Atomically write one UTF-8 file inside ``workspace``."""
    root = Path(workspace).resolve()
    root.mkdir(parents=True, exist_ok=True)
    target = _safe_path(root, relative_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            handle.write(contents)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_name, target)
    except Exception:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise
    return target


def create_file_structure(
    plan: Mapping[str, Any],
    workspace: str | os.PathLike[str] = "workspace",
) -> list[Path]:
    """Materialize a plan and return created file paths; no deletion occurs."""
    root = Path(workspace).resolve()
    root.mkdir(parents=True, exist_ok=True)
    for directory in plan.get("directories", []):
        _safe_path(root, str(directory)).mkdir(parents=True, exist_ok=True)

    created: list[Path] = []
    for spec in plan.get("files", []):
        created.append(write_file(root, str(spec["path"]), str(spec.get("content", ""))))

    dependencies = [str(item) for item in plan.get("dependencies", [])]
    if dependencies:
        created.append(write_file(root, "requirements.txt", "\n".join(dependencies) + "\n"))

    manifest = {
        "project_name": plan.get("project_name"),
        "entrypoint": plan.get("entrypoint"),
        "files": [str(path.relative_to(root)) for path in created],
        "commands": plan.get("commands", []),
        "dependency_graph": plan.get("dependency_graph", {}),
        "migrations": plan.get("migrations", []),
        "seed_scripts": plan.get("seed_scripts", []),
        "pipeline": plan.get("pipeline", []),
    }
    created.append(write_file(root, "manifest.json", json.dumps(manifest, indent=2) + "\n"))
    return created


if __name__ == "__main__":
    from agent_planner import build_plan
    import argparse

    parser = argparse.ArgumentParser(description="Materialize a Jarvis-Core plan")
    parser.add_argument("idea")
    parser.add_argument("--workspace", default="workspace")
    args = parser.parse_args()
    print("\n".join(str(path) for path in create_file_structure(build_plan(args.idea), args.workspace)))