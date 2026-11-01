"""
tests/test_engine.py
Automated Unit & Security Regression Suite for Project Angel Engine (Sprints 1-5).
"""

from pathlib import Path
import os
import pytest

from core.executor import LocalSubprocessBackend
from core.memory_store import RepairMemoryStore
from core.path_policy import validate_workspace_relative_path
from core.secret_redactor import redact_secrets

ROOT_DIR = Path(__file__).resolve().parent.parent
WORKSPACE_DIR = ROOT_DIR / "workspace"


def test_local_subprocess_adds_user_site_to_pythonpath(monkeypatch, tmp_path):
  user_site = tmp_path / "site-packages"
  monkeypatch.setattr("core.executor.site.getusersitepackages", lambda: str(user_site))
  captured = {}

  class Process:
    returncode = 0

    def communicate(self, timeout):
      return "", ""

  def fake_popen(command, **kwargs):
    captured["env"] = kwargs["env"]
    return Process()

  monkeypatch.setattr("core.executor.subprocess.Popen", fake_popen)
  backend = LocalSubprocessBackend()
  backend.run_command(
      ["python", "-c", "pass"],
      tmp_path,
      timeout=1,
      env={"PYTHONPATH": "existing-path"},
  )

  assert captured["env"]["PYTHONPATH"] == f"{user_site}{os.pathsep}existing-path"
  backend.run_command(["python", "-c", "pass"], tmp_path, timeout=1, env={})
  assert captured["env"]["PYTHONPATH"] == str(user_site)


# =====================================================================
# Sprint 1: Zero-Trust Path Policy & Boundary Tests
# =====================================================================


def test_path_policy_rejects_directory_traversal():
  """Ensures standard '..' directory traversal attempts are rejected."""
  with pytest.raises(ValueError, match="unsafe workspace path"):
    validate_workspace_relative_path("../evil.py", WORKSPACE_DIR)

  with pytest.raises(ValueError, match="unsafe workspace path"):
    validate_workspace_relative_path("sub/../../evil.py", WORKSPACE_DIR)


def test_path_policy_rejects_windows_ads():
  """Ensures Windows Alternate Data Streams (colon syntax) are blocked."""
  with pytest.raises(ValueError, match="alternate data streams"):
    validate_workspace_relative_path("safe.txt:hidden_stream", WORKSPACE_DIR)


def test_path_policy_rejects_unc_and_drive_paths():
  """Ensures UNC shares and drive letters are rejected."""
  with pytest.raises(ValueError):
    validate_workspace_relative_path(r"\\server\share\payload.py", WORKSPACE_DIR)

  with pytest.raises(ValueError):
    validate_workspace_relative_path("C:/evil.py", WORKSPACE_DIR)


def test_path_policy_rejects_windows_reserved_device_names():
  """Ensures Windows reserved hardware device names cannot be targeted."""
  reserved_samples = ["CON.py", "aux.txt", "COM1.json", "nul"]
  for sample in reserved_samples:
    with pytest.raises(ValueError, match="reserved Windows device name"):
      validate_workspace_relative_path(sample, WORKSPACE_DIR)


def test_path_policy_accepts_valid_relative_path():
  """Ensures valid workspace-relative paths resolve properly inside workspace."""
  resolved = validate_workspace_relative_path("src/api.py", WORKSPACE_DIR)
  assert resolved == (WORKSPACE_DIR / "src" / "api.py").resolve()
  assert resolved.is_relative_to(WORKSPACE_DIR.resolve())


# =====================================================================
# Sprint 5: Secret Redaction Tests
# =====================================================================


def test_secret_redaction_removes_keys_and_passwords():
  """Verifies common sensitive credentials and tokens are redacted."""
  raw_log = (
      "CRITICAL: Failed at db.py with API_KEY=sk-proj-9876543210abcdef "
      "and DB_URL=postgres://user:SuperSecretPassword123@localhost:5432/db"
  )
  cleaned = redact_secrets(raw_log)

  assert "sk-proj-9876543210abcdef" not in cleaned
  assert "SuperSecretPassword123" not in cleaned
  assert "[REDACTED]" in cleaned


# =====================================================================
# Sprint 5: SQLite FTS5 Repair Memory Store Tests
# =====================================================================


def test_memory_store_lifecycle_and_fts_retrieval(tmp_path):
  """Tests SQLite FTS5 indexing, storage, and contextual retrieval."""
  db_path = tmp_path / "test_repairs.sqlite3"
  store = RepairMemoryStore(str(db_path))

  # 1. Store resolution
  store.store(
      traceback="sqlite3.OperationalError: no such table: users",
      faulty_file="src/models.py",
      ast_context={"functions": ["get_user"], "classes": ["UserModel"]},
      patch="@@ -1,2 +1,3 @@\n+db.create_all()\n user = query()",
      resolution="Created schema tables before executing query",
      confidence=0.98,
  )

  # 2. Retrieve via lexical/token match
  results = store.retrieve(
      traceback="sqlite3.OperationalError: no such table: users",
      faulty_file="src/models.py",
  )

  assert len(results) >= 1
  best_match = results[0]

  # Attribute access for RepairMemory dataclass object
  faulty_file = getattr(best_match, "faulty_file", None) or best_match.get(
      "faulty_file"
  )
  patch = getattr(best_match, "patch", None) or best_match.get("patch")
  confidence = getattr(best_match, "confidence", None) or best_match.get(
      "confidence"
  )

  assert faulty_file == "src/models.py"
  assert "db.create_all()" in patch
  assert confidence >= 0.90