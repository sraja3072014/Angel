"""Background runtime watchdog for logs, SQLite latency, learning, and Git."""

from __future__ import annotations

import os
import sqlite3
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable

from executor import ExecutionResult


@dataclass(frozen=True)
class WatchdogEvent:
    kind: str
    message: str
    source: str = ""
    latency_ms: float | None = None


@dataclass
class WatchdogStats:
    events_seen: int = 0
    learning_triggers: int = 0
    commits: int = 0
    errors: list[str] = field(default_factory=list)


LearningTrigger = Callable[[WatchdogEvent], bool]


class RuntimeWatchdog:
    """Poll logs and SQLite latency while keeping mutation callbacks explicit."""

    def __init__(
        self,
        workspace: str | os.PathLike[str],
        *,
        log_paths: Iterable[str | os.PathLike[str]] = (),
        sqlite_paths: Iterable[str | os.PathLike[str]] = (),
        learning_trigger: LearningTrigger | None = None,
        poll_interval: float = 1.0,
        latency_threshold_ms: float = 250.0,
        auto_commit: bool = False,
    ):
        self.workspace = Path(workspace).resolve()
        if not self.workspace.is_dir():
            raise ValueError(f"workspace does not exist: {self.workspace}")
        self.log_paths = [self._confined_path(path) for path in log_paths]
        self.sqlite_paths = [self._confined_path(path) for path in sqlite_paths]
        self.learning_trigger = learning_trigger
        self.poll_interval = max(0.05, poll_interval)
        self.latency_threshold_ms = latency_threshold_ms
        self.auto_commit = auto_commit
        self.stats = WatchdogStats()
        self._offsets: dict[Path, int] = {}
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _confined_path(self, path: str | os.PathLike[str]) -> Path:
        candidate = Path(path)
        if not candidate.is_absolute():
            candidate = self.workspace / candidate
        resolved = candidate.resolve()
        if resolved != self.workspace and self.workspace not in resolved.parents:
            raise ValueError(f"watchdog path escapes workspace: {path}")
        return resolved

    def scan_once(self) -> list[WatchdogEvent]:
        events: list[WatchdogEvent] = []
        for path in self.log_paths:
            events.extend(self._scan_log(path))
        for path in self.sqlite_paths:
            event = self._scan_sqlite(path)
            if event:
                events.append(event)
        for event in events:
            self.stats.events_seen += 1
            if self.learning_trigger and self.learning_trigger(event):
                self.stats.learning_triggers += 1
        return events

    def _scan_log(self, path: Path) -> list[WatchdogEvent]:
        if not path.exists():
            return []
        try:
            with path.open("r", encoding="utf-8", errors="replace") as handle:
                handle.seek(self._offsets.get(path, 0))
                content = handle.read()
                self._offsets[path] = handle.tell()
        except OSError as error:
            self.stats.errors.append(str(error))
            return []
        events = []
        for line in content.splitlines():
            lowered = line.lower()
            if any(marker in lowered for marker in ("traceback", "unhandled", "exception", "error")):
                events.append(WatchdogEvent("exception", line, str(path.relative_to(self.workspace))))
        return events

    def _scan_sqlite(self, path: Path) -> WatchdogEvent | None:
        if not path.exists():
            return None
        started = time.perf_counter()
        try:
            with sqlite3.connect(path) as connection:
                connection.execute("SELECT 1").fetchone()
        except sqlite3.Error as error:
            return WatchdogEvent("sqlite_error", str(error), str(path.relative_to(self.workspace)))
        elapsed = (time.perf_counter() - started) * 1000
        if elapsed >= self.latency_threshold_ms:
            return WatchdogEvent("sqlite_latency", "SQLite probe exceeded threshold", str(path.relative_to(self.workspace)), elapsed)
        return None

    def commit_resolution(self, message: str) -> bool:
        """Create an explicit Git commit only when enabled and a repo exists."""
        if not self.auto_commit:
            return False
        if not (self.workspace / ".git").is_dir():
            self.stats.errors.append("Git commit skipped: workspace is not a repository")
            return False
        status = subprocess.run(["git", "-C", str(self.workspace), "status", "--porcelain"], capture_output=True, text=True, check=False)
        if status.returncode != 0 or not status.stdout.strip():
            return False
        commit = subprocess.run(["git", "-C", str(self.workspace), "add", "--all"], capture_output=True, text=True, check=False)
        if commit.returncode != 0:
            self.stats.errors.append(commit.stderr.strip())
            return False
        commit = subprocess.run(["git", "-C", str(self.workspace), "commit", "-m", message], capture_output=True, text=True, check=False)
        if commit.returncode == 0:
            self.stats.commits += 1
            return True
        self.stats.errors.append(commit.stderr.strip())
        return False

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="jarvis-runtime-watchdog", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=timeout)

    def _run(self) -> None:
        while not self._stop.is_set():
            self.scan_once()
            self._stop.wait(self.poll_interval)