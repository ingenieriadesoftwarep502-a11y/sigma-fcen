"""Pure identity rules, free of Django and HTTP (DDD section 5, RN-001)."""

from enum import StrEnum

INSTITUTIONAL_EMAIL_DOMAIN = "unal.edu.co"


def is_institutional_email(email: str) -> bool:
    """RN-001.2: only the exact @unal.edu.co domain may register (ADR-009)."""
    _, at, domain = email.rpartition("@")
    return bool(at) and domain.lower() == INSTITUTIONAL_EMAIL_DOMAIN


def normalize_email(email: str) -> str:
    """RN-001.1: emails are compared and stored in lowercase, local part included."""
    return email.strip().lower()


class AdminChange(StrEnum):
    """Changes that can take away an account's ability to administer the system."""

    DEACTIVATE = "deactivate"
    REVOKE_ADMIN = "revoke_admin"


SELF_LOCKOUT_MESSAGES = {
    AdminChange.DEACTIVATE: "No puedes desactivar tu propia cuenta.",
    AdminChange.REVOKE_ADMIN: "No puedes quitarte el rol de administrador.",
}
LAST_ADMIN_MESSAGE = "El sistema debe conservar al menos un administrador activo."


class AdminLockoutError(Exception):
    """The change would lock an administrator, or everyone, out of user management."""


def ensure_admin_remains(
    *,
    change: AdminChange,
    by_self: bool,
    target_is_active_admin: bool,
    other_active_admins: int,
) -> None:
    """Every admin endpoint needs an active ADMIN and there is no other way back in.

    An administrator never deactivates or demotes themselves, and the last active
    administrator is never deactivated or demoted by anyone.
    """
    if by_self:
        raise AdminLockoutError(SELF_LOCKOUT_MESSAGES[change])
    if target_is_active_admin and other_active_admins == 0:
        raise AdminLockoutError(LAST_ADMIN_MESSAGE)
