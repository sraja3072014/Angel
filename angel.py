"""Production CLI for Project Angel workspace planning and execution."""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import os
import re
import sys
import tempfile
import time
from pathlib import Path, PurePosixPath
from typing import Any

from core.agent_planner import build_plan, validate_plan
from core.container_runner import ContainerPolicy, ContainerRunner
from core.executor import ContainerExecutionBackend, LocalSubprocessBackend, PipelineResult, RepairBudget, run_code, run_phase3_pipeline
from core.file_manager import WorkspaceError, create_file_structure, write_file
from core.memory_store import RepairMemory, RepairMemoryStore
from core.path_policy import WorkspacePathError, validate_workspace_relative_path
from core.watchdog import RuntimeWatchdog


ROOT = Path(__file__).resolve().parent
CONFIG_PATH = ROOT / "angel_config.json"
CONFIG_CANDIDATES = (
    ROOT / "config" / "angel_config.json",
    CONFIG_PATH,
)


def load_config(path: Path | None = None) -> dict[str, Any]:
    if path is not None:
        with path.open("r", encoding="utf-8") as handle:
            config = json.load(handle)
    else:
        for candidate in CONFIG_CANDIDATES:
            if candidate.exists():
                with candidate.open("r", encoding="utf-8") as handle:
                    config = json.load(handle)
                break
        else:
            config = {"workspace": str(ROOT / "workspace"), "max_retries": 5}
    if not isinstance(config, dict):
        raise ValueError("Project Angel configuration must be a JSON object")
    return config


def configured_workspace(config: dict[str, Any]) -> Path:
    configured = Path(str(config.get("workspace", ""))).expanduser()
    if configured.is_dir():
        return configured.resolve()
    fallback = ROOT / str(config.get("fallback_workspace", "workspace"))
    fallback.mkdir(parents=True, exist_ok=True)
    return fallback.resolve()


def workspace_path(value: str | None, config: dict[str, Any]) -> Path:
    root = Path(value).expanduser().resolve() if value else configured_workspace(config)
    if not root.is_absolute():
        raise WorkspaceError("workspace must resolve to an absolute path")
    root.mkdir(parents=True, exist_ok=True)
    return root


def emit(value: Any) -> None:
    print(json.dumps(value, indent=2, default=str))


def write_plan_output(output: str, value: dict[str, Any]) -> Path:
    """Atomically write a plan output file outside the workspace policy."""
    destination = Path(output).expanduser()
    if not destination.is_absolute():
        return write_file(ROOT, output, json.dumps(value, indent=2) + "\n")
    destination = destination.resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_name(f".{destination.name}.tmp")
    try:
        temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="")
        temporary.replace(destination)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise
    return destination


_HUNK_HEADER = re.compile(r"^@@ -(?P<old>\d+)(?:,(?P<old_count>\d+))? \+(?P<new>\d+)(?:,(?P<new_count>\d+))? @@")
_SHA256 = re.compile(r"(?:sha256[:=])?([0-9a-fA-F]{64})")
MAX_PATCH_BYTES = 256 * 1024


def _patch_header_path(value: str) -> tuple[str, str | None]:
    value = value[4:].rstrip("\r\n")
    path_text, _, metadata = value.partition("\t")
    if path_text.startswith(("a/", "b/")):
        path_text = path_text[2:]
    digest_match = _SHA256.search(metadata)
    return path_text, digest_match.group(1).lower() if digest_match else None


def apply_unified_patch(memory: RepairMemory, workspace: Path, *, budget: RepairBudget | None = None) -> bool:
    """Safely apply exactly one unified diff file through a temporary staging file."""
    patch = memory.patch
    if len(patch.encode("utf-8")) > MAX_PATCH_BYTES or (budget and len(patch.encode("utf-8")) > budget.max_patch_bytes - budget.patch_bytes_used):
        return False
    if "\x00" in patch:
        return False
    lines = patch.splitlines(keepends=True)
    metadata_digest = None
    if lines and lines[0].lower().startswith("# angel-source-sha256:"):
        match = _SHA256.search(lines.pop(0))
        metadata_digest = match.group(1).lower() if match else None
    if len(lines) < 3 or not lines[0].startswith("--- ") or not lines[1].startswith("+++ "):
        return False
    old_name, old_digest = _patch_header_path(lines[0])
    new_name, new_digest = _patch_header_path(lines[1])
    if old_name != new_name or not new_name or old_name == "/dev/null" or new_name == "/dev/null":
        return False
    try:
        target = validate_workspace_relative_path(new_name.replace("\\", "/"), workspace)
    except WorkspacePathError:
        return False
    try:
        original_bytes = target.read_bytes()
        if b"\x00" in original_bytes:
            return False
        original = original_bytes.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n").splitlines(keepends=True)
    except (OSError, UnicodeDecodeError):
        return False
    expected_digest = metadata_digest or old_digest or new_digest
    if expected_digest and hashlib.sha256(original_bytes).hexdigest() != expected_digest:
        return False
    output: list[str] = []
    source_index = 0
    cursor = 2
    hunk_count = 0
    while cursor < len(lines):
        match = _HUNK_HEADER.match(lines[cursor].rstrip("\r\n"))
        if not match:
            return False
        old_start = int(match.group("old"))
        old_count = int(match.group("old_count") or "1")
        new_count = int(match.group("new_count") or "1")
        if old_start < 1 or old_start - 1 < source_index or old_start - 1 > len(original):
            return False
        output.extend(original[source_index:old_start - 1])
        source_index = old_start - 1
        cursor += 1
        consumed_old = consumed_new = 0
        while cursor < len(lines) and not lines[cursor].startswith("@@"):
            item = lines[cursor]
            if item.startswith("\\ No newline at end of file"):
                return False
            if not item or item[0] not in " +-":
                return False
            marker, content = item[0], item[1:]
            if marker in " -":
                if source_index >= len(original) or original[source_index] != content:
                    return False
                source_index += 1
                consumed_old += 1
            if marker in " +":
                output.append(content)
                consumed_new += 1
            cursor += 1
        if consumed_old != old_count or consumed_new != new_count:
            return False
        hunk_count += 1
    if not hunk_count or source_index != len(original):
        return False
    updated = "".join(output)
    try:
        ast.parse(updated, filename=str(target))
    except SyntaxError:
        return False
    temporary_name = None
    try:
        fd, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.patch.", dir=target.parent)
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as handle:
            handle.write(updated)
            handle.flush()
        if budget:
            budget.record_patch(patch, [target.relative_to(workspace.resolve()).as_posix()])
        Path(temporary_name).replace(target)
        return True
    except (OSError, RuntimeError):
        if temporary_name:
            Path(temporary_name).unlink(missing_ok=True)
        return False


def load_manifest(workspace: Path) -> dict[str, Any]:
    with (workspace / "manifest.json").open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    if not isinstance(manifest, dict):
        raise ValueError("manifest.json must contain an object")
    return manifest


def run_pipeline(workspace: Path, config: dict[str, Any], *, tests_only: bool = False) -> PipelineResult:
    manifest = load_manifest(workspace)
    pipeline = manifest.get("pipeline", [])
    if tests_only and not pipeline:
        pipeline = [{"name": "tests", "command": [sys.executable, "-m", "pytest", "-q"], "required": True}]
    memory = RepairMemoryStore(workspace / ".angel" / "repair_memory.sqlite3")
    container_config = dict(config.get("container", {}))
    use_container = bool(container_config.get("enabled", False))
    backend = LocalSubprocessBackend()
    if use_container:
        runner = ContainerRunner(ContainerPolicy(image=str(container_config.get("image") or ContainerPolicy().image)))
        backend = ContainerExecutionBackend(runner)
    budget = RepairBudget(
        max_retries=int(config.get("max_retries", 5)),
        max_total_seconds=float(config.get("max_total_seconds", 180)),
        max_files_mutated=int(config.get("max_files_mutated", 3)),
        max_patch_bytes=int(config.get("max_patch_bytes", 256 * 1024)),
    )
    result = run_phase3_pipeline(
        pipeline,
        workspace,
        dependency_graph=manifest.get("dependency_graph", {}),
        timeout=float(config.get("timeout_seconds", 60)),
        memory=memory,
        max_retries=budget.max_retries,
        apply_cached_patch=lambda item, root: apply_unified_patch(item, root, budget=budget),
        backend=backend,
        repair_budget=budget,
    )
    return result


def result_json(result: PipelineResult) -> dict[str, Any]:
    return {
        "success": result.success,
        "stages": [{
            "name": stage.name,
            "success": stage.result.succeeded,
            "returncode": stage.returncode,
            "traceback": stage.traceback,
            "faulty_files": stage.faulty_files,
            "repaired": stage.repaired,
            "cache_hits": stage.cache_hits,
            "cache_misses": stage.cache_misses,
            "stdout": stage.result.stdout,
            "stderr": stage.result.stderr,
        } for stage in result.stages],
    }


def main(argv: list[str] | None = None) -> int:
    config = load_config()
    parser = argparse.ArgumentParser(prog="angel.py", description="Project Angel autonomous engineering and security sentinel")
    subparsers = parser.add_subparsers(dest="command", required=True)
    plan_parser = subparsers.add_parser("plan")
    plan_parser.add_argument("prompt")
    plan_parser.add_argument("--output")
    scaffold_parser = subparsers.add_parser("scaffold")
    scaffold_parser.add_argument("--plan", required=True)
    scaffold_parser.add_argument("--workspace")
    for name in ("run", "test", "watch"):
        command_parser = subparsers.add_parser(name)
        command_parser.add_argument("--workspace")
        if name == "watch":
            command_parser.add_argument("--once", action="store_true")
            command_parser.add_argument("--interval", type=float, default=1.0)
    args = parser.parse_args(argv)
    try:
        if args.command == "plan":
            value = build_plan(args.prompt)
            if args.output:
                write_plan_output(args.output, value)
            else:
                emit(value)
            return 0
        workspace = workspace_path(getattr(args, "workspace", None), config)
        if args.command == "scaffold":
            with Path(args.plan).expanduser().resolve().open("r", encoding="utf-8") as handle:
                plan = validate_plan(json.load(handle))
            emit({"workspace": str(workspace), "files": [str(path) for path in create_file_structure(plan, workspace)]})
            return 0
        if args.command in {"run", "test"}:
            if args.command == "test":
                result = run_pipeline(workspace, config, tests_only=True)
            else:
                manifest = load_manifest(workspace)
                entrypoint = str(manifest.get("entrypoint", "main.py"))
                container_config = dict(config.get("container", {}))
                if bool(container_config.get("enabled", False)):
                    policy = ContainerPolicy(
                        image=str(container_config.get("image") or ContainerPolicy().image),
                        network=str(container_config.get("network", "none")),
                        timeout=float(config.get("timeout_seconds", 60)),
                    )
                    result = ContainerRunner(policy).run(["python", entrypoint], workspace)
                else:
                    result = run_code([sys.executable, entrypoint], workspace, timeout=float(config.get("timeout_seconds", 60)))
                emit({"success": result.succeeded, "returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr})
                return result.returncode
            emit(result_json(result))
            return 0 if result.success else 1
        watchdog = RuntimeWatchdog(workspace, log_paths=["angel.log"], sqlite_paths=[".angel/repair_memory.sqlite3"], poll_interval=args.interval)
        if args.once:
            emit([event.__dict__ for event in watchdog.scan_once()])
            return 0
        watchdog.start()
        try:
            while True:
                time.sleep(args.interval)
        except KeyboardInterrupt:
            return 0
        finally:
            watchdog.stop()
    except (OSError, ValueError, WorkspaceError, RuntimeError, json.JSONDecodeError) as error:
        print(f"Project Angel error: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())