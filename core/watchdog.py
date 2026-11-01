"""Resilient runtime watchdog with safe log rotation and Git staging."""

from __future__ import annotations

import os
import sqlite3
import subprocess
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable

from .secret_redactor import redact


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
    def __init__(self, workspace: str | os.PathLike[str], *, log_paths: Iterable[str | os.PathLike[str]] = (), sqlite_paths: Iterable[str | os.PathLike[str]] = (), learning_trigger: LearningTrigger | None = None, poll_interval: float = 1.0, latency_threshold_ms: float = 250.0, auto_commit: bool = False, tracked_source_files: Iterable[str | os.PathLike[str]] = ()):
        self.workspace = Path(workspace).resolve()
        if not self.workspace.is_dir():
            raise ValueError(f"workspace does not exist: {self.workspace}")
        self.log_paths = [self._confined_path(path) for path in log_paths]
        self.sqlite_paths = [self._confined_path(path) for path in sqlite_paths]
        self.tracked_source_files = [self._confined_path(path) for path in tracked_source_files]
        self.learning_trigger = learning_trigger
        self.poll_interval = max(0.05, poll_interval)
        self.latency_threshold_ms = latency_threshold_ms
        self.auto_commit = auto_commit
        self.stats = WatchdogStats()
        self._offsets: dict[Path, tuple[int, int, int]] = {}
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

    def _relative(self, path: Path) -> str:
        return path.relative_to(self.workspace).as_posix()

    def scan_once(self) -> list[WatchdogEvent]:
        events: list[WatchdogEvent] = []
        try:
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
        except Exception as error:
            self._record_error("scan", error)
        return events

    def _scan_log(self, path: Path) -> list[WatchdogEvent]:
        try:
            stat = path.stat()
        except FileNotFoundError:
            self._offsets.pop(path, None)
            return []
        except OSError as error:
            self._record_error(str(path), error)
            return []
        identity = (int(getattr(stat, "st_ino", 0)), int(getattr(stat, "st_dev", 0)), int(stat.st_size))
        previous = self._offsets.get(path)
        offset = 0 if previous is None or identity[:2] != previous[:2] or stat.st_size < previous[2] else previous[2]
        try:
            with path.open("r", encoding="utf-8", errors="replace") as handle:
                handle.seek(offset)
                content = handle.read()
                final_offset = handle.tell()
            self._offsets[path] = (identity[0], identity[1], final_offset)
        except OSError as error:
            self._record_error(str(path), error)
            return []
        events = []
        for line in content.splitlines():
            lowered = line.lower()
            if any(marker in lowered for marker in ("traceback", "unhandled", "exception", "error")):
                events.append(WatchdogEvent("exception", redact(line), self._relative(path)))
        return events

    def _scan_sqlite(self, path: Path) -> WatchdogEvent | None:
        if not path.exists():
            return None
        started = time.perf_counter()
        try:
            with sqlite3.connect(path, timeout=5.0) as connection:
                connection.execute("PRAGMA busy_timeout=5000")
                connection.execute("SELECT 1").fetchone()
        except sqlite3.Error as error:
            return WatchdogEvent("sqlite_error", redact(str(error)), self._relative(path))
        elapsed = (time.perf_counter() - started) * 1000
        if elapsed >= self.latency_threshold_ms:
            return WatchdogEvent("sqlite_latency", "SQLite probe exceeded threshold", self._relative(path), elapsed)
        return None

    def _git(self, *arguments: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(["git", "-C", str(self.workspace), *arguments], capture_output=True, text=True, check=False, shell=False, env={"PATH": os.environ.get("PATH", "")})

    def commit_resolution(self, message: str) -> bool:
        if not self.auto_commit or not (self.workspace / ".git").is_dir() or not self.tracked_source_files:
            return False
        paths = [self._relative(path) for path in self.tracked_source_files]
        status = self._git("status", "--porcelain", "--", *paths)
        if status.returncode != 0 or not status.stdout.strip():
            return False
        diff = self._git("diff", "HEAD", "--", *paths)
        if diff.returncode != 0 or redact(diff.stdout) != diff.stdout:
            self._record_error("git", RuntimeError("Git commit blocked: possible secret detected in diff"))
            return False
        staged = self._git("add", "--", *[path for path in paths if (self.workspace / path).is_file()])
        if staged.returncode != 0:
            self._record_error("git", RuntimeError(staged.stderr.strip()))
            return False
        commit = self._git("commit", "-m", redact(message))
        if commit.returncode == 0:
            self.stats.commits += 1
            return True
        self._record_error("git", RuntimeError(commit.stderr.strip()))
        return False

    def _record_error(self, source: str, error: BaseException) -> None:
        self.stats.errors.append(redact(f"{source}: {type(error).__name__}: {error}"))

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, name="angel-runtime-watchdog", daemon=True)
        self._thread.start()

    def stop(self, timeout: float = 5.0) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=timeout)

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                self.scan_once()
            except Exception as error:
                self._record_error("watchdog loop", error)
            self._stop.wait(self.poll_interval)