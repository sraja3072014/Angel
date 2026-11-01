"""Hardened Docker/Podman execution for generated workspaces."""

from __future__ import annotations

import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence, TYPE_CHECKING

if TYPE_CHECKING:
    from .executor import ExecutionResult

DEFAULT_PINNED_IMAGE = "python:3.11-slim@sha256:9635410349cba3531fabde484e07f14e625abb40e1bc8b23fffa046cb497ce2d"
_DIGEST_PATTERN = re.compile(r"^[^@\s]+@sha256:[0-9a-f]{64}$")


@dataclass(frozen=True)
class ContainerPolicy:
    image: str = DEFAULT_PINNED_IMAGE
    runtime: str | None = None
    user: str = "1000:1000"
    network: str = "none"
    memory: str = "512m"
    cpus: str = "1.0"
    pids_limit: int = 128
    timeout: float = 60.0

    def validate(self, *, allow_network: bool) -> None:
        if not _DIGEST_PATTERN.fullmatch(self.image):
            raise ValueError("container image must be pinned with an immutable sha256 digest")
        if self.user != "1000:1000":
            raise ValueError("generated code must run as the non-root user 1000:1000")
        if self.pids_limit <= 0 or self.timeout <= 0:
            raise ValueError("container resource limits must be positive")
        if allow_network:
            if self.network not in {"bridge", "none"}:
                raise ValueError("dependency resolution network must be bridge or none")
        elif self.network != "none":
            raise ValueError("pipeline execution must use --network none")


class ContainerRunner:
    """Run commands with no host environment, no capabilities, and no writable source mount."""

    def __init__(self, policy: ContainerPolicy | None = None):
        self.policy = policy or ContainerPolicy()

    def _runtime(self) -> str:
        runtime = self.policy.runtime or shutil.which("docker") or shutil.which("podman")
        if not runtime:
            raise RuntimeError("neither Docker nor Podman is available on PATH")
        return runtime

    @staticmethod
    def _workspace(path: str | os.PathLike[str]) -> Path:
        root = Path(path).resolve()
        if not root.is_dir():
            raise ValueError(f"workspace does not exist: {root}")
        return root

    def build_command(self, command: Sequence[str], workspace: str | os.PathLike[str], *, allow_network: bool = False) -> list[str]:
        if not command or any(not isinstance(part, str) or not part for part in command):
            raise ValueError("container command must not be empty")
        self.policy.validate(allow_network=allow_network)
        root = self._workspace(workspace)
        network = "bridge" if allow_network else "none"
        return [self._runtime(), "run", "--rm", "--init", "--user", self.policy.user, "--network", network, "--cap-drop=ALL", "--security-opt=no-new-privileges:true", "--memory", self.policy.memory, "--cpus", self.policy.cpus, "--pids-limit", str(self.policy.pids_limit), "--read-only", "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m", "--mount", f"type=bind,source={root},target=/workspace,readonly", "--workdir", "/workspace", self.policy.image, *command]

    def run(self, command: Sequence[str], workspace: str | os.PathLike[str], *, allow_network: bool = False, timeout: float | None = None, env: dict[str, str] | None = None) -> "ExecutionResult":
        del env  # Container executions never inherit or receive host secrets.
        argv = self.build_command(command, workspace, allow_network=allow_network)
        from .executor import ExecutionResult
        try:
            completed = subprocess.run(argv, capture_output=True, text=True, timeout=timeout or self.policy.timeout, shell=False, check=False, env={})
            return ExecutionResult(argv, completed.returncode, completed.stdout, completed.stderr)
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout or ""
            stderr = error.stderr or ""
            if isinstance(stdout, bytes):
                stdout = stdout.decode(errors="replace")
            if isinstance(stderr, bytes):
                stderr = stderr.decode(errors="replace")
            return ExecutionResult(argv, -1, stdout, stderr + "\ncontainer timed out", timed_out=True)