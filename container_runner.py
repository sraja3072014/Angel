"""Constrained Docker/Podman execution for generated workspaces.

The runner never invokes a shell. Network access is disabled by default and
must be explicitly enabled for dependency-fetching commands. The host only
mounts the selected workspace and does not expose credentials or the Docker
socket inside the child container.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

from executor import ExecutionResult


@dataclass(frozen=True)
class ContainerPolicy:
    image: str = "python:3.11-slim"
    runtime: str | None = None
    user: str = "1000:1000"
    network: str = "none"
    memory: str = "512m"
    cpus: str = "1.0"
    pids_limit: int = 128
    timeout: float = 60.0

    def validate(self, *, allow_network: bool) -> None:
        if not self.image or any(char in self.image for char in "\r\n"):
            raise ValueError("container image must be a single non-empty line")
        if self.user != "1000:1000":
            raise ValueError("generated code must run as the non-root user 1000:1000")
        if allow_network:
            return
        if self.network != "none":
            raise ValueError("network must be disabled unless explicitly enabled")


class ContainerRunner:
    """Run commands in Docker or Podman with a restrictive default policy."""

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

    def build_command(
        self,
        command: Sequence[str],
        workspace: str | os.PathLike[str],
        *,
        allow_network: bool = False,
    ) -> list[str]:
        if not command or any(not str(part) for part in command):
            raise ValueError("container command must not be empty")
        self.policy.validate(allow_network=allow_network)
        root = self._workspace(workspace)
        runtime = self._runtime()
        network = "bridge" if allow_network else self.policy.network
        return [
            runtime,
            "run",
            "--rm",
            "--user", self.policy.user,
            "--network", network,
            "--memory", self.policy.memory,
            "--cpus", self.policy.cpus,
            "--pids-limit", str(self.policy.pids_limit),
            "--read-only",
            "--tmpfs", "/tmp:rw,noexec,nosuid,size=64m",
            "--mount", f"type=bind,source={root},target=/workspace,rw",
            "--workdir", "/workspace",
            self.policy.image,
            *[str(part) for part in command],
        ]

    def run(
        self,
        command: Sequence[str],
        workspace: str | os.PathLike[str],
        *,
        allow_network: bool = False,
        timeout: float | None = None,
    ) -> ExecutionResult:
        argv = self.build_command(command, workspace, allow_network=allow_network)
        try:
            completed = subprocess.run(
                argv,
                capture_output=True,
                text=True,
                timeout=timeout if timeout is not None else self.policy.timeout,
                shell=False,
                check=False,
            )
            return ExecutionResult(argv, completed.returncode, completed.stdout, completed.stderr)
        except subprocess.TimeoutExpired as error:
            stdout = error.stdout or ""
            stderr = error.stderr or ""
            if isinstance(stdout, bytes):
                stdout = stdout.decode(errors="replace")
            if isinstance(stderr, bytes):
                stderr = stderr.decode(errors="replace")
            return ExecutionResult(argv, -1, stdout, stderr + "\ncontainer timed out", timed_out=True)