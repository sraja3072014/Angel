"""Confined execution and bounded self-healing orchestration."""

from __future__ import annotations

import os
import re
import shlex
import signal
import site
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path, PurePosixPath
from typing import Callable, Optional, Protocol, Sequence

from .memory_store import RepairMemory, RepairMemoryStore, ast_context, build_prompt_context

ALLOWED_ENV_VARS = {
    "PATH",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "PYTHONPATH",
    "APPDATA",
    "USERPROFILE",
    "LOCALAPPDATA",
    "LANG",
    "LC_ALL",
}


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


@dataclass(frozen=True)
class FaultLocation:
    path: str
    line: int
    column: Optional[int]
    exception_type: str
    frame_kind: str


@dataclass
class RepairBudget:
    max_retries: int = 5
    max_total_seconds: float = 180.0
    max_files_mutated: int = 3
    max_patch_bytes: int = 256 * 1024
    started_at: float = field(default_factory=time.monotonic)
    retries_used: int = 0
    files_mutated: set[str] = field(default_factory=set)
    patch_bytes_used: int = 0

    def can_attempt(self) -> bool:
        return self.retries_used < self.max_retries and time.monotonic() - self.started_at < self.max_total_seconds

    def record_retry(self) -> None:
        if not self.can_attempt():
            raise RuntimeError("global repair budget exhausted")
        self.retries_used += 1

    def record_patch(self, patch: str, files: Sequence[str]) -> None:
        size = len(patch.encode("utf-8"))
        if self.patch_bytes_used + size > self.max_patch_bytes:
            raise RuntimeError("global repair patch-byte budget exhausted")
        new_files = set(files) - self.files_mutated
        if len(self.files_mutated) + len(new_files) > self.max_files_mutated:
            raise RuntimeError("global repair file-mutation budget exhausted")
        self.patch_bytes_used += size
        self.files_mutated.update(new_files)


_ANSI_ESCAPE = re.compile(r"\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))")
_TRACEBACK_FRAME = re.compile(r'^\s*File\s+"(?P<path>.+)",\s+line\s+(?P<line>\d+)(?:,\s+column\s+(?P<column>\d+))?(?:,\s+in\s+.*)?\s*$')
_EXCEPTION_LINE = re.compile(r"^(?P<type>[A-Za-z_][\w.]*(?:Error|Exception|Warning|Interrupt|Exit|Failure|StopIteration|GeneratorExit)?)(?::\s.*)?$")


def strip_ansi(text: str) -> str:
    return _ANSI_ESCAPE.sub("", text or "")


def _workspace_relative(path_text: str, workspace: Path) -> tuple[str, str] | None:
    normalized = path_text.replace("\\", "/")
    if normalized.startswith(("<", "site-packages/")) or "<frozen" in normalized or normalized == "<string>":
        return None
    candidate = Path(path_text)
    try:
        if re.match(r"^[A-Za-z]:/", normalized):
            workspace_text = workspace.as_posix().lower().rstrip("/")
            normalized_lower = normalized.lower()
            if normalized_lower == workspace_text or normalized_lower.startswith(workspace_text + "/"):
                relative = normalized[len(workspace.as_posix().rstrip("/")) + 1:]
                return PurePosixPath(relative).as_posix(), "workspace"
            return None
        resolved = candidate.resolve() if candidate.is_absolute() else (workspace / candidate).resolve()
        relative = resolved.relative_to(workspace.resolve()).as_posix()
    except (OSError, ValueError):
        return None
    if "site-packages" in relative.split("/"):
        return None
    return relative, "workspace"


def parse_traceback(stderr: str, workspace: str | os.PathLike[str]) -> list[FaultLocation]:
    """Parse standard Python traceback frames and retain workspace locations only."""
    root = Path(workspace).resolve()
    lines = strip_ansi(stderr).splitlines()
    exception_type = "UnknownError"
    for line in reversed(lines):
        candidate = line.strip()
        match = _EXCEPTION_LINE.match(candidate)
        if match and not candidate.startswith(("File ", "Traceback ")):
            exception_type = match.group("type")
            break
    locations: list[FaultLocation] = []
    for line in lines:
        match = _TRACEBACK_FRAME.match(line)
        if not match:
            continue
        location = _workspace_relative(match.group("path"), root)
        if location is None:
            continue
        relative, frame_kind = location
        locations.append(FaultLocation(relative, int(match.group("line")), int(match.group("column")) if match.group("column") else None, exception_type, frame_kind))
    return locations


def parse_fault_locations(stderr: str, workspace: str | os.PathLike[str]) -> list[FaultLocation]:
    return parse_traceback(stderr, workspace)


class ExecutionBackend(Protocol):
    def run_command(self, cmd: list[str], cwd: Path, timeout: int, env: dict[str, str]) -> ExecutionResult: ...


def _sanitized_environment(overrides: dict[str, str] | None = None) -> dict[str, str]:
    environment = {key: value for key, value in os.environ.items() if key in ALLOWED_ENV_VARS}
    if overrides:
        environment.update({key: str(value) for key, value in overrides.items() if key in ALLOWED_ENV_VARS})
    return environment


class LocalSubprocessBackend:
    """Execute without a shell and terminate descendants on timeout."""

    def run_command(self, cmd: list[str], cwd: Path, timeout: int, env: dict[str, str]) -> ExecutionResult:
        if not cmd:
            raise ValueError("command must not be empty")
        process_env = _sanitized_environment(env)
        user_site = site.getusersitepackages()
        existing_pythonpath = process_env.get("PYTHONPATH", "")
        process_env["PYTHONPATH"] = (
            f"{user_site}{os.pathsep}{existing_pythonpath}"
            if existing_pythonpath
            else user_site
        )
        creationflags = 0
        start_new_session = os.name != "nt"
        if os.name == "nt":
            creationflags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)
        process = subprocess.Popen(cmd, cwd=cwd, env=process_env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, shell=False, creationflags=creationflags, start_new_session=start_new_session)
        try:
            stdout, stderr = process.communicate(timeout=timeout)
            return ExecutionResult(cmd, process.returncode, stdout, stderr)
        except subprocess.TimeoutExpired as error:
            self._terminate_tree(process)
            stdout, stderr = process.communicate()
            def as_text(value: str | bytes | None) -> str:
                if isinstance(value, bytes):
                    return value.decode(errors="replace")
                return value or ""
            captured_stdout = as_text(stdout) or as_text(error.stdout)
            captured_stderr = as_text(stderr) or as_text(error.stderr)
            return ExecutionResult(cmd, -1, captured_stdout, captured_stderr + "\nprocess tree timed out", timed_out=True)

    @staticmethod
    def _terminate_tree(process: subprocess.Popen[str]) -> None:
        if process.poll() is not None:
            return
        if os.name == "nt":
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, shell=False, check=False, env=_sanitized_environment())
        else:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                return
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass


class ContainerExecutionBackend:
    """Execution backend that delegates every command to ContainerRunner."""

    def __init__(self, runner: object):
        self.runner = runner

    def run_command(self, cmd: list[str], cwd: Path, timeout: int, env: dict[str, str]) -> ExecutionResult:
        return self.runner.run(cmd, cwd, timeout=timeout, env=_sanitized_environment(env))


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
    traceback: str = ""
    returncode: int = 0
    repaired: bool = False
    cache_hits: int = 0
    cache_misses: int = 0

    @property
    def faulty_files(self) -> list[str]:
        return self.fault_files


@dataclass
class PipelineResult:
    success: bool
    stages: list[PipelineStageResult] = field(default_factory=list)


def attribute_faults(result: ExecutionResult, dependency_graph: dict[str, list[str]] | None = None, workspace: str | os.PathLike[str] = ".") -> list[str]:
    locations = parse_traceback(result.stderr + "\n" + result.stdout, workspace)
    normalized = {location.path for location in locations}
    graph = dependency_graph or {}
    changed = True
    while changed:
        changed = False
        for node, dependencies in graph.items():
            if node in normalized or any(dep in normalized for dep in dependencies):
                if node not in normalized:
                    normalized.add(node)
                    changed = True
    return sorted(path for path in normalized if path.endswith(".py"))


def _execute(backend: ExecutionBackend, command: Sequence[str] | str, workspace: Path, timeout: float, env: dict[str, str] | None = None) -> ExecutionResult:
    argv = shlex.split(command, posix=False) if isinstance(command, str) else [str(part) for part in command]
    if not argv:
        raise ValueError("command must not be empty")
    if argv[0].lower() in {"python", "python3", "python.exe", "py"} and isinstance(backend, LocalSubprocessBackend):
        argv[0] = sys.executable
    return backend.run_command(argv, workspace, max(1, int(timeout)), _sanitized_environment(env))


def run_phase3_pipeline(pipeline: Sequence[dict[str, object]], workspace: str | os.PathLike[str], *, dependency_graph: dict[str, list[str]] | None = None, timeout: float = 60.0, memory: RepairMemoryStore | None = None, max_retries: int = 0, apply_cached_patch: Callable[[RepairMemory, Path], bool] | None = None, backend: ExecutionBackend | None = None, repair_budget: RepairBudget | None = None) -> PipelineResult:
    selected = backend or LocalSubprocessBackend()
    root = Path(workspace).resolve()
    budget = repair_budget or RepairBudget(max_retries=max_retries or 5)
    stages: list[PipelineStageResult] = []
    for stage in pipeline:
        command = stage["command"]
        result = _execute(selected, command, root, float(stage.get("timeout_seconds", timeout)))
        faults = [] if result.succeeded else attribute_faults(result, dependency_graph, root)
        repaired = False
        cache_hits = cache_misses = 0
        if not result.succeeded and memory is not None and apply_cached_patch is not None and budget.can_attempt():
            learning = run_learning_loop(command, root, memory, apply_cached_patch=apply_cached_patch, dependency_graph=dependency_graph, max_retries=max_retries, timeout=timeout, backend=selected, repair_budget=budget)
            if learning.attempts:
                result = learning.final_result or result
                faults = [] if result.succeeded else attribute_faults(result, dependency_graph, root)
                repaired, cache_hits, cache_misses = any(a.repaired for a in learning.attempts), learning.cache_hits, learning.cache_misses
        stages.append(PipelineStageResult(str(stage["name"]), result, faults, (result.stderr or result.stdout) if not result.succeeded else "", result.returncode, repaired, cache_hits, cache_misses))
        if not result.succeeded and bool(stage.get("required", True)):
            return PipelineResult(False, stages)
    return PipelineResult(True, stages)


def run_learning_loop(command: Sequence[str] | str, workspace: str | os.PathLike[str], memory: RepairMemoryStore, *, apply_cached_patch: Callable[[RepairMemory, Path], bool] | None = None, propose_repair: Callable[[ExecutionResult, Path, str], RepairProposal | None] | None = None, dependency_graph: dict[str, list[str]] | None = None, max_retries: int = 5, timeout: float = 30.0, similarity_threshold: float = 0.72, backend: ExecutionBackend | None = None, repair_budget: RepairBudget | None = None) -> LearningLoopResult:
    if max_retries < 0 or (apply_cached_patch is None and propose_repair is None):
        raise ValueError("invalid retry or repair configuration")
    selected = backend or LocalSubprocessBackend()
    root = Path(workspace).resolve()
    budget = repair_budget or RepairBudget(max_retries=max_retries)
    result = LearningLoopResult(False)
    pending: tuple[RepairProposal, dict[str, object]] | None = None
    for attempt_number in range(max_retries + 1):
        execution = _execute(selected, command, root, timeout)
        if execution.succeeded:
            result.attempts.append(RepairAttempt(attempt_number, execution, False))
            result.success = True
            if pending:
                proposal, metadata = pending
                result.stored_memory_ids.append(memory.store(traceback=metadata["traceback"], faulty_file=proposal.faulty_file, ast_context=metadata["ast_context"], patch=proposal.patch, resolution=proposal.resolution, confidence=proposal.confidence))
            return result
        if attempt_number == max_retries or not budget.can_attempt():
            result.attempts.append(RepairAttempt(attempt_number, execution, False, execution.stderr))
            return result
        budget.record_retry()
        faults = attribute_faults(execution, dependency_graph, root)
        faulty_file = faults[0] if faults else ""
        source = ""
        if faulty_file:
            candidate = (root / faulty_file).resolve()
            if root in candidate.parents and candidate.is_file():
                source = candidate.read_text(encoding="utf-8")
        metadata = {"traceback": execution.stderr, "ast_context": ast_context(source, faulty_file)}
        historical = memory.retrieve(traceback=execution.stderr, faulty_file=faulty_file, ast_context=metadata["ast_context"])
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
                proposal = propose_repair(execution, root, build_prompt_context(execution.stderr, faulty_file, metadata["ast_context"], historical))
                if proposal:
                    try:
                        budget.record_patch(proposal.patch, [proposal.faulty_file])
                    except RuntimeError:
                        diagnosis = "global repair budget exhausted"
                        result.attempts.append(RepairAttempt(attempt_number, execution, False, diagnosis))
                        return result
                    repaired = bool(proposal.apply(root))
                    if repaired:
                        pending = (proposal, metadata)
                    diagnosis = proposal.resolution
        result.attempts.append(RepairAttempt(attempt_number, execution, repaired, diagnosis))
        if not repaired:
            return result
    return result


RepairCallback = Callable[[ExecutionResult, Path], bool]


def run_code(command: Sequence[str] | str, workspace: str | os.PathLike[str], *, timeout: float = 30.0, env: dict[str, str] | None = None) -> ExecutionResult:
    root = Path(workspace).resolve()
    if not root.is_dir():
        raise ValueError(f"workspace does not exist or is not a directory: {root}")
    return _execute(LocalSubprocessBackend(), command, root, timeout, env)


def autonomous_error_correction_loop(command: Sequence[str] | str, workspace: str | os.PathLike[str], repair: RepairCallback, *, max_retries: int = 5, timeout: float = 30.0) -> HealingResult:
    if max_retries < 0:
        raise ValueError("max_retries must be non-negative")
    attempts: list[RepairAttempt] = []
    for number in range(max_retries + 1):
        result = run_code(command, workspace, timeout=timeout)
        if result.succeeded:
            attempts.append(RepairAttempt(number, result, False))
            return HealingResult(True, attempts)
        repaired = False if number == max_retries else bool(repair(result, Path(workspace).resolve()))
        attempts.append(RepairAttempt(number, result, repaired, result.stderr))
        if not repaired:
            break
    return HealingResult(False, attempts)


def error_correction_loop(*args, **kwargs) -> HealingResult:
    return autonomous_error_correction_loop(*args, **kwargs)


if __name__ == "__main__":
    parser = __import__("argparse").ArgumentParser()
    parser.add_argument("--workspace", default="workspace")
    parser.add_argument("--entrypoint", default="main.py")
    args = parser.parse_args()
    raise SystemExit(run_code([sys.executable, args.entrypoint], args.workspace).returncode)
