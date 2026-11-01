"""SQLite-backed repair memory with FTS5 retrieval and secret-safe storage."""

from __future__ import annotations

import ast
import hashlib
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping

from .secret_redactor import redact


def ast_context(source: str, file_path: str = "") -> dict[str, object]:
    source = redact(source)
    context: dict[str, object] = {"file": file_path, "syntax_valid": True, "nodes": [], "functions": [], "classes": []}
    try:
        tree = ast.parse(source, filename=file_path or "<source>")
    except SyntaxError as error:
        context.update({"syntax_valid": False, "syntax_error": redact(str(error))})
        return context
    nodes: list[str] = []
    functions: list[str] = []
    classes: list[str] = []
    for node in ast.walk(tree):
        nodes.append(type(node).__name__)
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(node.name)
        elif isinstance(node, ast.ClassDef):
            classes.append(node.name)
    context.update({"nodes": sorted(set(nodes)), "functions": functions, "classes": classes})
    return context


@dataclass(frozen=True)
class RepairMemory:
    id: int
    score: float
    traceback: str
    faulty_file: str
    ast_context: dict[str, object]
    patch: str
    resolution: str
    confidence: float


class RepairMemoryStore:
    def __init__(self, database_path: str | Path):
        self.database_path = str(Path(database_path).resolve())
        Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=5.0)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA journal_mode=WAL")
        connection.execute("PRAGMA busy_timeout=5000")
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS repair_memory (
                id INTEGER PRIMARY KEY AUTOINCREMENT, signature TEXT NOT NULL,
                traceback TEXT NOT NULL, faulty_file TEXT NOT NULL,
                exception_type TEXT NOT NULL DEFAULT '', normalized_traceback TEXT NOT NULL DEFAULT '',
                ast_context TEXT NOT NULL, patch TEXT NOT NULL, resolution TEXT NOT NULL,
                confidence REAL NOT NULL DEFAULT 0.5, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            columns = {row["name"] for row in connection.execute("PRAGMA table_info(repair_memory)")}
            if "exception_type" not in columns:
                connection.execute("ALTER TABLE repair_memory ADD COLUMN exception_type TEXT NOT NULL DEFAULT ''")
            if "normalized_traceback" not in columns:
                connection.execute("ALTER TABLE repair_memory ADD COLUMN normalized_traceback TEXT NOT NULL DEFAULT ''")
            connection.execute("CREATE INDEX IF NOT EXISTS idx_repair_signature ON repair_memory(signature)")
            connection.execute("""CREATE VIRTUAL TABLE IF NOT EXISTS repair_fts USING fts5(
                faulty_file, exception_type, normalized_traceback, resolution,
                content='repair_memory', content_rowid='id'
            )""")
            connection.execute("INSERT INTO repair_fts(repair_fts) VALUES ('rebuild')")

    def store(self, *, traceback: str, faulty_file: str, ast_context: Mapping[str, object] | None, patch: str, resolution: str, confidence: float = 0.8, exception_type: str = "") -> int:
        if not patch.strip():
            raise ValueError("patch must not be empty")
        safe_traceback = redact(traceback)
        safe_file = redact(faulty_file)
        safe_patch = redact(patch)
        safe_resolution = redact(resolution)
        safe_ast = redact(json.dumps(dict(ast_context or {}), sort_keys=True))
        normalized = " ".join(safe_traceback.split())
        signature = hashlib.sha256(f"{safe_traceback}\n{safe_file}".encode()).hexdigest()
        with self._connect() as connection:
            cursor = connection.execute("""INSERT INTO repair_memory
                (signature, traceback, faulty_file, exception_type, normalized_traceback, ast_context, patch, resolution, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""", (signature, safe_traceback, safe_file, redact(exception_type), normalized, safe_ast, safe_patch, safe_resolution, min(1.0, max(0.0, float(confidence)))))
            connection.execute("INSERT INTO repair_fts(rowid, faulty_file, exception_type, normalized_traceback, resolution) VALUES (?, ?, ?, ?, ?)", (cursor.lastrowid, safe_file, redact(exception_type), normalized, safe_resolution))
            return int(cursor.lastrowid)

    def retrieve(self, *, traceback: str, faulty_file: str = "", ast_context: Mapping[str, object] | None = None, limit: int = 5) -> list[RepairMemory]:
        if limit <= 0:
            return []
        safe_traceback = redact(traceback)
        safe_file = redact(faulty_file)
        terms = [item for item in (safe_file, *safe_traceback.split()) if item and len(item) >= 2]
        query = " OR ".join('"' + item.replace('"', '""') + '"' for item in terms[:32]) or '""'
        with self._connect() as connection:
            rows = connection.execute("""SELECT repair_memory.*, bm25(repair_fts) AS rank
                FROM repair_fts JOIN repair_memory ON repair_memory.id = repair_fts.rowid
                WHERE repair_fts MATCH ? ORDER BY rank LIMIT ?""", (query, limit)).fetchall()
        matches: list[RepairMemory] = []
        for row in rows:
            try:
                decoded = json.loads(row["ast_context"])
                if not isinstance(decoded, dict):
                    raise ValueError("AST context is not an object")
            except (json.JSONDecodeError, TypeError, ValueError):
                self._quarantine(row["id"])
                continue
            score = max(0.0, 1.0 / (1.0 + float(row["rank"] or 0.0)))
            if row["faulty_file"] == safe_file and safe_file:
                score = min(1.0, score + 0.2)
            matches.append(RepairMemory(int(row["id"]), score, row["traceback"], row["faulty_file"], decoded, row["patch"], row["resolution"], float(row["confidence"])))
        return matches

    def _quarantine(self, memory_id: int) -> None:
        with self._connect() as connection:
            connection.execute("""CREATE TABLE IF NOT EXISTS repair_memory_quarantine (
                id INTEGER, signature TEXT, traceback TEXT, faulty_file TEXT,
                exception_type TEXT, normalized_traceback TEXT, ast_context TEXT,
                patch TEXT, resolution TEXT, confidence REAL, created_at TEXT,
                quarantine_reason TEXT NOT NULL, quarantined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )""")
            connection.execute("""INSERT INTO repair_memory_quarantine
                (id, signature, traceback, faulty_file, exception_type, normalized_traceback,
                 ast_context, patch, resolution, confidence, created_at, quarantine_reason)
                SELECT id, signature, traceback, faulty_file, exception_type, normalized_traceback,
                 ast_context, patch, resolution, confidence, created_at, 'invalid ast_context'
                FROM repair_memory WHERE id = ?""", (memory_id,))
            connection.execute("DELETE FROM repair_fts WHERE rowid = ?", (memory_id,))
            connection.execute("DELETE FROM repair_memory WHERE id = ?", (memory_id,))


def build_prompt_context(traceback: str, faulty_file: str, ast_metadata: Mapping[str, object], historical_fixes: Iterable[RepairMemory]) -> str:
    examples = [json.dumps({"traceback": redact(memory.traceback), "faulty_file": memory.faulty_file, "patch": redact(memory.patch), "resolution": redact(memory.resolution), "confidence": memory.confidence}, indent=2) for memory in historical_fixes]
    return "Traceback:\n" + redact(traceback) + "\n\nFaulty file:\n" + faulty_file + "\n\nAST context:\n" + redact(json.dumps(dict(ast_metadata), indent=2)) + "\n\nNearest historical fixes:\n" + ("\n---\n".join(examples) if examples else "none")