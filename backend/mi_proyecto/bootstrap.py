"""Loads the repo-root .env and chooses the settings module from DJANGO_ENV (ADR-002).

This is the only place that knows where the env file lives. Entry points (manage.py, WSGI,
ASGI) and ``settings/base.py`` all go through ``load_env_file``.
"""

import os
from functools import cache
from pathlib import Path

import environ
from django.core.exceptions import ImproperlyConfigured

DEFAULT_ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"

_ALLOWED_ENVS = ("development", "production", "test")


def env_file_path() -> Path:
    """Return the env file path; DJANGO_ENV_FILE overrides the repo-root .env."""
    return Path(os.environ.get("DJANGO_ENV_FILE", DEFAULT_ENV_FILE))


@cache
def read_env_file_once(env_file: Path) -> None:
    """Read ``env_file`` into os.environ once per process; existing variables win."""
    if env_file.is_file():
        environ.Env.read_env(str(env_file))


def load_env_file() -> None:
    """Load the configured env file (idempotent)."""
    read_env_file_once(env_file_path())


def settings_module_for(django_env: str | None) -> str:
    """Return the dotted settings module for a DJANGO_ENV value (default: development)."""
    key = (django_env or "development").strip().lower()
    if key not in _ALLOWED_ENVS:
        raise ImproperlyConfigured(
            f"Unknown DJANGO_ENV value {django_env!r}. Allowed values: {', '.join(_ALLOWED_ENVS)}."
        )
    return f"mi_proyecto.settings.{key}"


def configure_settings_module() -> None:
    """Set DJANGO_SETTINGS_MODULE from DJANGO_ENV unless it is already set explicitly."""
    load_env_file()
    if "DJANGO_SETTINGS_MODULE" not in os.environ:
        os.environ["DJANGO_SETTINGS_MODULE"] = settings_module_for(os.environ.get("DJANGO_ENV"))
