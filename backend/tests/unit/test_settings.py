"""Security guarantees of the environment-based settings (T-00.2, RNF-SEC-001)."""

import hashlib
import importlib
import logging
import sys
from pathlib import Path
from types import ModuleType

import pytest
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

# SHA-256 digest of the SECRET_KEY that was committed to the repository before FASE-00.
# The literal key is intentionally not stored anywhere in the codebase.
COMPROMISED_SECRET_KEY_SHA256 = "413ddc8acba9b1a55d39a7d2bf364ec270f81641210f120ab3807de2dd7f1b81"

REQUIRED_ENV = {
    "SECRET_KEY": "test-only-secret-key-with-enough-length-0123456789abcdef",
    "DATABASE_URL": "postgres://user:password@localhost:5432/sigma_fcen",
    "ALLOWED_HOSTS": "api.example.org",
}


def _import_fresh(module_name: str, monkeypatch: pytest.MonkeyPatch) -> ModuleType:
    """Import a settings module from scratch without disturbing the active Django settings."""
    for name in list(sys.modules):
        if name.startswith("mi_proyecto.settings."):
            monkeypatch.delitem(sys.modules, name)
    return importlib.import_module(module_name)


@pytest.fixture
def isolated_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> pytest.MonkeyPatch:
    """Point the settings at an empty env file and provide only the required variables."""
    empty_env_file = tmp_path / "empty.env"
    empty_env_file.write_text("", encoding="utf-8")
    monkeypatch.setenv("DJANGO_ENV_FILE", str(empty_env_file))
    for key, value in REQUIRED_ENV.items():
        monkeypatch.setenv(key, value)
    return monkeypatch


def test_secret_key_is_not_the_compromised_hardcoded_key() -> None:
    digest = hashlib.sha256(settings.SECRET_KEY.encode("utf-8")).hexdigest()

    assert digest != COMPROMISED_SECRET_KEY_SHA256, (
        "SECRET_KEY still equals the key that was committed to the repository. Rotate it."
    )


def test_production_settings_force_debug_false(isolated_env: pytest.MonkeyPatch) -> None:
    isolated_env.setenv("DEBUG", "True")

    production = _import_fresh("mi_proyecto.settings.production", isolated_env)

    assert production.DEBUG is False


def test_settings_load_from_environment_without_env_file(
    isolated_env: pytest.MonkeyPatch,
) -> None:
    base = _import_fresh("mi_proyecto.settings.base", isolated_env)

    loaded_secret_key: str = base.SECRET_KEY
    assert loaded_secret_key == REQUIRED_ENV["SECRET_KEY"]
    assert base.DATABASES["default"]["ENGINE"] == "django.db.backends.postgresql"
    assert base.DATABASES["default"]["NAME"] == "sigma_fcen"


@pytest.mark.parametrize("missing_key", ["SECRET_KEY", "DATABASE_URL"])
def test_missing_required_variable_fails_with_clear_message(
    isolated_env: pytest.MonkeyPatch, missing_key: str
) -> None:
    isolated_env.delenv(missing_key)

    with pytest.raises(ImproperlyConfigured, match=missing_key):
        _import_fresh("mi_proyecto.settings.base", isolated_env)


def test_production_requires_explicit_allowed_hosts(isolated_env: pytest.MonkeyPatch) -> None:
    isolated_env.delenv("ALLOWED_HOSTS")

    with pytest.raises(ImproperlyConfigured, match="ALLOWED_HOSTS"):
        _import_fresh("mi_proyecto.settings.production", isolated_env)


def test_rnf_obs_001_application_loggers_emit_info_records() -> None:
    # Django applies settings.LOGGING at startup; without it the root level stays at WARNING.
    assert logging.getLogger("apps.accounts").isEnabledFor(logging.INFO)
