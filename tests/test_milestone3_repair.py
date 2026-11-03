"""Closed-loop transactional repair tests for Milestone 3."""

from core.auto_repair import AutoRepairEngine


def _zero_division_traceback(path, function="calculate_discount"):
    return (
        f'File "{path}", line 2, in {function}\n'
        "    return total / items_count\n"
        "ZeroDivisionError: division by zero\n"
    )


def test_closed_loop_auto_repair(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    services = workspace / "services.py"
    services.write_text(
        "def calculate_discount(total: float, items_count: int) -> float:\n"
        "    return total / items_count\n",
        encoding="utf-8",
    )

    result = AutoRepairEngine(
        workspace_dir=str(workspace), db_path=str(tmp_path / "repairs.sqlite3")
    ).repair_failure(_zero_division_traceback("services.py"))

    assert result.repaired
    assert result.source == "AST_SYNTHESIS"
    assert result.applied_patch is not None
    assert "if items_count == 0:" in services.read_text(encoding="utf-8")


def test_failed_verification_rolls_back_and_does_not_learn(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    services = workspace / "services.py"
    original = "def calculate_discount(total: float, items_count: int) -> float:\n    return total / items_count\n"
    services.write_text(original, encoding="utf-8")

    engine = AutoRepairEngine(
        workspace_dir=str(workspace), db_path=str(tmp_path / "repairs.sqlite3"), max_attempts=3
    )
    engine._verify_pipeline = lambda target: False
    result = engine.repair_failure(_zero_division_traceback("services.py"))

    assert not result.repaired
    assert result.attempts == 3
    assert services.read_text(encoding="utf-8") == original
    assert engine.memory_store.retrieve(traceback="ZeroDivisionError", faulty_file="services.py") == []
    assert engine.telemetry[-1] == "circuit_breaker=max_attempts_exhausted"


def test_verified_repair_is_retrievable_from_memory(tmp_path):
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    service = workspace / "services.py"
    service.write_text(
        "def calculate_discount(total: float, items_count: int) -> float:\n"
        "    return total / items_count\n",
        encoding="utf-8",
    )
    database = tmp_path / "repairs.sqlite3"
    engine = AutoRepairEngine(workspace_dir=str(workspace), db_path=str(database))

    assert engine.repair_failure(_zero_division_traceback("services.py")).repaired
    matches = engine.memory_store.retrieve(
        traceback="ZeroDivisionError: division by zero FunctionDef:calculate_discount(total,items_count)",
        faulty_file="services.py",
    )
    assert matches
    assert matches[0].confidence == 1.0