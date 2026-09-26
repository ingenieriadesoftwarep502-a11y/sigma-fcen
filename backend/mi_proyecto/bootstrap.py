"""Chooses the settings module from DJANGO_ENV before Django starts (ADR-002)."""

import os
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

DEFAULT_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"

_SETTINGS_BY_ENV = {
    "development": "development",
    "dev": "development",
    "local": "development",
    "production": "production",
    "prod": "production",
    "test": "test",
}


def settings_module_for(django_env: str | None) -> str:
    """Return the dotted settings module for a DJANGO_ENV value (default: development)."""
    key = (django_env or "development").strip().lower()
    try:
        return f"mi_proyecto.settings.{_SETTINGS_BY_ENV[key]}"
    except KeyError:
        allowed = ", ".join(sorted(_SETTINGS_BY_ENV))
        raise ImproperlyConfigured(
            f"Unknown DJANGO_ENV value {django_env!r}. Allowed values: {allowed}."
        ) from None


def configure_settings_module(env_file: Path = DEFAULT_ENV_FILE) -> None:
    """Set DJANGO_SETTINGS_MODULE from DJANGO_ENV unless it is already set explicitly."""
    if env_file.is_file():
        environ.Env.read_env(str(env_file))
    os.environ.setdefault(
        "DJANGO_SETTINGS_MODULE", settings_module_for(os.environ.get("DJANGO_ENV"))
    )
