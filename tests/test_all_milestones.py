"""
tests/test_all_milestones.py
Comprehensive End-to-End Test Suite for Project Angel AI Milestones 1 to 5.
"""

from pathlib import Path
import pytest

from core.admin_console import SuperAdminConsole, TenantLicense
from core.ast_analyzer import ASTFaultAnalyzer
from core.auto_repair import AutoRepairEngine
from core.container_backend import IsolatedSandboxBackend
from core.llm import ReActAgentEngine


# ---------------------------------------------------------------------------
# Milestone 1: ReAct Reasoning & Tool Execution Sandbox
# ---------------------------------------------------------------------------
def test_milestone_1_react_and_sandbox(tmp_path):
  engine = ReActAgentEngine(workspace_dir=str(tmp_path))

  # 1. File write via tool
  write_res = engine.execute_tool(
      "workspace_write",
      {
          "relative_path": "src/app.py",
          "content": "def run():\n    return 'OK'\n",
      },
  )
  assert write_res.success is True
  assert (tmp_path / "src" / "app.py").exists()

  # 2. File read via tool
  read_res = engine.execute_tool(
      "workspace_read", {"relative_path": "src/app.py"}
  )
  assert read_res.success is True
  assert "def run():" in read_res.output

  # 3. Path boundary violation rejection
  escape_res = engine.execute_tool(
      "workspace_read", {"relative_path": "../../secret.env"}
  )
  assert escape_res.success is False
  assert escape_res.error is not None
  assert "Security/Execution Fault" in escape_res.error


# ---------------------------------------------------------------------------
# Milestone 2: AST Analysis & Fault Context Isolation
# ---------------------------------------------------------------------------
def test_milestone_2_ast_fault_isolation(tmp_path):
  src_file = tmp_path / "calc.py"
  src_file.write_text(
      "def compute_rate(val: float, factor: int) -> float:\n"
      "    return val / factor\n",
      encoding="utf-8",
  )

  tb = (
      'Traceback (most recent call last):\n'
      f'  File "{src_file}", line 2, in compute_rate\n'
      '    return val / factor\n'
      'ZeroDivisionError: division by zero\n'
  )

  analyzer = ASTFaultAnalyzer(workspace_dir=str(tmp_path))
  ctx = analyzer.analyze_failure(tb)

  assert ctx is not None
  assert ctx.faulty_file == "calc.py"
  assert ctx.line_number == 2
  assert ctx.exception_type == "ZeroDivisionError"
  assert ctx.node_name == "compute_rate"
  assert "compute_rate(val,factor)" in ctx.fingerprint


# ---------------------------------------------------------------------------
# Milestone 3: Closed-Loop Auto-Repair Engine
# ---------------------------------------------------------------------------
def test_milestone_3_closed_loop_repair(tmp_path):
  ws = tmp_path / "workspace"
  ws.mkdir()
  services = ws / "services.py"
  services.write_text(
      "def calculate_discount(total: float, items_count: int) -> float:\n"
      "    return total / items_count\n",
      encoding="utf-8",
  )

  tb = (
      'Traceback (most recent call last):\n'
      '  File "services.py", line 2, in calculate_discount\n'
      '    return total / items_count\n'
      'ZeroDivisionError: division by zero\n'
  )

  db_file = tmp_path / "repairs.sqlite3"
  repair_engine = AutoRepairEngine(
      workspace_dir=str(ws), db_path=str(db_file), max_attempts=2
  )
  result = repair_engine.repair_failure(tb)

  assert result.repaired is True
  assert "if items_count == 0:" in services.read_text(encoding="utf-8")
  assert result.source in ("FTS5_MEMORY", "AST_SYNTHESIS")


# ---------------------------------------------------------------------------
# Milestone 4: Hermetic Process Sandbox & Resource Isolation
# ---------------------------------------------------------------------------
def test_milestone_4_hermetic_sandbox(tmp_path):
  backend = IsolatedSandboxBackend(timeout_seconds=3, allow_network=False)

  # Check proxy blackhole injection
  res = backend.run_isolated(
      ["python", "-c", "import os; print(os.environ.get('HTTP_PROXY'))"],
      cwd=str(tmp_path),
  )
  assert res.returncode == 0
  assert "127.0.0.1:0" in res.stdout

  # Check timeout kill-switch
  hang_res = backend.run_isolated(
      ["python", "-c", "import time; time.sleep(10)"], cwd=str(tmp_path)
  )
  assert hang_res.timed_out is True
  assert hang_res.returncode == 124


# ---------------------------------------------------------------------------
# Milestone 5: Multi-Tenant Console, HMAC Licensing & RBAC Audit
# ---------------------------------------------------------------------------
def test_milestone_5_multi_tenant_admin(tmp_path):
  console = SuperAdminConsole(base_dir=str(tmp_path))

  # 1. License issuance & signature validation
  lic = console.issue_license("client_corp_01", tier="ENTERPRISE")
  assert console.verify_license(lic) is True

  # 2. Tampered license rejection
  tampered_lic = TenantLicense(
      tenant_id=lic.tenant_id,
      tier="COMMUNITY",  # modified
      max_workspaces=lic.max_workspaces,
      expires_at=lic.expires_at,
      signature=lic.signature,
  )
  assert console.verify_license(tampered_lic) is False

  # 3. RBAC checks & Workspace Provisioning
  with pytest.raises(PermissionError):
    console.provision_tenant_workspace(
        "OPERATOR", "client_corp_01", "automobile_erp"
    )

  ws_path = console.provision_tenant_workspace(
      "SUPER_ADMIN", "client_corp_01", "automobile_erp"
  )
  assert ws_path.exists()

  # 4. Audit Trail Verification
  audit_file = tmp_path / "logs" / "security_audit.jsonl"
  assert audit_file.exists()
  logs = audit_file.read_text(encoding="utf-8").splitlines()
  assert len(logs) >= 2
  assert "PROVISION_WORKSPACE" in logs[-1]