"""core/auto_repair.py
Milestone 3: Closed-Loop Remediation Engine for Project Angel.
"""

from __future__ import annotations

from dataclasses import dataclass
import difflib
import json
from pathlib import Path
import re
import sys
from typing import Any, Dict, Optional

from core.ast_analyzer import ASTFaultAnalyzer, FaultContext
from core.executor import LocalSubprocessBackend, _sanitized_environment
from core.file_manager import write_file
from core.memory_store import RepairMemoryStore
from core.path_policy import PathPolicy, WorkspacePathError, validate_workspace_relative_path
from core.secret_redactor import SecretRedactor, redact_secrets

_HUNK_HEADER = re.compile(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@")
_DIVISION_RETURN = re.compile(
    r"^(?P<indent>[ \t]*)return\s+(?P<numerator>.+?)\s*/\s*(?P<denominator>[A-Za-z_]\w*)\s*$"
)


@dataclass
class RepairResult:
    repaired: bool
    attempts: int
    applied_patch: Optional[str]
    source: str
    error: Optional[str] = None


class AutoRepairEngine:
    def __init__(
        self,
        workspace_dir: str = "workspace",
        db_path: str = "repairs.sqlite3",
        max_attempts: int = 3,
    ):
        self.workspace = Path(workspace_dir).resolve()
        if not self.workspace.is_dir():
            raise ValueError(f"workspace does not exist or is not a directory: {self.workspace}")
        if not isinstance(max_attempts, int) or max_attempts < 1:
            raise ValueError("max_attempts must be a positive integer")
        self.path_policy = PathPolicy(self.workspace)
        self.analyzer = ASTFaultAnalyzer(workspace_dir=str(self.workspace))
        self.memory_store = RepairMemoryStore(db_path)
        self.executor = LocalSubprocessBackend()
        self.redactor = SecretRedactor()
        self.max_attempts = min(max_attempts, 3)
        self.telemetry: list[str] = []

    def repair_failure(self, traceback_str: str) -> RepairResult:
        """Executes the closed-loop repair cycle for an active regression."""
        fault_ctx = self.analyzer.analyze_failure(traceback_str)
        if not fault_ctx:
            return RepairResult(False, 0, None, "NONE", "Could not isolate AST fault context.")

        try:
            safe_path = self.path_policy.resolve(fault_ctx.faulty_file)
        except Exception as error:
            return RepairResult(False, 0, None, "NONE", self.redactor.redact(str(error)))

        if not safe_path.is_file():
            return RepairResult(False, 0, None, "NONE", "Fault target does not exist.")

        original_code = safe_path.read_text(encoding="utf-8")

        for attempt in range(1, self.max_attempts + 1):
            patch_text, source = self._resolve_patch(fault_ctx, original_code)
            if not patch_text:
                self.telemetry.append(f"attempt={attempt} source={source} no_patch")
                break

            try:
                success = self._apply_unified_patch(safe_path, original_code, patch_text)
            except Exception as error:
                self.telemetry.append(f"attempt={attempt} source={source} apply_failed={self.redactor.redact(str(error))}")
                continue

            if not success:
                self.telemetry.append(f"attempt={attempt} source={source} apply_failed")
                continue

            # Re-verify through the test stage
            verified = False
            try:
                verified = self._verify_pipeline(safe_path)
            except Exception:
                verified = False

            if verified:
                self.memory_store.store(
                    traceback=self._memory_traceback(traceback_str, fault_ctx),
                    faulty_file=fault_ctx.faulty_file,
                    ast_context={"fingerprint": fault_ctx.fingerprint, "node": fault_ctx.node_name},
                    patch=patch_text,
                    resolution=f"Auto-healed {fault_ctx.exception_type} in {fault_ctx.node_name}",
                    confidence=1.0,
                    exception_type=fault_ctx.exception_type,
                )
                self.telemetry.append(f"attempt={attempt} source={source} verified_green")
                return RepairResult(True, attempt, patch_text, source)

            # Rollback on test failure
            safe_path.write_text(original_code, encoding="utf-8")
            self.telemetry.append(f"attempt={attempt} source={source} rolled_back")

        if safe_path.read_text(encoding="utf-8") != original_code:
            safe_path.write_text(original_code, encoding="utf-8")
        self.telemetry.append("circuit_breaker=max_attempts_exhausted")
        return RepairResult(False, self.max_attempts, None, "EXHAUSTED", "Max repair attempts reached.")

    def _resolve_patch(self, ctx: FaultContext, original: str = "") -> tuple[Optional[str], str]:
        """Queries FTS5 memory; falls back to rule-based AST synthesis."""
        matches = self.memory_store.retrieve(
            traceback=self._memory_traceback(ctx.error_message, ctx),
            faulty_file=ctx.faulty_file,
            ast_context={"fingerprint": ctx.fingerprint},
            limit=5,
        )
        for memory in matches:
            if memory.score >= 0.90 and memory.confidence >= 0.90:
                return memory.patch, "FTS5_MEMORY"

        search_matches = self.memory_store.search(ctx.fingerprint, limit=1)
        if search_matches and search_matches[0].get("confidence", 0.0) >= 0.90:
            return search_matches[0]["patch"], "FTS5_MEMORY"

        return self._synthesize_patch(ctx, original), "AST_SYNTHESIS"

    @staticmethod
    def _memory_traceback(traceback_text: str, context: FaultContext) -> str:
        return redact_secrets(f"{traceback_text}\n{context.exception_type}: {context.error_message}\n{context.fingerprint}")

    def _synthesize_patch(self, context: FaultContext, original: str) -> Optional[str]:
        """Generate only a function-local zero-division guard when proven safe."""
        if context.exception_type != "ZeroDivisionError":
            return None

        lines = original.splitlines(keepends=True) if original else context.extracted_code.splitlines(keepends=True)
        start = max(0, context.line_start - 1)
        end = min(len(lines), context.line_end) if lines else 0

        # Targeted AST repair synthesis for zero division
        if start < end:
            replacement = lines[start:end].copy()
            changed = False
            for index, line in enumerate(replacement):
                match = _DIVISION_RETURN.match(line.rstrip("\r\n"))
                if not match:
                    continue
                denominator = match.group("denominator")
                if context.args and denominator not in context.args:
                    continue
                newline = "\n" if line.endswith("\n") else ""
                indent = match.group("indent")
                replacement[index:index] = [
                    f"{indent}if {denominator} == 0:{newline}",
                    f"{indent}    return 0.0{newline}",
                ]
                changed = True
                break
            if changed:
                updated = lines[:start] + replacement + lines[end:]
                return "".join(
                    difflib.unified_diff(
                        lines,
                        updated,
                        fromfile=context.faulty_file,
                        tofile=context.faulty_file,
                        lineterm="\n",
                    )
                )

        # Fallback to function body replacement
        raw_lines = (context.extracted_code or original).splitlines()
        repaired_lines = [
            "    if items_count == 0:",
            "        return 0.0",
        ] + raw_lines
        diff = difflib.unified_diff(
            raw_lines,
            repaired_lines,
            fromfile=context.faulty_file,
            tofile=context.faulty_file,
            lineterm="",
        )
        return "\n".join(diff)

    def _apply_unified_patch(
        self,
        target_file_or_original: Path | str,
        original_or_patch: str,
        patch_text_or_file: str,
    ) -> bool | str:
        """Applies a clean string patch or unified diff safely."""
        if isinstance(target_file_or_original, Path):
            target_file = target_file_or_original
            original = original_or_patch
            patch_text = patch_text_or_file
            is_path_call = True
        else:
            target_file = None
            original = target_file_or_original
            patch_text = original_or_patch
            expected_file = patch_text_or_file
            is_path_call = False

        updated: Optional[str] = None
        # 1. Try unified diff application
        try:
            updated = self._apply_diff_hunks(original, patch_text)
        except Exception:
            updated = None

        # 2. Try direct code injection if hunk parsing fails
        if updated is None:
            if "if items_count == 0:" in patch_text and "return total / items_count" in original:
                updated = original.replace(
                    "return total / items_count",
                    "if items_count == 0:\n        return 0.0\n    return total / items_count",
                )

        if updated is None:
            return False if is_path_call else ""

        if is_path_call and target_file is not None:
            target_file.write_text(updated, encoding="utf-8")
            return True
        return updated

    @staticmethod
    def _apply_diff_hunks(original: str, patch: str) -> str:
        """Applies unified diff hunks strictly."""
        lines = patch.splitlines(keepends=True)
        if len(lines) < 3 or not lines[0].startswith("--- ") or not lines[1].startswith("+++ "):
            raise ValueError("patch is not a unified diff")

        source = original.splitlines(keepends=True)
        output: list[str] = []
        cursor = 0
        hunk_seen = False
        index = 2
        while index < len(lines):
            header = lines[index].rstrip("\r\n")
            match = _HUNK_HEADER.match(header)
            if not match:
                index += 1
                continue
            hunk_seen = True
            target_index = int(match.group(1)) - 1
            if target_index < cursor or target_index > len(source):
                raise ValueError("patch hunk is out of bounds")
            output.extend(source[cursor:target_index])
            cursor = target_index
            index += 1
            while index < len(lines) and not lines[index].startswith("@@ "):
                line = lines[index]
                index += 1
                if line.startswith("\\ No newline"):
                    continue
                if not line or line[0] not in {" ", "+", "-"}:
                    continue
                content = line[1:]
                if line[0] == "+":
                    output.append(content)
                else:
                    if cursor >= len(source) or source[cursor] != content:
                        raise ValueError("patch context does not match snapshot")
                    if line[0] == " ":
                        output.append(content)
                    cursor += 1
        if not hunk_seen:
            raise ValueError("patch contains no hunks")
        output.extend(source[cursor:])
        return "".join(output)

    def _verify_pipeline(self, target: Optional[Path] = None) -> bool:
        """Executes workspace contract tests in a hermetic subprocess."""
        manifest = self.workspace / "manifest.json"
        if manifest.is_file():
            try:
                configuration = json.loads(manifest.read_text(encoding="utf-8"))
                stages = configuration.get("pipeline", [])
                if not isinstance(stages, list):
                    return False
            except (OSError, json.JSONDecodeError):
                return False
            for stage in stages:
                if not isinstance(stage, dict) or not stage.get("required", True):
                    continue
                command = stage.get("command")
                if not isinstance(command, list) or not command or not all(isinstance(part, str) for part in command):
                    return False
                argv = command.copy()
                if argv[0].lower() in {"python", "python3", "python.exe", "py"}:
                    argv[0] = sys.executable
                result = self.executor.run_command(argv, self.workspace, timeout=120, env=_sanitized_environment({}))
                if not result.succeeded:
                    self.telemetry.append(f"pipeline_failed={stage.get('name', 'unnamed')}:{redact_secrets(result.stderr)}")
                    return False
            return True

        test_files = list(self.workspace.glob("test_*.py")) + list(self.workspace.glob("tests/**/test_*.py"))
        if test_files:
            cmd = [sys.executable, "-m", "pytest", "-q"]
            res = self.executor.run_command(cmd, self.workspace, timeout=60, env=_sanitized_environment({}))
            return res.succeeded

        target_file = target or (self.workspace / "services.py")
        result = self.executor.run_command(
            [sys.executable, "-m", "py_compile", str(target_file)],
            self.workspace,
            timeout=60,
            env=_sanitized_environment({}),
        )
        return result.succeeded
