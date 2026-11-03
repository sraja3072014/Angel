"""Regression coverage for Milestone 2 traceback and AST isolation."""

from core.ast_analyzer import ASTFaultAnalyzer


def test_ast_fault_isolation_function(tmp_path):
    src_file = tmp_path / "services.py"
    src_file.write_text(
        "def helper():\n"
        "    return 1\n\n"
        "def calculate_discount(total: float, items_count: int) -> float:\n"
        "    return total / items_count\n",
        encoding="utf-8",
    )
    sample_tb = (
        "Traceback (most recent call last):\n"
        f'  File "{src_file}", line 5, in calculate_discount\n'
        "    return total / items_count\n"
        "ZeroDivisionError: division by zero\n"
    )

    context = ASTFaultAnalyzer(workspace_dir=str(tmp_path)).analyze_failure(sample_tb)

    assert context is not None
    assert context.faulty_file == "services.py"
    assert context.line_number == 5
    assert context.exception_type == "ZeroDivisionError"
    assert context.node_name == "calculate_discount"
    assert context.node_type == "FunctionDef"
    assert context.fingerprint == "FunctionDef:calculate_discount(total,items_count)"
    assert "return total / items_count" in context.extracted_code
    artifact = context.to_artifact()
    assert artifact == {
        "status": "ISOLATED",
        "faulty_file": "services.py",
        "exception_type": "ZeroDivisionError",
        "error_message": "division by zero",
        "traceback_frame": {
            "line": 5,
            "column": None,
            "code_line": "    return total / items_count",
        },
        "ast_context": {
            "node_type": "FunctionDef",
            "node_name": "calculate_discount",
            "enclosing_class": None,
            "line_start": 4,
            "line_end": 5,
            "args": ["total", "items_count"],
            "called_functions": [],
            "fingerprint": "FunctionDef:calculate_discount(total,items_count)",
        },
        "extracted_code": "def calculate_discount(total: float, items_count: int) -> float:\n    return total / items_count",
        "module_dependencies": {"imports": []},
    }


def test_ast_fault_isolation_class_method(tmp_path):
    src_file = tmp_path / "models.py"
    src_file.write_text(
        "class InvoiceProcessor:\n"
        "    def process(self, amount):\n"
        "        raise ValueError('Invalid amount')\n",
        encoding="utf-8",
    )
    sample_tb = (
        "Traceback (most recent call last):\n"
        f'  File "{src_file}", line 3, in process\n'
        "ValueError: Invalid amount\n"
    )

    context = ASTFaultAnalyzer(workspace_dir=str(tmp_path)).analyze_failure(sample_tb)

    assert context is not None
    assert context.enclosing_class == "InvoiceProcessor"
    assert context.node_name == "process"
    assert context.exception_type == "ValueError"


def test_ast_fault_ignores_external_frames_and_handles_syntax_errors(tmp_path):
    broken = tmp_path / "broken.py"
    broken.write_text("def incomplete(:\n", encoding="utf-8")
    analyzer = ASTFaultAnalyzer(workspace_dir=str(tmp_path))
    traceback_text = (
        '  File "C:/Python315/Lib/runpy.py", line 1, in run\n'
        f'  File "{broken}", line 1, in <module>\n'
        "SyntaxError: invalid syntax\n"
    )

    context = analyzer.analyze_failure(traceback_text)

    assert context is not None
    assert context.faulty_file == "broken.py"
    assert context.node_type == "SyntaxErrorFrame"
    assert context.exception_type == "SyntaxError"
    assert analyzer.analyze_failure('File "C:/Python315/Lib/os.py", line 1, in run\nRuntimeError: fail') is None


def test_ast_fault_accepts_pytest_exception_prefix(tmp_path):
    source = tmp_path / "failing.py"
    source.write_text("def fail():\n    raise ValueError('nope')\n", encoding="utf-8")
    traceback_text = f'  File "{source}", line 2, in fail\nE   ValueError: nope\n'

    context = ASTFaultAnalyzer(workspace_dir=str(tmp_path)).analyze_failure(traceback_text)

    assert context is not None
    assert context.exception_type == "ValueError"
    assert context.error_message == "nope"