"""Local Phase 4 repair memory.

This module intentionally uses only the Python standard library. It stores
traceback signatures, AST context, patches, and resolution metadata in SQLite
and retrieves similar incidents using token-vector cosine similarity.
"""

from __future__ import annotations

import ast
import hashlib
import json
import math
import re
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping


def _tokens(value: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[A-Za-z_][A-Za-z0-9_]+", value.lower())
        if len(token) > 2
    }


def _similarity(left: str, right: str) -> float:
    a, b = _tokens(left), _tokens(right)
    if not a or not b:
        return 0.0
    return len(a & b) / math.sqrt(len(a) * len(b))


def ast_context(source: str, file_path: str = "") -> dict[str, object]:
    """Return compact AST metadata suitable for retrieval and prompting."""
    context: dict[str, object] = {"file": file_path, "syntax_valid": True, "nodes": [], "functions": [], "classes": []}
    try:
        tree = ast.parse(source, filename=file_path or "<source>")
    except SyntaxError as error:
        context.update({"syntax_valid": False, "syntax_error": str(error)})
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
    """SQLite-backed local memory for successful repair patterns."""

    def __init__(self, database_path: str | Path):
        self.database_path = str(Path(database_path).resolve())
        Path(self.database_path).parent.mkdir(parents=True, exist_ok=True)
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """CREATE TABLE IF NOT EXISTS repair_memory (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    signature TEXT NOT NULL,
                    traceback TEXT NOT NULL,
                    faulty_file TEXT NOT NULL,
                    ast_context TEXT NOT NULL,
                    patch TEXT NOT NULL,
                    resolution TEXT NOT NULL,
                    confidence REAL NOT NULL DEFAULT 0.5,
                    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )"""
            )
            connection.execute("CREATE INDEX IF NOT EXISTS idx_repair_signature ON repair_memory(signature)")

    def store(
        self,
        *,
        traceback: str,
        faulty_file: str,
        ast_context: Mapping[str, object] | None,
        patch: str,
        resolution: str,
        confidence: float = 0.8,
    ) -> int:
        if not patch.strip():
            raise ValueError("patch must not be empty")
        confidence = min(1.0, max(0.0, float(confidence)))
        signature = hashlib.sha256(f"{traceback}\n{faulty_file}".encode()).hexdigest()
        with self._connect() as connection:
            cursor = connection.execute(
                """INSERT INTO repair_memory
                (signature, traceback, faulty_file, ast_context, patch, resolution, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (signature, traceback, faulty_file, json.dumps(dict(ast_context or {})), patch, resolution, confidence),
            )
            return int(cursor.lastrowid)

    def retrieve(
        self,
        *,
        traceback: str,
        faulty_file: str = "",
        ast_context: Mapping[str, object] | None = None,
        limit: int = 5,
    ) -> list[RepairMemory]:
        if limit <= 0:
            return []
        query_text = f"{traceback}\n{faulty_file}\n{json.dumps(dict(ast_context or {}), sort_keys=True)}"
        with self._connect() as connection:
            rows = connection.execute("SELECT * FROM repair_memory ORDER BY id DESC").fetchall()
        matches: list[RepairMemory] = []
        for row in rows:
            candidate_text = f"{row['traceback']}\n{row['faulty_file']}\n{row['ast_context']}"
            score = _similarity(query_text, candidate_text)
            if row["faulty_file"] == faulty_file and faulty_file:
                score = min(1.0, score + 0.2)
            matches.append(RepairMemory(
                id=row["id"], score=score, traceback=row["traceback"],
                faulty_file=row["faulty_file"], ast_context=json.loads(row["ast_context"]),
                patch=row["patch"], resolution=row["resolution"], confidence=row["confidence"],
            ))
        return sorted(matches, key=lambda item: (item.score, item.confidence), reverse=True)[:limit]


def build_prompt_context(
    traceback: str,
    faulty_file: str,
    ast_metadata: Mapping[str, object],
    historical_fixes: Iterable[RepairMemory],
) -> str:
    """Create bounded few-shot context for an external LLM repair adapter."""
    examples = []
    for memory in historical_fixes:
        examples.append(json.dumps({
            "traceback": memory.traceback,
            "faulty_file": memory.faulty_file,
            "patch": memory.patch,
            "resolution": memory.resolution,
            "confidence": memory.confidence,
        }, indent=2))
    return (
        "Traceback:\n" + traceback + "\n\n"
        "Faulty file:\n" + faulty_file + "\n\n"
        "AST context:\n" + json.dumps(dict(ast_metadata), indent=2) + "\n\n"
        "Nearest historical fixes:\n" + ("\n---\n".join(examples) if examples else "none")
    )