"""Pure identity rules: institutional email (RN-001.1, RN-001.2, ADR-009) and admin retention."""

import re

import pytest

from apps.accounts.domain.rules import (
    AdminChange,
    AdminLockoutError,
    ensure_admin_remains,
    is_institutional_email,
    normalize_email,
)


@pytest.mark.parametrize(
    "email",
    ["ana.perez@unal.edu.co", "Ana.Perez@UNAL.EDU.CO"],
)
def test_rn_001_2_accepts_unal_domain(email: str) -> None:
    assert is_institutional_email(email)


@pytest.mark.parametrize(
    "email",
    [
        "ana.perez@gmail.com",
        "ana.perez@unal.edu.co.evil.com",
        "ana.perez@fakeunal.edu.co",
        "unal.edu.co@gmail.com",
        "ana.perez",
    ],
)
def test_rn_001_2_rejects_other_domains(email: str) -> None:
    assert not is_institutional_email(email)


@pytest.mark.parametrize(
    "email",
    ["ana.perez@unal.edu.co", "Ana.Perez@UNAL.edu.co", "  ANA.PEREZ@UNAL.EDU.CO "],
)
def test_rn_001_1_normalize_email_lowercases_the_whole_address(email: str) -> None:
    assert normalize_email(email) == "ana.perez@unal.edu.co"


@pytest.mark.parametrize(
    ("change", "message"),
    [
        (AdminChange.DEACTIVATE, "No puedes desactivar tu propia cuenta."),
        (AdminChange.REVOKE_ADMIN, "No puedes quitarte el rol de administrador."),
    ],
)
def test_an_admin_cannot_lock_themselves_out(change: AdminChange, message: str) -> None:
    with pytest.raises(AdminLockoutError, match=re.escape(message)):
        ensure_admin_remains(
            change=change, by_self=True, target_is_active_admin=True, other_active_admins=3
        )


@pytest.mark.parametrize("change", list(AdminChange))
def test_the_last_active_admin_is_kept(change: AdminChange) -> None:
    message = "El sistema debe conservar al menos un administrador activo."
    with pytest.raises(AdminLockoutError, match=re.escape(message)):
        ensure_admin_remains(
            change=change, by_self=False, target_is_active_admin=True, other_active_admins=0
        )


@pytest.mark.parametrize("change", list(AdminChange))
def test_changes_that_keep_an_active_admin_are_allowed(change: AdminChange) -> None:
    ensure_admin_remains(
        change=change, by_self=False, target_is_active_admin=True, other_active_admins=1
    )
    ensure_admin_remains(
        change=change, by_self=False, target_is_active_admin=False, other_active_admins=0
    )
