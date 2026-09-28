"""Institutional email domain rule (RN-001.2, ADR-009)."""

import pytest

from apps.accounts.domain.rules import is_institutional_email


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
