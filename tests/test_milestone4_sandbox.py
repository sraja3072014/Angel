"""tests/test_milestone4_sandbox.py
Validates sandbox process containment, timeout kill switches, and resource quotas.
"""

import pytest

from core.container_backend import IsolatedSandboxBackend
from core.container_runner import ContainerRunner
from core.executor import ExecutionResult


def test_sandbox_timeout_termination(tmp_path):
    backend = IsolatedSandboxBackend(timeout_seconds=2)
    # Execute a hanging process
    result = backend.run_isolated(
        ["python", "-c", "import time; time.sleep(10)"],
        cwd=str(tmp_path),
    )
    assert result.timed_out is True
    assert result.returncode == 124


def test_sandbox_network_suppression(tmp_path):
    backend = IsolatedSandboxBackend(allow_network=False)
    # Verify proxy suppression injection
    result = backend.run_isolated(
        ["python", "-c", "import os; print(os.environ.get('HTTP_PROXY'))"],
        cwd=str(tmp_path),
    )
    assert result.returncode == 0
    assert "127.0.0.1:0" in result.stdout


def test_sandbox_timeout_is_reported_as_124(monkeypatch, tmp_path):
    observed = {}

    def fake_run(runner, command, workspace, **kwargs):
        observed.update(kwargs)
        return ExecutionResult(list(command), -1, "", "container timed out", timed_out=True)

    monkeypatch.setattr("core.container_backend.ContainerRunner.run", fake_run)
    backend = IsolatedSandboxBackend(timeout_seconds=2)
    result = backend.run_isolated(["python", "-c", "pass"], str(tmp_path))

    assert observed["timeout"] == 2
    assert result.timed_out is True
    assert result.returncode == 124


def test_sandbox_disables_network_by_default(monkeypatch, tmp_path):
    observed = {}

    def fake_run(runner, command, workspace, **kwargs):
        observed.update(kwargs)
        return ExecutionResult(list(command), 0, "", "")

    monkeypatch.setattr("core.container_backend.ContainerRunner.run", fake_run)
    backend = IsolatedSandboxBackend()
    result = backend.run_isolated(["python", "-c", "pass"], str(tmp_path))

    assert result.returncode == 0
    assert observed["allow_network"] is False
    assert observed["env"] == {}


def test_network_access_requires_pip_install(tmp_path):
    backend = IsolatedSandboxBackend(allow_network=True)

    with pytest.raises(ValueError, match="pip install"):
        backend.run_isolated(["python", "-c", "pass"], str(tmp_path))


def test_network_enabled_pip_install_is_recognized():
    assert IsolatedSandboxBackend._is_pip_install(["python", "-m", "pip", "install", "pytest"])
    assert IsolatedSandboxBackend._is_pip_install(["pip", "install", "pytest"])
    assert not IsolatedSandboxBackend._is_pip_install(["python", "-m", "pip", "download", "pytest"])


def test_sandbox_rejects_resource_limits_above_milestone_caps():
    with pytest.raises(ValueError, match="memory limit"):
        IsolatedSandboxBackend(memory_limit_mb=513)

    with pytest.raises(ValueError, match="timeout"):
        IsolatedSandboxBackend(timeout_seconds=31)


def test_container_command_enforces_network_and_memory_bounds(monkeypatch, tmp_path):
    runner = ContainerRunner()
    monkeypatch.setattr(runner, "_runtime", lambda: "docker")

    command = runner.build_command(["python", "-m", "pytest", "-q"], tmp_path)

    assert command[command.index("--network") + 1] == "none"
    assert command[command.index("--memory") + 1] == "512m"
    assert "--read-only" in command


def test_container_command_only_receives_allowlisted_environment(monkeypatch, tmp_path):
    runner = ContainerRunner()
    monkeypatch.setattr(runner, "_runtime", lambda: "docker")

    command = runner.build_command(
        ["python", "-c", "pass"], tmp_path, env={"LANG": "C"}
    )

    assert command[command.index("--env") + 1] == "LANG=C"
    with pytest.raises(ValueError, match="allowlist"):
        runner.build_command(
            ["python", "-c", "pass"], tmp_path, env={"SECRET_TOKEN": "value"}
        )
