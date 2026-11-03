"""Regression coverage for the Milestone 1 deterministic ReAct engine."""

from core.llm import ReActAgentEngine


def test_react_engine_sandboxed_file_ops_and_atomic_patch(tmp_path):
    engine = ReActAgentEngine(workspace_dir=str(tmp_path))

    written = engine.execute_tool(
        "workspace_write",
        {"relative_path": "src/module.py", "content": "print('Engine ready')\n"},
    )
    assert written.success
    assert (tmp_path / "src" / "module.py").is_file()

    read = engine.execute_tool("workspace_read", {"relative_path": "src/module.py"})
    assert read.success
    assert read.output == "print('Engine ready')\n"

    patched = engine.execute_tool(
        "workspace_patch",
        {"relative_path": "src/module.py", "patch": "@@ -1 +1 @@\n-print('Engine ready')\n+print('Patched')\n"},
    )
    assert patched.success
    assert (tmp_path / "src" / "module.py").read_text(encoding="utf-8") == "print('Patched')\n"

    escaped = engine.execute_tool("workspace_read", {"relative_path": "../secrets.env"})
    assert not escaped.success
    assert escaped.error is not None
    assert "Security/Execution Fault" in escaped.error


def test_react_engine_redacts_sandbox_output_and_maps_python(tmp_path):
    engine = ReActAgentEngine(workspace_dir=str(tmp_path))
    result = engine.execute_tool(
        "run_sandbox_command",
        {"command": ["python", "-c", "print('api_key=sk-abcdefghijklmnopqrst')"]},
    )
    assert result.success
    assert "sk-abcdefghijklmnopqrst" not in result.output
    assert "[REDACTED]" in result.output


def test_react_pipeline_stage_execution():
    engine = ReActAgentEngine(workspace_dir="workspace")
    result = engine.execute_tool("run_pipeline_stage", {"stage_name": "tests"})
    assert result.success
    assert "passed" in result.output