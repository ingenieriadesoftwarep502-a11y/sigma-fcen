"""Pure identity rules, free of Django and HTTP (DDD section 5, RN-001)."""

INSTITUTIONAL_EMAIL_DOMAIN = "unal.edu.co"


def is_institutional_email(email: str) -> bool:
    """RN-001.2: only the exact @unal.edu.co domain may register (ADR-009)."""
    _, at, domain = email.rpartition("@")
    return bool(at) and domain.lower() == INSTITUTIONAL_EMAIL_DOMAIN


def normalize_email(email: str) -> str:
    """RN-001.1: emails are compared and stored in lowercase, local part included."""
    return email.strip().lower()
