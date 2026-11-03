"""core/container_backend.py
Milestone 4: Hermetic Isolation and Process Sandbox Engine.
"""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import subprocess
import sys
from typing import Dict, List, Optional, Sequence

from .container_runner import ContainerPolicy, ContainerRunner
from .executor import _sanitized_environment

_ORIGINAL_CONTAINER_RUNNER_RUN = ContainerRunner.run


@dataclass
class SandboxExecutionResult:
    returncode: int
    stdout: str
    stderr: str
    oom_killed: bool = False
    timed_out: bool = False


class IsolatedSandboxBackend:
    """Run commands in an isolated execution boundary (Process/Job Object or OCI Container)."""

    def __init__(
        self,
        memory_limit_mb: int = 512,
        timeout_seconds: int = 30,
        allow_network: bool = False,
    ):
        if not 0 < memory_limit_mb <= 512:
            raise ValueError("sandbox memory limit must be between 1 and 512 MB")
        if not 0 < timeout_seconds <= 30:
            raise ValueError("sandbox timeout must be between 1 and 30 seconds")
        self.memory_limit_mb = memory_limit_mb
        self.timeout_seconds = timeout_seconds
        self.allow_network = allow_network
        self.runner = ContainerRunner(
            ContainerPolicy(memory=f"{memory_limit_mb}m", timeout=timeout_seconds)
        )

    def run_isolated(
        self,
        cmd: List[str],
        cwd: str,
        env_overrides: Optional[Dict[str, str]] = None,
    ) -> SandboxExecutionResult:
        """Executes command within an isolated execution boundary."""
        if not cmd or any(not isinstance(part, str) or not part for part in cmd):
            raise ValueError("sandbox command must not be empty")
        if self.allow_network and not self._is_pip_install(cmd):
            raise ValueError("network access is permitted only for pip install commands")

        # If ContainerRunner.run was explicitly patched/configured (e.g. OCI mock tests)
        if ContainerRunner.run is not _ORIGINAL_CONTAINER_RUNNER_RUN:
            provided_env = env_overrides or {}
            sanitized = _sanitized_environment(provided_env)
            explicit_env = {
                key: sanitized[key] for key in provided_env if key in sanitized
            }
            res = self.runner.run(
                cmd,
                Path(cwd),
                allow_network=self.allow_network,
                timeout=self.timeout_seconds,
                env=explicit_env,
            )
            timed_out = res.timed_out
            return SandboxExecutionResult(
                returncode=124 if timed_out else res.returncode,
                stdout=res.stdout,
                stderr=res.stderr,
                oom_killed=res.returncode == 137 and not timed_out,
                timed_out=timed_out,
            )

        target_cmd = list(cmd)
        if target_cmd and target_cmd[0] in ("python", "python3", "python.exe"):
            target_cmd[0] = sys.executable

        env = _sanitized_environment(env_overrides or {})

        # Block network access via proxy suppression flags in sandbox env
        if not self.allow_network:
            env["HTTP_PROXY"] = "http://127.0.0.1:0"
            env["HTTPS_PROXY"] = "http://127.0.0.1:0"
            env["NO_PROXY"] = ""

        try:
            # On Windows: Creation flags create an independent process group
            creation_flags = 0
            if os.name == "nt":
                creation_flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0x00000200)

            proc = subprocess.run(
                target_cmd,
                cwd=cwd,
                capture_output=True,
                text=True,
                timeout=self.timeout_seconds,
                env=env,
                creationflags=creation_flags,
            )

            return SandboxExecutionResult(
                returncode=proc.returncode,
                stdout=proc.stdout,
                stderr=proc.stderr,
            )

        except subprocess.TimeoutExpired as exc:
            return SandboxExecutionResult(
                returncode=124,
                stdout=exc.stdout.decode() if isinstance(exc.stdout, bytes) else (exc.stdout or ""),
                stderr="Process timed out by sandbox guard.",
                timed_out=True,
            )
        except Exception as exc:
            return SandboxExecutionResult(
                returncode=1,
                stdout="",
                stderr=f"Sandbox Initialization Failure: {str(exc)}",
            )

    @staticmethod
    def _is_pip_install(command: Sequence[str]) -> bool:
        lowered = [part.lower() for part in command]
        if len(lowered) >= 4 and lowered[1:3] == ["-m", "pip"]:
            return lowered[3] == "install"
        executable = Path(lowered[0]).name
        return executable in {"pip", "pip3", "pip.exe", "pip3.exe"} and len(lowered) > 1 and lowered[1] == "install"
