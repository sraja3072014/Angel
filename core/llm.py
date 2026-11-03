"""Deterministic ReAct reasoning and tool-dispatch engine for Project Angel.

This module deliberately exposes a small tool surface.  All filesystem paths
are validated by :mod:`core.path_policy`, and subprocesses are delegated to
the hermetic local executor.
"""

from __future__ import annotations

from dataclasses import dataclass
import json
from pathlib import Path
import re
import sys
from typing import Any, Optional

from .executor import LocalSubprocessBackend, _sanitized_environment
from .path_policy import validate_workspace_relative_path
from .secret_redactor import redact_secrets


@dataclass(frozen=True)
class ToolResult:
    """The redacted result of one sandboxed tool invocation."""

    success: bool
    output: str
    error: Optional[str] = None


class ReActAgentEngine:
    """Execute a bounded Thought -> Action -> Observation reasoning loop."""

    _PYTHON_COMMANDS = {"python", "python3", "python.exe", "py"}
    _ACTION_PATTERN = re.compile(r"^Action:\s*(\w+)\s*\((.*)\)\s*$", re.MULTILINE)

    def __init__(self, workspace_dir: str = "workspace", model_client: Optional[Any] = None):
        self.workspace = Path(workspace_dir).resolve()
        if not self.workspace.is_dir():
            raise ValueError(f"workspace does not exist or is not a directory: {self.workspace}")
        self.executor = LocalSubprocessBackend()
        self.model_client = model_client
        self.max_steps = 10
        self.history: list[dict[str, str]] = []

    def _safe_path(self, relative_path: Any) -> Path:
        if not isinstance(relative_path, str):
            raise ValueError("unsafe workspace path")
        return validate_workspace_relative_path(relative_path, self.workspace)

    @staticmethod
    def _require_mapping(args: Any) -> dict[str, Any]:
        if not isinstance(args, dict):
            raise ValueError("tool arguments must be a JSON object")
        return args

    @staticmethod
    def _require_string(args: dict[str, Any], name: str) -> str:
        value = args.get(name)
        if not isinstance(value, str):
            raise ValueError(f"{name} must be a string")
        return value

    def _run_command(self, command: list[str], timeout_seconds: int) -> ToolResult:
        if not command or not all(isinstance(item, str) for item in command):
            raise ValueError("command must be a non-empty array of strings")
        if command[0].lower() in self._PYTHON_COMMANDS:
            command[0] = sys.executable
        result = self.executor.run_command(
            command,
            self.workspace,
            timeout=max(1, timeout_seconds),
            env=_sanitized_environment({}),
        )
        stdout = redact_secrets(result.stdout)
        stderr = redact_secrets(result.stderr)
        if result.succeeded:
            return ToolResult(True, stdout)
        return ToolResult(False, stdout, f"ReturnCode {result.returncode}: {stderr}")

    def _apply_unified_patch(self, path: Path, patch: str) -> None:
        """Apply a strict, single-file unified diff without shelling out.

        Hunk context and removed lines must match the current file exactly, so
        a malformed or stale patch cannot partially mutate the file.
        """
        if not isinstance(patch, str) or not patch.strip():
            raise ValueError("patch must be a non-empty string")
        source = path.read_text(encoding="utf-8")
        original = source.splitlines(keepends=True)
        lines = patch.splitlines(keepends=True)
        hunk_indexes = [index for index, line in enumerate(lines) if line.startswith("@@ ")]
        if not hunk_indexes:
            raise ValueError("patch must contain at least one unified-diff hunk")

        output: list[str] = []
        cursor = 0
        for hunk_number, start in enumerate(hunk_indexes):
            header = lines[start].rstrip("\r\n")
            match = re.match(r"^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@", header)
            if not match:
                raise ValueError("invalid unified-diff hunk header")
            old_start = int(match.group(1))
            target_index = old_start - 1
            if target_index < cursor or target_index > len(original):
                raise ValueError("patch hunks are out of order or outside the file")
            output.extend(original[cursor:target_index])
            cursor = target_index
            end = hunk_indexes[hunk_number + 1] if hunk_number + 1 < len(hunk_indexes) else len(lines)
            for line in lines[start + 1:end]:
                if line.startswith("\\ No newline at end of file"):
                    continue
                if not line or line[0] not in {" ", "+", "-"}:
                    raise ValueError("invalid unified-diff hunk line")
                content = line[1:]
                if line[0] == " ":
                    if cursor >= len(original) or original[cursor] != content:
                        raise ValueError("patch context does not match the target file")
                    output.append(content)
                    cursor += 1
                elif line[0] == "-":
                    if cursor >= len(original) or original[cursor] != content:
                        raise ValueError("patch removal does not match the target file")
                    cursor += 1
                else:
                    output.append(content)
        output.extend(original[cursor:])
        path.write_text("".join(output), encoding="utf-8")

    def execute_tool(self, tool_name: str, args: dict[str, Any]) -> ToolResult:
        """Dispatch one validated tool call and redact every returned error."""
        try:
            arguments = self._require_mapping(args)
            if tool_name == "workspace_read":
                safe_path = self._safe_path(arguments.get("relative_path"))
                if not safe_path.is_file():
                    return ToolResult(False, "", f"FileNotFoundError: {safe_path.name}")
                return ToolResult(True, redact_secrets(safe_path.read_text(encoding="utf-8")))

            if tool_name == "workspace_write":
                safe_path = self._safe_path(arguments.get("relative_path"))
                content = self._require_string(arguments, "content")
                safe_path.parent.mkdir(parents=True, exist_ok=True)
                safe_path.write_text(content, encoding="utf-8")
                return ToolResult(True, f"Successfully wrote {len(content.encode('utf-8'))} bytes.")

            if tool_name == "workspace_patch":
                safe_path = self._safe_path(arguments.get("relative_path"))
                if not safe_path.is_file():
                    return ToolResult(False, "", f"FileNotFoundError: {safe_path.name}")
                self._apply_unified_patch(safe_path, self._require_string(arguments, "patch"))
                return ToolResult(True, "Successfully applied atomic patch.")

            if tool_name == "run_sandbox_command":
                command = arguments.get("command")
                timeout_seconds = arguments.get("timeout_seconds", 60)
                if not isinstance(timeout_seconds, int) or isinstance(timeout_seconds, bool):
                    raise ValueError("timeout_seconds must be an integer")
                return self._run_command(list(command) if isinstance(command, list) else command, timeout_seconds)

            if tool_name == "run_pipeline_stage":
                stage = self._require_string(arguments, "stage_name")
                commands = {
                    "migrate": [sys.executable, "migrations/001_initial.py"],
                    "seed": [sys.executable, "-c", "from scripts.seed import seed; seed('data/app.db')"],
                    "tests": [sys.executable, "-m", "pytest", "-q"],
                }
                if stage == "all":
                    outputs: list[str] = []
                    for name in ("migrate", "seed", "tests"):
                        result = self._run_command(commands[name], 120)
                        outputs.append(f"[{name}]\n{result.output}")
                        if not result.success:
                            return ToolResult(False, "\n".join(outputs), result.error)
                    return ToolResult(True, "\n".join(outputs))
                if stage not in commands:
                    raise ValueError("stage_name must be migrate, seed, tests, or all")
                return self._run_command(commands[stage], 120)

            return ToolResult(False, "", f"Unknown tool: {redact_secrets(str(tool_name))}")
        except Exception as exc:
            return ToolResult(False, "", f"Security/Execution Fault: {redact_secrets(str(exc))}")

    def run_loop(self, objective: str) -> dict[str, Any]:
        """Drive the model through bounded, observable tool calls."""
        if not isinstance(objective, str) or not objective.strip():
            raise ValueError("objective must be a non-empty string")
        self.history.append({"role": "user", "content": objective})
        for step in range(1, self.max_steps + 1):
            response = self._call_model_step(self.history)
            self.history.append({"role": "assistant", "content": response})
            action = self._ACTION_PATTERN.search(response)
            if not action:
                if "Verdict:" in response:
                    return {"success": True, "steps": step, "final_response": redact_secrets(response)}
                return {"success": False, "steps": step, "error": "Model response omitted Action or Verdict."}
            try:
                tool_args = json.loads(action.group(2))
            except json.JSONDecodeError:
                observation = "FAILED: Invalid JSON parameters inside Action call."
            else:
                result = self.execute_tool(action.group(1), tool_args)
                observation = result.output if result.success else f"FAILED: {result.error}"
            self.history.append({"role": "user", "content": f"Observation: {redact_secrets(observation)}"})
        return {"success": False, "steps": self.max_steps, "error": "Max loop steps exceeded without reaching verified Verdict."}

    def _call_model_step(self, messages: list[dict[str, str]]) -> str:
        if self.model_client is not None:
            return str(self.model_client.generate(messages))
        return 'Thought: Assessing the workspace test contract.\nAction: run_pipeline_stage({"stage_name": "tests"})'