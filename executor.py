"""Confined subprocess execution and bounded self-healing orchestration."""

from __future__ import annotations

import os
import shlex
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Sequence

from memory_store import RepairMemory, RepairMemoryStore, ast_context, build_prompt_context


@dataclass
class ExecutionResult:
    command: list[str]
    returncode: int
    stdout: str
    stderr: str
    timed_out: bool = False

    @property
    def succeeded(self) -> bool:
        return self.returncode == 0 and not self.timed_out


@dataclass
class RepairAttempt:
    attempt: int
    result: ExecutionResult
    repaired: bool
    diagnosis: str = ""


@dataclass
class HealingResult:
    success: bool
    attempts: list[RepairAttempt] = field(default_factory=list)

    @property
    def final_result(self) -> ExecutionResult | None:
        return self.attempts[-1].result if self.attempts else None


@dataclass(frozen=True)
class RepairProposal:
    """A candidate repair returned by an LLM or another repair provider."""

    patch: str
    resolution: str
    faulty_file: str
    apply: Callable[[Path], bool]
    confidence: float = 0.7


@dataclass
class LearningLoopResult:
    success: bool
    attempts: list[RepairAttempt] = field(default_factory=list)
    cache_hits: int = 0
    cache_misses: int = 0
    stored_memory_ids: list[int] = field(default_factory=list)

    @property
    def final_result(self) -> ExecutionResult | None:
        return self.attempts[-1].result if self.attempts else None


@dataclass
class PipelineStageResult:
    name: str
    result: ExecutionResult
    fault_files: list[str] = field(default_factory=list)


@dataclass
class PipelineResult:
    success: bool
    stages: list[PipelineStageResult] = field(default_factory=list)


def attribute_faults(result: ExecutionResult, dependency_graph: dict[str, list[str]] | None = None) -> list[str]:
    """Extract likely project files from traceback/output and expand dependents."""
    import re

    graph = dependency_graph or {}
    output = result.stderr + "\n" + result.stdout
    candidates = set(re.findall(r'File ["\']([^"\']+\.py)', output))
    candidates.update(re.findall(r'(?<![A-Za-z0-9_./\\-])([A-Za-z0-9_./\\-]+\.py)(?![A-Za-z0-9_./\\-])', output))
    normalized = {candidate.replace("\\", "/") for candidate in candidates}
    changed = True
    while changed:
        changed = False
        for node, dependencies in graph.items():
            if node in normalized or any(dep in normalized for dep in dependencies):
                if node not in normalized:
                    normalized.add(node)
                    changed = True
    return sorted(path for path in normalized if path.endswith(".py"))


def run_phase3_pipeline(
    pipeline: Sequence[dict[str, object]],
    workspace: str | os.PathLike[str],
    *,
    dependency_graph: dict[str, list[str]] | None = None,
    timeout: float = 60.0,
) -> PipelineResult:
    """Run migration, seed, and contract/integration stages in declared order."""
    stages: list[PipelineStageResult] = []
    for stage in pipeline:
        name = str(stage["name"])
        command = stage["command"]
        result = run_code(command, workspace, timeout=timeout)
        faults = [] if result.succeeded else attribute_faults(result, dependency_graph)
        stages.append(PipelineStageResult(name, result, faults))
        if not result.succeeded and bool(stage.get("required", True)):
            return PipelineResult(False, stages)
    return PipelineResult(True, stages)


def run_learning_loop(
    command: Sequence[str] | str,
    workspace: str | os.PathLike[str],
    memory: RepairMemoryStore,
    *,
    apply_cached_patch: Callable[[RepairMemory, Path], bool] | None = None,
    propose_repair: Callable[[ExecutionResult, Path, str], RepairProposal | None] | None = None,
    dependency_graph: dict[str, list[str]] | None = None,
    max_retries: int = 5,
    timeout: float = 30.0,
    similarity_threshold: float = 0.72,
) -> LearningLoopResult:
    """Execute, retrieve historical fixes, repair, and learn from success.

    Cache hits use ``apply_cached_patch`` only when the best historical result
    has both sufficient lexical similarity and confidence. Cache misses call
    ``propose_repair`` with traceback, faulty-file source, AST metadata, and
    nearest historical fixes as few-shot context. The callbacks own file
    mutation, preserving the executor's safety boundary.
    """
    if max_retries < 0:
        raise ValueError("max_retries must be non-negative")
    if apply_cached_patch is None and propose_repair is None:
        raise ValueError("provide apply_cached_patch and/or propose_repair")

    root = Path(workspace).resolve()
    attempts: list[RepairAttempt] = []
    result = LearningLoopResult(False, attempts)
    pending: tuple[RepairProposal, dict[str, object]] | None = None

    for attempt_number in range(max_retries + 1):
        execution = run_code(command, root, timeout=timeout)
        if execution.succeeded:
            attempts.append(RepairAttempt(attempt_number, execution, repaired=False))
            result.success = True
            if pending is not None:
                proposal, metadata = pending
                result.stored_memory_ids.append(memory.store(
                    traceback=metadata["traceback"],
                    faulty_file=proposal.faulty_file,
                    ast_context=metadata["ast_context"],
                    patch=proposal.patch,
                    resolution=proposal.resolution,
                    confidence=proposal.confidence,
                ))
            return result

        if attempt_number == max_retries:
            attempts.append(RepairAttempt(attempt_number, execution, repaired=False, diagnosis=execution.stderr))
            return result

        faults = attribute_faults(execution, dependency_graph)
        faulty_file = faults[0] if faults else ""
        source = ""
        if faulty_file:
            candidate = Path(faulty_file)
            if not candidate.is_absolute():
                candidate = root / candidate
            try:
                candidate = candidate.resolve()
                if candidate == root or root not in candidate.parents:
                    candidate = root / "__missing_fault_file__.py"
                else:
                    source = candidate.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                source = ""
        metadata = {
            "traceback": execution.stderr,
            "ast_context": ast_context(source, faulty_file),
        }
        historical = memory.retrieve(
            traceback=execution.stderr,
            faulty_file=faulty_file,
            ast_context=metadata["ast_context"],
        )
        best = historical[0] if historical else None
        repaired = False
        diagnosis = execution.stderr

        if best and best.score * best.confidence >= similarity_threshold and apply_cached_patch:
            result.cache_hits += 1
            repaired = bool(apply_cached_patch(best, root))
            diagnosis = f"cache hit memory_id={best.id} score={best.score:.3f}"
        else:
            result.cache_misses += 1
            if propose_repair:
                prompt = build_prompt_context(
                    execution.stderr,
                    source,
                    metadata["ast_context"],
                    historical,
                )
                proposal = propose_repair(execution, root, prompt)
                if proposal is not None:
                    repaired = bool(proposal.apply(root))
                    if repaired:
                        pending = (proposal, metadata)
                    diagnosis = proposal.resolution

        attempts.append(RepairAttempt(attempt_number, execution, repaired=repaired, diagnosis=diagnosis))
        if not repaired:
            return result

    return result


RepairCallback = Callable[[ExecutionResult, Path], bool]


def run_code(
    command: Sequence[str] | str,
    workspace: str | os.PathLike[str],
    *,
    timeout: float = 30.0,
    env: dict[str, str] | None = None,
) -> ExecutionResult:
    """Run a command in the workspace without invoking a shell."""
    root = Path(workspace).resolve()
    if not root.is_dir():
        raise ValueError(f"workspace does not exist or is not a directory: {root}")
    argv = shlex.split(command, posix=False) if isinstance(command, str) else [str(part) for part in command]
    if not argv:
        raise ValueError("command must not be empty")
    process_env = os.environ.copy()
    if env:
        process_env.update(env)
    try:
        completed = subprocess.run(
            argv, cwd=root, env=process_env, capture_output=True,
            text=True, timeout=timeout, shell=False, check=False,
        )
        return ExecutionResult(argv, completed.returncode, completed.stdout, completed.stderr)
    except subprocess.TimeoutExpired as exc:
        stdout = exc.stdout or ""
        stderr = exc.stderr or ""
        if isinstance(stdout, bytes):
            stdout = stdout.decode(errors="replace")
        if isinstance(stderr, bytes):
            stderr = stderr.decode(errors="replace")
        return ExecutionResult(argv, -1, stdout, stderr + "\nprocess timed out", timed_out=True)


def autonomous_error_correction_loop(
    command: Sequence[str] | str,
    workspace: str | os.PathLike[str],
    repair: RepairCallback,
    *,
    max_retries: int = 5,
    timeout: float = 30.0,
) -> HealingResult:
    """Run, inspect output, and invoke a bounded repair callback after failure."""
    if max_retries < 0:
        raise ValueError("max_retries must be non-negative")
    attempts: list[RepairAttempt] = []
    for attempt_number in range(max_retries + 1):
        result = run_code(command, workspace, timeout=timeout)
        if result.succeeded:
            attempts.append(RepairAttempt(attempt_number, result, repaired=False))
            return HealingResult(True, attempts)
        if attempt_number == max_retries:
            attempts.append(RepairAttempt(attempt_number, result, repaired=False, diagnosis=result.stderr))
            break
        repaired = bool(repair(result, Path(workspace).resolve()))
        attempts.append(RepairAttempt(attempt_number, result, repaired=repaired, diagnosis=result.stderr))
        if not repaired:
            break
    return HealingResult(False, attempts)


def error_correction_loop(*args, **kwargs) -> HealingResult:
    """Compatibility alias for the explicit healing-loop API."""
    return autonomous_error_correction_loop(*args, **kwargs)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Execute a generated project safely")
    parser.add_argument("--workspace", default="workspace")
    parser.add_argument("--entrypoint", default="main.py")
    args = parser.parse_args()
    result = run_code([sys.executable, args.entrypoint], args.workspace)
    print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)
    raise SystemExit(result.returncode)