"""Traceback-driven AST fault isolation for Project Angel.

Only source files proven to reside inside the configured workspace are read.
The analyzer returns a minimal scope artifact suitable for repair-memory lookup
or an automated patch generator; it never forwards an entire module by default.
"""

from __future__ import annotations

import ast
from dataclasses import asdict, dataclass
from pathlib import Path
import re
import tokenize
from io import StringIO
from typing import Any, Optional

from .path_policy import WorkspacePathError, validate_workspace_relative_path
from .secret_redactor import redact_secrets


_FRAME_PATTERN = re.compile(
    r'^\s*File\s+"(?P<path>[^"]+)",\s+line\s+(?P<line>\d+)'
    r'(?:,\s+column\s+(?P<column>\d+))?(?:,\s+in\s+.*)?\s*$',
    re.MULTILINE,
)
_EXCEPTION_PATTERN = re.compile(
    r"^(?P<type>[A-Za-z_]\w*(?:Error|Exception|Failure|Exit|Interrupt|StopIteration|GeneratorExit|Warning))"
    r"(?::\s*(?P<message>.*))?$",
    re.MULTILINE,
)


@dataclass(frozen=True)
class FaultContext:
    """Minimal, redacted source context for one workspace-local failure."""

    faulty_file: str
    line_number: int
    exception_type: str
    error_message: str
    node_type: str
    node_name: str
    enclosing_class: Optional[str]
    line_start: int
    line_end: int
    fingerprint: str
    extracted_code: str
    relevant_imports: list[str]
    column: Optional[int] = None
    code_line: str = ""
    args: list[str] | None = None
    called_functions: list[str] | None = None

    def to_artifact(self) -> dict[str, Any]:
        """Return the standardized, JSON-serializable fault artifact."""
        return {
            "status": "ISOLATED",
            "faulty_file": self.faulty_file,
            "exception_type": self.exception_type,
            "error_message": self.error_message,
            "traceback_frame": {
                "line": self.line_number,
                "column": self.column,
                "code_line": self.code_line,
            },
            "ast_context": {
                "node_type": self.node_type,
                "node_name": self.node_name,
                "enclosing_class": self.enclosing_class,
                "line_start": self.line_start,
                "line_end": self.line_end,
                "args": self.args or [],
                "called_functions": self.called_functions or [],
                "fingerprint": self.fingerprint,
            },
            "extracted_code": self.extracted_code,
            "module_dependencies": {"imports": self.relevant_imports},
        }

    def asdict(self) -> dict[str, Any]:
        """Return dataclass fields for callers that persist typed metadata."""
        return asdict(self)


class ASTFaultAnalyzer:
    """Map a redacted failure signal to its smallest useful workspace scope."""

    def __init__(self, workspace_dir: str = "workspace"):
        self.workspace = Path(workspace_dir).resolve()
        if not self.workspace.is_dir():
            raise ValueError(f"workspace does not exist or is not a directory: {self.workspace}")

    def analyze_failure(self, traceback_str: str) -> Optional[FaultContext]:
        """Resolve the deepest workspace traceback frame into an AST context."""
        if not isinstance(traceback_str, str):
            raise ValueError("traceback_str must be a string")
        sanitized = redact_secrets(traceback_str)
        frame = self._parse_deepest_workspace_frame(sanitized)
        if frame is None:
            return None
        relative_path, line_number, column, exception_type, error_message = frame
        try:
            safe_path = validate_workspace_relative_path(relative_path, self.workspace)
        except WorkspacePathError:
            return None
        if not safe_path.is_file():
            return None

        source = safe_path.read_text(encoding="utf-8")
        source_lines = source.splitlines()
        code_line = source_lines[line_number - 1] if 0 < line_number <= len(source_lines) else ""
        try:
            tree = ast.parse(source, filename=str(safe_path))
        except SyntaxError as error:
            return self._syntax_error_context(
                relative_path,
                line_number,
                column,
                exception_type,
                error_message,
                source,
                error,
            )

        node, enclosing_class = self._find_enclosing_node(tree, line_number)
        line_start = getattr(node, "lineno", line_number)
        line_end = getattr(node, "end_lineno", line_number)
        extracted = "\n".join(source_lines[max(0, line_start - 1) : line_end])
        args = self._argument_names(node)
        called_functions = self._called_functions(node)
        node_name = getattr(node, "name", "<module>")
        return FaultContext(
            faulty_file=relative_path,
            line_number=line_number,
            column=column,
            exception_type=exception_type,
            error_message=error_message,
            node_type=type(node).__name__,
            node_name=node_name,
            enclosing_class=enclosing_class,
            line_start=line_start,
            line_end=line_end,
            fingerprint=self._generate_fingerprint(node),
            extracted_code=redact_secrets(extracted),
            relevant_imports=self._extract_module_imports(tree),
            code_line=redact_secrets(code_line),
            args=args,
            called_functions=called_functions,
        )

    def _parse_deepest_workspace_frame(
        self, traceback_text: str
    ) -> Optional[tuple[str, int, Optional[int], str, str]]:
        exception_type, error_message = self._exception_details(traceback_text)
        for match in reversed(list(_FRAME_PATTERN.finditer(traceback_text))):
            relative = self._workspace_relative_path(match.group("path"))
            if relative is not None:
                column = match.group("column")
                return relative, int(match.group("line")), int(column) if column else None, exception_type, error_message
        return None

    def _workspace_relative_path(self, raw_path: str) -> Optional[str]:
        """Return a canonical relative path only for a workspace-owned frame."""
        if not raw_path or raw_path.startswith("<"):
            return None
        normalized = raw_path.replace("\\", "/")
        candidate = Path(raw_path)
        try:
            if candidate.is_absolute():
                resolved = candidate.resolve(strict=False)
                relative = resolved.relative_to(self.workspace)
                return relative.as_posix()
            safe = validate_workspace_relative_path(normalized, self.workspace)
            return safe.relative_to(self.workspace).as_posix()
        except (ValueError, OSError, WorkspacePathError):
            return None

    @staticmethod
    def _exception_details(traceback_text: str) -> tuple[str, str]:
        for line in reversed(traceback_text.splitlines()):
            # pytest prefixes captured exception lines with ``E   ``.
            candidate = re.sub(r"^\s*E\s+", "", line).strip()
            match = _EXCEPTION_PATTERN.fullmatch(candidate)
            if match:
                return match.group("type"), redact_secrets((match.group("message") or "").strip())
        return "RuntimeError", ""

    def _find_enclosing_node(self, tree: ast.AST, target_line: int) -> tuple[ast.AST, Optional[str]]:
        """Find the smallest enclosing function or class for ``target_line``."""
        best: ast.AST = tree
        best_span: Optional[int] = None
        best_class: Optional[str] = None
        statement_fallback: ast.AST = tree
        statement_span: Optional[int] = None

        def visit(node: ast.AST, enclosing_class: Optional[str]) -> None:
            nonlocal best, best_span, best_class, statement_fallback, statement_span
            start = getattr(node, "lineno", None)
            end = getattr(node, "end_lineno", None)
            if start is not None and end is not None and start <= target_line <= end:
                if isinstance(node, ast.stmt):
                    span = end - start
                    if statement_span is None or span <= statement_span:
                        statement_fallback, statement_span = node, span
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
                    span = end - start
                    if best_span is None or span <= best_span:
                        best, best_span = node, span
                        best_class = enclosing_class if not isinstance(node, ast.ClassDef) else enclosing_class
                next_class = node.name if isinstance(node, ast.ClassDef) else enclosing_class
                for child in ast.iter_child_nodes(node):
                    visit(child, next_class)

        for child in ast.iter_child_nodes(tree):
            visit(child, None)
        return (best, best_class) if best_span is not None else (statement_fallback, None)

    @staticmethod
    def _extract_module_imports(tree: ast.Module) -> list[str]:
        imports: list[str] = []
        for node in tree.body:
            if isinstance(node, ast.Import):
                imports.append("import " + ", ".join(alias.name + (f" as {alias.asname}" if alias.asname else "") for alias in node.names))
            elif isinstance(node, ast.ImportFrom):
                prefix = "." * node.level + (node.module or "")
                names = ", ".join(alias.name + (f" as {alias.asname}" if alias.asname else "") for alias in node.names)
                imports.append(f"from {prefix} import {names}")
        return imports

    @staticmethod
    def _argument_names(node: ast.AST) -> list[str]:
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return []
        positional = [argument.arg for argument in (*node.args.posonlyargs, *node.args.args)]
        keyword_only = [argument.arg for argument in node.args.kwonlyargs]
        extras = ([node.args.vararg.arg] if node.args.vararg else []) + ([node.args.kwarg.arg] if node.args.kwarg else [])
        return positional + extras + keyword_only

    @staticmethod
    def _called_functions(node: ast.AST) -> list[str]:
        names: list[str] = []
        for candidate in ast.walk(node):
            if isinstance(candidate, ast.Call):
                if isinstance(candidate.func, ast.Name):
                    names.append(candidate.func.id)
                elif isinstance(candidate.func, ast.Attribute):
                    names.append(candidate.func.attr)
        return sorted(set(names))

    def _generate_fingerprint(self, node: ast.AST) -> str:
        node_type = type(node).__name__
        name = getattr(node, "name", "<module>")
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return f"{node_type}:{name}({','.join(self._argument_names(node))})"
        if isinstance(node, ast.ClassDef):
            return f"ClassDef:{name}"
        # ast.dump is whitespace/comment-independent and captures statement shape.
        normalized = ast.dump(node, annotate_fields=False, include_attributes=False)
        return f"{node_type}:{normalized}"

    def _syntax_error_context(
        self,
        relative_path: str,
        traceback_line: int,
        traceback_column: Optional[int],
        exception_type: str,
        error_message: str,
        source: str,
        error: SyntaxError,
    ) -> FaultContext:
        error_line = error.lineno or traceback_line
        error_column = error.offset or traceback_column
        lines = source.splitlines()
        code_line = lines[error_line - 1] if 0 < error_line <= len(lines) else ""
        token = self._syntax_token(source, error_line, error_column)
        message = error_message or redact_secrets(error.msg)
        if token:
            message = f"{message} (token: {token})"
        return FaultContext(
            faulty_file=relative_path,
            line_number=error_line,
            column=error_column,
            exception_type=exception_type if exception_type != "RuntimeError" else "SyntaxError",
            error_message=message,
            node_type="SyntaxErrorFrame",
            node_name="<unknown>",
            enclosing_class=None,
            line_start=error_line,
            line_end=error_line,
            fingerprint=f"SyntaxError:{relative_path}:{error_line}:{token or '<unknown>'}",
            extracted_code=redact_secrets(code_line),
            relevant_imports=[],
            code_line=redact_secrets(code_line),
            args=[],
            called_functions=[],
        )

    @staticmethod
    def _syntax_token(source: str, line: int, column: Optional[int]) -> str:
        if not column:
            return ""
        try:
            for token in tokenize.generate_tokens(StringIO(source).readline):
                if token.start[0] == line and token.start[1] <= column - 1 <= token.end[1]:
                    return token.string
        except (tokenize.TokenError, IndentationError):
            pass
        return ""