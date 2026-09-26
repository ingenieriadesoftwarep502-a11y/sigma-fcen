"""DJANGO_ENV selects the settings module used by manage.py, WSGI and ASGI (ADR-002)."""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from django.core.exceptions import ImproperlyConfigured

from mi_proyecto.bootstrap import configure_settings_module, settings_module_for


@pytest.fixture(autouse=True)
def restore_environ() -> Iterator[None]:
    """configure_settings_module mutates os.environ; restore it after each test."""
    snapshot = dict(os.environ)
    yield
    os.environ.clear()
    os.environ.update(snapshot)


@pytest.mark.parametrize(
    ("django_env", "expected"),
    [
        (None, "mi_proyecto.settings.development"),
        ("development", "mi_proyecto.settings.development"),
        ("dev", "mi_proyecto.settings.development"),
        ("local", "mi_proyecto.settings.development"),
        ("production", "mi_proyecto.settings.production"),
        ("PROD", "mi_proyecto.settings.production"),
        ("test", "mi_proyecto.settings.test"),
    ],
)
def test_settings_module_for_maps_django_env(django_env: str | None, expected: str) -> None:
    assert settings_module_for(django_env) == expected


def test_unknown_django_env_fails_with_clear_message() -> None:
    with pytest.raises(ImproperlyConfigured, match="DJANGO_ENV"):
        settings_module_for("staging")


def test_configure_reads_django_env_from_env_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("DJANGO_ENV=production\n", encoding="utf-8")
    monkeypatch.delenv("DJANGO_ENV", raising=False)
    monkeypatch.delenv("DJANGO_SETTINGS_MODULE", raising=False)

    configure_settings_module(env_file)

    assert os.environ["DJANGO_SETTINGS_MODULE"] == "mi_proyecto.settings.production"


def test_configure_keeps_explicit_settings_module(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "mi_proyecto.settings.test")
    monkeypatch.setenv("DJANGO_ENV", "production")

    configure_settings_module(tmp_path / "missing.env")

    assert os.environ["DJANGO_SETTINGS_MODULE"] == "mi_proyecto.settings.test"
