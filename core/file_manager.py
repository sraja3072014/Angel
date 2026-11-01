"""Transactional project file management for a designated workspace."""

from __future__ import annotations

import json
import os
import shutil
import stat
import tempfile
import uuid
from pathlib import Path
from typing import Any, Mapping

from .path_policy import WorkspacePathError, validate_workspace_relative_path


class WorkspaceError(WorkspacePathError):
    """Raised when a plan attempts to escape the designated workspace."""


def _safe_path(workspace: Path, relative_path: str) -> Path:
    return validate_workspace_relative_path(relative_path, workspace)


def write_file(workspace: str | os.PathLike[str], relative_path: str, contents: str) -> Path:
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


def _validate_staged_files(staging: Path, relative_paths: list[str]) -> None:
    for relative in relative_paths:
        target = _safe_path(staging, relative)
        if not target.is_file():
            raise WorkspaceError(f"staged file was not materialized: {relative!r}")
        if target.suffix == ".py":
            compile(target.read_text(encoding="utf-8"), str(target), "exec")
        elif target.suffix == ".json":
            json.loads(target.read_text(encoding="utf-8"))


def create_file_structure(plan: Mapping[str, Any], workspace: str | os.PathLike[str] = "workspace") -> list[Path]:
    """Build a workspace off to the side and atomically publish it on success."""
    from .agent_planner import validate_plan

    normalized = validate_plan(plan)
    root = Path(workspace).expanduser().resolve()
    parent = root.parent
    parent.mkdir(parents=True, exist_ok=True)
    staging = parent / f".staging_{root.name}_{uuid.uuid4().hex}"
    backup = parent / f".backup_{root.name}_{uuid.uuid4().hex}"
    relative_paths: list[str] = []
    try:
        staging.mkdir()
        for directory in normalized.get("directories", []):
            _safe_path(staging, str(directory)).mkdir(parents=True, exist_ok=True)
        for spec in normalized["files"]:
            relative = str(spec["relative_path"])
            target = _safe_path(staging, relative)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(str(spec.get("content", "")), encoding="utf-8", newline="")
            if bool(spec.get("executable", False)):
                target.chmod(target.stat().st_mode | stat.S_IEXEC)
            relative_paths.append(relative)
        dependencies = [str(item) for item in normalized.get("dependencies", [])]
        if dependencies:
            _safe_path(staging, "requirements.txt").write_text("\n".join(dependencies) + "\n", encoding="utf-8", newline="")
            relative_paths.append("requirements.txt")
        manifest = {"project_name": normalized.get("project_name"), "entrypoint": normalized.get("entrypoint"), "files": relative_paths.copy(), "commands": normalized.get("commands", []), "dependency_graph": normalized.get("dependency_graph", {}), "migrations": normalized.get("migrations", []), "seed_scripts": normalized.get("seed_scripts", []), "pipeline": normalized.get("pipeline", [])}
        _safe_path(staging, "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="")
        relative_paths.append("manifest.json")
        _validate_staged_files(staging, relative_paths)

        had_existing = root.exists()
        if had_existing:
            os.replace(root, backup)
        try:
            os.replace(staging, root)
        except Exception:
            if had_existing and backup.exists():
                os.replace(backup, root)
            raise
        if backup.exists():
            shutil.rmtree(backup)
        return [root / Path(*relative.split("/")) for relative in relative_paths]
    except Exception:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        if backup.exists() and not root.exists():
            os.replace(backup, root)
        raise
    finally:
        if staging.exists():
            shutil.rmtree(staging, ignore_errors=True)
        if backup.exists() and root.exists():
            shutil.rmtree(backup, ignore_errors=True)


if __name__ == "__main__":
    from core.agent_planner import build_plan
    import argparse
    parser = argparse.ArgumentParser(description="Materialize a Project Angel plan")
    parser.add_argument("idea")
    parser.add_argument("--workspace", default="workspace")
    args = parser.parse_args()
    print("\n".join(str(path) for path in create_file_structure(build_plan(args.idea), args.workspace)))