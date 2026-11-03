"""core/admin_console.py
Milestone 5: Multi-Tenant Management and Governance Console.
"""

from __future__ import annotations

import base64
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import hashlib
import hmac
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from core.path_policy import PathPolicy, WorkspacePathError


class Role:
    SUPER_ADMIN = "SUPER_ADMIN"
    TENANT_ADMIN = "TENANT_ADMIN"
    OPERATOR = "OPERATOR"


ROLE_PERMISSIONS: Dict[str, set[str]] = {
    Role.SUPER_ADMIN: {
        "workspace_lifecycle",
        "license_issuance",
        "security_policy_mutation",
        "provision_workspace",
        "pipeline_trigger",
        "view_audit",
        "view_telemetry",
        "read_logs",
    },
    Role.TENANT_ADMIN: {
        "provision_workspace",
        "pipeline_trigger",
        "view_audit",
        "view_telemetry",
        "read_logs",
    },
    Role.OPERATOR: {
        "view_telemetry",
        "read_logs",
    },
}

TIER_PROFILES: Dict[str, Dict[str, Any]] = {
    "COMMUNITY": {
        "max_workspaces": 1,
        "concurrent_process_budget": 1,
        "features": ["pipeline_run", "telemetry"],
    },
    "PRO": {
        "max_workspaces": 5,
        "concurrent_process_budget": 3,
        "features": ["pipeline_run", "telemetry", "auto_repair", "custom_tools"],
    },
    "ENTERPRISE": {
        "max_workspaces": 50,
        "concurrent_process_budget": 10,
        "features": [
            "pipeline_run",
            "telemetry",
            "auto_repair",
            "custom_tools",
            "multi_tenant",
            "audit_export",
            "sla_support",
            "security_policy_mutation",
        ],
    },
}


@dataclass
class TenantLicense:
    tenant_id: str
    tier: str
    max_workspaces: int
    expires_at: str
    signature: str
    concurrent_process_budget: int = 2
    feature_flags: List[str] = field(default_factory=list)


class SuperAdminConsole:
    SECRET_KEY = b"angel_platform_super_secret_master_key_2026"

    def __init__(self, base_dir: str = "."):
        self.base_dir = Path(base_dir).resolve()
        self.workspaces_root = self.base_dir / "workspaces"
        self.workspaces_root.mkdir(parents=True, exist_ok=True)
        self.audit_log_path = self.base_dir / "logs" / "security_audit.jsonl"
        self.audit_log_path.parent.mkdir(parents=True, exist_ok=True)
        self._security_policies: Dict[str, Any] = {
            "strict_tenant_isolation": True,
            "require_signed_license": True,
            "max_concurrent_processes_global": 100,
        }

    # =========================================================================
    # RBAC Authenticator (Token -> Role Verification)
    # =========================================================================

    def generate_auth_token(
        self,
        actor: str,
        role: str,
        tenant_id: Optional[str] = None,
    ) -> str:
        """Generates an HMAC-signed authentication token."""
        if role not in ROLE_PERMISSIONS:
            raise ValueError(f"Unknown role: {role}")
        payload_dict = {
            "actor": actor,
            "role": role,
            "tenant_id": tenant_id or "",
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        payload_bytes = json.dumps(payload_dict, sort_keys=True).encode("utf-8")
        signature = hmac.new(self.SECRET_KEY, payload_bytes, hashlib.sha256).hexdigest()
        encoded_payload = base64.urlsafe_b64encode(payload_bytes).decode("utf-8")
        return f"{encoded_payload}.{signature}"

    def authenticate_token(self, token: str) -> Dict[str, Any]:
        """Validates token signature and returns identity & role."""
        try:
            encoded_payload, signature = token.split(".", 1)
            payload_bytes = base64.urlsafe_b64decode(encoded_payload.encode("utf-8"))
            expected = hmac.new(self.SECRET_KEY, payload_bytes, hashlib.sha256).hexdigest()
            if not hmac.compare_digest(expected, signature):
                self.log_audit("UNKNOWN", "SECURITY_ALERT", {
                    "alert_type": "TAMPERED_AUTH_TOKEN",
                    "details": "Token HMAC signature verification failed",
                })
                raise PermissionError("Invalid or tampered authentication token.")
            payload: Dict[str, Any] = json.loads(payload_bytes.decode("utf-8"))
            return payload
        except Exception as exc:
            if not isinstance(exc, PermissionError):
                self.log_audit("UNKNOWN", "SECURITY_ALERT", {
                    "alert_type": "MALFORMED_AUTH_TOKEN",
                    "error": str(exc),
                })
                raise PermissionError(f"Malformed authentication token: {exc}") from exc
            raise

    def check_permission(self, role: str, permission: str) -> bool:
        """Checks if a given role possesses a specific permission."""
        permissions = ROLE_PERMISSIONS.get(role, set())
        return permission in permissions

    def enforce_permission(self, actor_role: str, permission: str, tenant_id: Optional[str] = None) -> None:
        """Enforces role permission check, logging audit and raising on failure."""
        if not self.check_permission(actor_role, permission):
            self.log_audit(actor_role, "ACCESS_DENIED", {
                "required_permission": permission,
                "tenant_id": tenant_id,
                "reason": f"Role '{actor_role}' lacks permission '{permission}'.",
            })
            raise PermissionError(f"Role '{actor_role}' is not authorized for '{permission}'.")

    # =========================================================================
    # License Engine (HMAC Signature Check & Feature Guard)
    # =========================================================================

    def issue_license(
        self,
        tenant_id: str,
        tier: str = "PRO",
        max_workspaces: int = 5,
        expires_at: Optional[str] = None,
        concurrent_process_budget: Optional[int] = None,
        feature_flags: Optional[List[str]] = None,
    ) -> TenantLicense:
        """Issues an HMAC-signed license."""
        if expires_at is None:
            expires_at = "2027-12-31T23:59:59Z"

        profile = TIER_PROFILES.get(tier.upper(), TIER_PROFILES["PRO"])
        if concurrent_process_budget is None:
            concurrent_process_budget = profile["concurrent_process_budget"]
        if feature_flags is None:
            feature_flags = list(profile["features"])

        payload = f"{tenant_id}:{tier}:{max_workspaces}:{expires_at}"
        signature = hmac.new(self.SECRET_KEY, payload.encode(), hashlib.sha256).hexdigest()

        license_obj = TenantLicense(
            tenant_id=tenant_id,
            tier=tier,
            max_workspaces=max_workspaces,
            expires_at=expires_at,
            signature=signature,
            concurrent_process_budget=concurrent_process_budget,
            feature_flags=feature_flags,
        )
        self.log_audit("SUPER_ADMIN", "ISSUE_LICENSE", {"tenant_id": tenant_id, "tier": tier})
        return license_obj

    def verify_license(self, license_data: TenantLicense) -> bool:
        """Validates license integrity and cryptographic signature."""
        payload = f"{license_data.tenant_id}:{license_data.tier}:{license_data.max_workspaces}:{license_data.expires_at}"
        expected = hmac.new(self.SECRET_KEY, payload.encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, license_data.signature)

    def is_license_active(self, license_data: TenantLicense) -> bool:
        """Checks cryptographic signature and expiration timestamp."""
        if not self.verify_license(license_data):
            return False
        try:
            exp_str = license_data.expires_at.replace("Z", "+00:00")
            exp_dt = datetime.fromisoformat(exp_str)
            if datetime.now(timezone.utc) > exp_dt:
                return False
        except Exception:
            return False
        return True

    def check_feature_entitlement(self, license_data: TenantLicense, feature: str) -> bool:
        """Validates whether a tenant is entitled to run a specific feature."""
        if not self.is_license_active(license_data):
            return False
        allowed_features = set(license_data.feature_flags)
        profile_features = TIER_PROFILES.get(license_data.tier.upper(), {}).get("features", [])
        allowed_features.update(profile_features)
        return feature in allowed_features

    def validate_runner_launch(
        self,
        license_data: TenantLicense,
        active_processes: int = 0,
        requested_feature: Optional[str] = None,
    ) -> bool:
        """Validates license, process concurrency limits, and feature flags before runner launch."""
        if not self.is_license_active(license_data):
            self.log_audit(license_data.tenant_id, "RUNNER_LAUNCH_DENIED", {
                "reason": "License signature invalid or expired",
            })
            return False

        if active_processes >= license_data.concurrent_process_budget:
            self.log_audit(license_data.tenant_id, "RUNNER_LAUNCH_DENIED", {
                "reason": f"Concurrent process budget ({license_data.concurrent_process_budget}) exceeded",
                "active_processes": active_processes,
            })
            return False

        if requested_feature and not self.check_feature_entitlement(license_data, requested_feature):
            self.log_audit(license_data.tenant_id, "RUNNER_LAUNCH_DENIED", {
                "reason": f"Feature '{requested_feature}' not entitled under tier '{license_data.tier}'",
            })
            return False

        return True

    # =========================================================================
    # Workspace Tenant Isolation Router (workspaces/{tenant}/{project})
    # =========================================================================

    def provision_tenant_workspace(self, actor_role: str, tenant_id: str, project_id: str) -> Path:
        """Provisions an isolated directory with boundary checks."""
        if actor_role not in ("SUPER_ADMIN", "TENANT_ADMIN"):
            self.log_audit(actor_role, "ACCESS_DENIED", {
                "action": "PROVISION_WORKSPACE",
                "tenant_id": tenant_id,
                "project_id": project_id,
                "reason": f"Role '{actor_role}' is not authorized to provision workspaces.",
            })
            raise PermissionError(f"Role '{actor_role}' is not authorized to provision workspaces.")

        tenant_dir = self.workspaces_root / tenant_id / project_id
        policy = PathPolicy(self.workspaces_root)
        try:
            safe_path = policy.resolve(str(Path(tenant_id) / project_id))
        except Exception as err:
            self.log_audit(actor_role, "SECURITY_ALERT", {
                "alert_type": "ILLEGAL_WORKSPACE_PATH",
                "tenant_id": tenant_id,
                "project_id": project_id,
                "error": str(err),
            })
            raise

        safe_path.mkdir(parents=True, exist_ok=True)
        self.log_audit(actor_role, "PROVISION_WORKSPACE", {"path": str(safe_path)})
        return safe_path

    def resolve_tenant_workspace(
        self,
        actor_role: str,
        requesting_tenant: str,
        target_tenant: str,
        project_id: str,
    ) -> Path:
        """Resolves workspace path with strict cross-tenant access alert enforcement."""
        # Non-super-admins cannot access directories belonging to another tenant
        if actor_role != Role.SUPER_ADMIN and requesting_tenant != target_tenant:
            self.log_audit(actor_role, "SECURITY_ALERT", {
                "alert_type": "CROSS_TENANT_ACCESS_VIOLATION",
                "requesting_tenant": requesting_tenant,
                "target_tenant": target_tenant,
                "project_id": project_id,
            })
            raise PermissionError(
                f"Cross-tenant access violation: tenant '{requesting_tenant}' is not permitted "
                f"to access workspace for '{target_tenant}'."
            )

        policy = PathPolicy(self.workspaces_root)
        try:
            safe_path = policy.resolve(str(Path(target_tenant) / project_id))
        except Exception as err:
            self.log_audit(actor_role, "SECURITY_ALERT", {
                "alert_type": "DIRECTORY_TRAVERSAL_ATTEMPT",
                "tenant_id": target_tenant,
                "project_id": project_id,
                "error": str(err),
            })
            raise

        return safe_path

    def list_tenant_workspaces(self, actor_role: str, tenant_id: str) -> List[str]:
        """Lists projects under a tenant workspace root."""
        if actor_role == Role.OPERATOR:
            self.log_audit(actor_role, "ACCESS_DENIED", {
                "action": "LIST_WORKSPACES",
                "tenant_id": tenant_id,
            })
            raise PermissionError("Role 'OPERATOR' is not authorized to list workspaces.")

        tenant_root = self.workspaces_root / tenant_id
        if not tenant_root.is_dir():
            return []
        return sorted([d.name for d in tenant_root.iterdir() if d.is_dir()])

    # =========================================================================
    # Security Policy Mutation (SUPER_ADMIN Only)
    # =========================================================================

    def mutate_security_policy(self, actor_role: str, policy_name: str, value: Any) -> None:
        """Mutates global security policies."""
        if actor_role != Role.SUPER_ADMIN:
            self.log_audit(actor_role, "ACCESS_DENIED", {
                "action": "MUTATE_SECURITY_POLICY",
                "policy_name": policy_name,
            })
            raise PermissionError("Only SUPER_ADMIN can mutate security policies.")

        self._security_policies[policy_name] = value
        self.log_audit("SUPER_ADMIN", "MUTATE_SECURITY_POLICY", {
            "policy_name": policy_name,
            "new_value": value,
        })

    def get_security_policy(self, policy_name: str) -> Any:
        return self._security_policies.get(policy_name)

    # =========================================================================
    # Structured Immutable Audit Trail (logs/security_audit.jsonl)
    # =========================================================================

    def log_audit(self, actor: str, action: str, details: Dict[str, Any]) -> None:
        """Appends immutable audit record to JSONL store."""
        entry = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "actor": actor,
            "action": action,
            "details": details,
        }
        with open(self.audit_log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry) + "\n")

    def get_audit_records(
        self,
        actor_role: str,
        tenant_id: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """Queries structured audit log enforcing RBAC and tenant scoping."""
        if actor_role == Role.OPERATOR:
            self.log_audit(actor_role, "ACCESS_DENIED", {
                "action": "VIEW_AUDIT",
                "reason": "OPERATOR is not authorized to view audit logs.",
            })
            raise PermissionError("OPERATOR is not authorized to view audit records.")

        records: List[Dict[str, Any]] = []
        if not self.audit_log_path.exists():
            return records

        with open(self.audit_log_path, "r", encoding="utf-8") as f:
            for line in f:
                line_str = line.strip()
                if not line_str:
                    continue
                try:
                    record = json.loads(line_str)
                    details = record.get("details", {})
                    rec_tenant = details.get("tenant_id") or details.get("requesting_tenant") or record.get("actor")

                    # Scoping rules: TENANT_ADMIN only sees their tenant's logs
                    if actor_role == Role.TENANT_ADMIN:
                        if tenant_id and rec_tenant != tenant_id:
                            continue

                    # SUPER_ADMIN filter if tenant_id explicitly specified
                    elif actor_role == Role.SUPER_ADMIN and tenant_id:
                        if rec_tenant != tenant_id:
                            continue

                    records.append(record)
                except json.JSONDecodeError:
                    continue

        if limit is not None and limit > 0:
            return records[-limit:]
        return records

    def log_pipeline_execution(
        self,
        actor: str,
        tenant_id: str,
        project_id: str,
        pipeline_name: str,
        status: str,
        details: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Appends structured pipeline execution telemetry to audit log."""
        payload = {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "pipeline": pipeline_name,
            "status": status,
        }
        if details:
            payload["details"] = details
        self.log_audit(actor, "PIPELINE_EXECUTION", payload)

    def log_repair_diff(
        self,
        actor: str,
        tenant_id: str,
        project_id: str,
        file_path: str,
        diff: str,
        repair_status: str,
    ) -> None:
        """Appends auto-repair diff and outcome to audit log."""
        self.log_audit(actor, "AUTO_REPAIR_DIFF", {
            "tenant_id": tenant_id,
            "project_id": project_id,
            "file_path": file_path,
            "diff": diff,
            "repair_status": repair_status,
        })

