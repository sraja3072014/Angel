"""tests/test_milestone5_console.py
Validates Multi-Tenant isolation, HMAC licensing, and RBAC policies.
"""

import json
from pathlib import Path
import pytest
from core.admin_console import Role, SuperAdminConsole, TenantLicense


def test_license_issuance_and_tamper_detection(tmp_path):
    console = SuperAdminConsole(base_dir=str(tmp_path))
    lic = console.issue_license("tenant_corp_alpha", tier="ENTERPRISE")

    assert console.verify_license(lic) is True

    # Tamper with tier
    lic.tier = "COMMUNITY"
    assert console.verify_license(lic) is False


def test_rbac_workspace_provisioning_and_audit(tmp_path):
    console = SuperAdminConsole(base_dir=str(tmp_path))

    # Unauthorized role must fail
    with pytest.raises(PermissionError):
        console.provision_tenant_workspace("OPERATOR", "tenant_alpha", "proj_1")

    # Authorized role must succeed
    ws_path = console.provision_tenant_workspace("SUPER_ADMIN", "tenant_alpha", "proj_1")
    assert ws_path.exists()

    # Verify audit entry was written
    audit_lines = (tmp_path / "logs" / "security_audit.jsonl").read_text().splitlines()
    assert len(audit_lines) >= 2
    assert "PROVISION_WORKSPACE" in audit_lines[-1]


def test_cross_tenant_isolation_triggers_security_alert(tmp_path):
    """Deterministic Multi-Tenancy: cross-tenant lookups trigger an immediate security alert."""
    console = SuperAdminConsole(base_dir=str(tmp_path))
    console.provision_tenant_workspace("SUPER_ADMIN", "tenant_a", "proj_core")
    console.provision_tenant_workspace("SUPER_ADMIN", "tenant_b", "proj_secret")

    # Tenant A attempting to access Tenant B's workspace directory must raise PermissionError
    with pytest.raises(PermissionError, match="Cross-tenant access violation"):
        console.resolve_tenant_workspace(
            actor_role="TENANT_ADMIN",
            requesting_tenant="tenant_a",
            target_tenant="tenant_b",
            project_id="proj_secret",
        )

    # Verify immediate security alert was written to immutable audit log
    records = console.get_audit_records(actor_role="SUPER_ADMIN")
    alert_events = [r for r in records if r["action"] == "SECURITY_ALERT"]
    assert len(alert_events) >= 1
    assert alert_events[-1]["details"]["alert_type"] == "CROSS_TENANT_ACCESS_VIOLATION"
    assert alert_events[-1]["details"]["requesting_tenant"] == "tenant_a"
    assert alert_events[-1]["details"]["target_tenant"] == "tenant_b"

    # Super Admin CAN resolve any tenant's workspace
    resolved = console.resolve_tenant_workspace(
        actor_role="SUPER_ADMIN",
        requesting_tenant="system",
        target_tenant="tenant_b",
        project_id="proj_secret",
    )
    assert resolved.exists()


def test_directory_traversal_blocked_and_audited(tmp_path):
    """Ensures directory traversal attempts in tenant or project IDs are blocked and audited."""
    console = SuperAdminConsole(base_dir=str(tmp_path))

    with pytest.raises(ValueError):
        console.provision_tenant_workspace("SUPER_ADMIN", "tenant_a", "../escaped_dir")

    # Audit log should record the illegal path attempt
    records = console.get_audit_records(actor_role="SUPER_ADMIN")
    alerts = [r for r in records if r["action"] == "SECURITY_ALERT"]
    assert len(alerts) >= 1
    assert alerts[-1]["details"]["alert_type"] == "ILLEGAL_WORKSPACE_PATH"


def test_license_entitlement_expiration_and_concurrency_guard(tmp_path):
    """Cryptographic license verification and feature guard before launching runner."""
    console = SuperAdminConsole(base_dir=str(tmp_path))

    # 1. Pro license feature entitlement
    pro_lic = console.issue_license("tenant_pro", tier="PRO", max_workspaces=5)
    assert console.check_feature_entitlement(pro_lic, "auto_repair") is True
    assert console.check_feature_entitlement(pro_lic, "multi_tenant") is False

    # 2. Enterprise license feature entitlement
    ent_lic = console.issue_license("tenant_ent", tier="ENTERPRISE", max_workspaces=50)
    assert console.check_feature_entitlement(ent_lic, "multi_tenant") is True
    assert console.check_feature_entitlement(ent_lic, "auto_repair") is True

    # 3. Concurrency budget enforcement
    # Pro tier has budget of 3 concurrent processes
    assert console.validate_runner_launch(pro_lic, active_processes=2) is True
    assert console.validate_runner_launch(pro_lic, active_processes=3) is False

    # 4. Expired license rejection
    expired_lic = console.issue_license(
        "tenant_old",
        tier="PRO",
        expires_at="2020-01-01T00:00:00Z",
    )
    assert console.is_license_active(expired_lic) is False
    assert console.validate_runner_launch(expired_lic, active_processes=0) is False


def test_rbac_token_authenticator(tmp_path):
    """Token -> Role Verification and tamper detection."""
    console = SuperAdminConsole(base_dir=str(tmp_path))

    # Generate token
    token = console.generate_auth_token("admin_user", Role.SUPER_ADMIN)
    identity = console.authenticate_token(token)
    assert identity["actor"] == "admin_user"
    assert identity["role"] == Role.SUPER_ADMIN

    # Tampered token
    tampered = token[:-4] + "abcd"
    with pytest.raises(PermissionError, match="Invalid or tampered"):
        console.authenticate_token(tampered)

    # Malformed token
    with pytest.raises(PermissionError, match="Malformed"):
        console.authenticate_token("not-a-valid-token")


def test_audit_log_scoping_and_rbac(tmp_path):
    """Audit log access is constrained by RBAC and tenant scoping."""
    console = SuperAdminConsole(base_dir=str(tmp_path))

    console.provision_tenant_workspace("SUPER_ADMIN", "tenant_alpha", "proj_1")
    console.provision_tenant_workspace("SUPER_ADMIN", "tenant_beta", "proj_2")

    # OPERATOR cannot view audit logs
    with pytest.raises(PermissionError, match="OPERATOR is not authorized"):
        console.get_audit_records("OPERATOR")

    # TENANT_ADMIN for alpha only sees alpha's records
    alpha_records = console.get_audit_records("TENANT_ADMIN", tenant_id="tenant_alpha")
    assert all("tenant_beta" not in json.dumps(r) for r in alpha_records)

    # SUPER_ADMIN sees all records
    all_records = console.get_audit_records("SUPER_ADMIN")
    assert len(all_records) >= 2


def test_security_policy_mutation_rbac(tmp_path):
    """Only SUPER_ADMIN can mutate security policies."""
    console = SuperAdminConsole(base_dir=str(tmp_path))

    # Unauthorized role rejected
    with pytest.raises(PermissionError, match="Only SUPER_ADMIN"):
        console.mutate_security_policy("TENANT_ADMIN", "max_concurrent_processes_global", 50)

    # SUPER_ADMIN succeeds
    console.mutate_security_policy("SUPER_ADMIN", "max_concurrent_processes_global", 200)
    assert console.get_security_policy("max_concurrent_processes_global") == 200


def test_structured_telemetry_and_diff_logging(tmp_path):
    """Structured audit logs capture writes, pipeline execution, and repair diffs."""
    console = SuperAdminConsole(base_dir=str(tmp_path))

    console.log_pipeline_execution(
        actor="runner_daemon",
        tenant_id="tenant_alpha",
        project_id="proj_1",
        pipeline_name="react_pipeline",
        status="SUCCESS",
        details={"duration_s": 4.2},
    )

    console.log_repair_diff(
        actor="auto_repair_engine",
        tenant_id="tenant_alpha",
        project_id="proj_1",
        file_path="src/api.py",
        diff="@@ -1,1 +1,2 @@\n+import os\n",
        repair_status="VERIFIED",
    )

    records = console.get_audit_records("SUPER_ADMIN")
    actions = [r["action"] for r in records]
    assert "PIPELINE_EXECUTION" in actions
    assert "AUTO_REPAIR_DIFF" in actions

