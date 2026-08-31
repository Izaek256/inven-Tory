"""
Role definitions and permission helpers — server-side authority (SRS §15.2).

These roles replace the provisional frontend TODO(issue-13) stubs in:
  - apps/desktop/src/views/DashboardView.tsx   (userRole prop, isAuthorized check)
  - apps/desktop/src/views/ProductsView.tsx     (same)
  - apps/desktop/src/views/PhysicalCountAdjustmentView.tsx (elevated-permission-checkbox)

The mapping below is the server-authoritative source of truth.  Any future
endpoint can import `require_permission` and declare which permission it needs.

SRS §4 / §15 role hierarchy (highest → lowest privilege):
  GLOBAL_ADMIN > INVENTORY_MANAGER > STORE_MANAGER > STORE_CLERK > AUDITOR

SYNC is a machine account role used by the background sync worker.
"""

from __future__ import annotations

from enum import Enum


class Role(str, Enum):
    GLOBAL_ADMIN = "GLOBAL_ADMIN"
    INVENTORY_MANAGER = "INVENTORY_MANAGER"
    STORE_MANAGER = "STORE_MANAGER"
    STORE_CLERK = "STORE_CLERK"
    AUDITOR = "AUDITOR"
    SYNC = "SYNC"


class Permission(str, Enum):
    # Inventory
    INVENTORY_READ = "INVENTORY_READ"
    INVENTORY_WRITE = "INVENTORY_WRITE"
    # Adjustments require elevated sign-off (replaces provisional checkbox in Issue 11)
    ADJUSTMENT = "ADJUSTMENT"
    # Administration
    STORE_ADMIN = "STORE_ADMIN"
    PRODUCT_ADMIN = "PRODUCT_ADMIN"
    USER_ADMIN = "USER_ADMIN"
    # Reporting / audit
    GLOBAL_REPORTING = "GLOBAL_REPORTING"
    AUDIT = "AUDIT"
    # Purchase orders (Issue 14+)
    PURCHASE_ORDER = "PURCHASE_ORDER"
    # Alert management (Issue 14+)
    ALERT_ADMIN = "ALERT_ADMIN"
    # Device / store registration
    DEVICE_REGISTER = "DEVICE_REGISTER"


# ---------------------------------------------------------------------------
# Canonical grant table — every role's allowed permissions.
# ---------------------------------------------------------------------------
_ROLE_PERMISSIONS: dict[Role, frozenset[Permission]] = {
    Role.GLOBAL_ADMIN: frozenset(Permission),  # all
    Role.INVENTORY_MANAGER: frozenset(
        {
            Permission.INVENTORY_READ,
            Permission.INVENTORY_WRITE,
            Permission.ADJUSTMENT,
            Permission.STORE_ADMIN,
            Permission.PRODUCT_ADMIN,
            Permission.GLOBAL_REPORTING,
            Permission.AUDIT,
            Permission.PURCHASE_ORDER,
            Permission.ALERT_ADMIN,
            Permission.DEVICE_REGISTER,
        }
    ),
    Role.STORE_MANAGER: frozenset(
        {
            Permission.INVENTORY_READ,
            Permission.INVENTORY_WRITE,
            Permission.ADJUSTMENT,
            Permission.PRODUCT_ADMIN,
            Permission.PURCHASE_ORDER,
            Permission.DEVICE_REGISTER,
        }
    ),
    Role.STORE_CLERK: frozenset(
        {
            Permission.INVENTORY_READ,
            Permission.INVENTORY_WRITE,
        }
    ),
    Role.AUDITOR: frozenset(
        {
            Permission.INVENTORY_READ,
            Permission.GLOBAL_REPORTING,
            Permission.AUDIT,
        }
    ),
    Role.SYNC: frozenset(
        {
            Permission.INVENTORY_READ,
            Permission.INVENTORY_WRITE,
        }
    ),
}


def role_has_permission(role: Role | str, permission: Permission) -> bool:
    """Return True when *role* carries *permission*."""
    try:
        r = Role(role) if not isinstance(role, Role) else role
    except ValueError:
        return False
    return permission in _ROLE_PERMISSIONS.get(r, frozenset())


__all__ = [
    "Permission",
    "Role",
    "role_has_permission",
]
