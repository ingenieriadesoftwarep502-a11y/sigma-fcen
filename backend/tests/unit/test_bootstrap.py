"""DJANGO_ENV selects the settings module; the root .env is loaded once (ADR-002)."""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from django.core.exceptions import ImproperlyConfigured

from mi_proyecto import bootstrap
from mi_proyecto.bootstrap import configure_settings_module, load_env_file, settings_module_for


@pytest.fixture(autouse=True)
def restore_environ() -> Iterator[None]:
    """The helpers mutate os.environ and cache loaded files; restore both after each test."""
    snapshot = dict(os.environ)
    bootstrap.read_env_file_once.cache_clear()
    yield
    bootstrap.read_env_file_once.cache_clear()
    os.environ.clear()
    os.environ.update(snapshot)


@pytest.mark.parametrize(
    ("django_env", "expected"),
    [
        (None, "mi_proyecto.settings.development"),
        ("development", "mi_proyecto.settings.development"),
        ("production", "mi_proyecto.settings.production"),
        ("test", "mi_proyecto.settings.test"),
    ],
)
def test_settings_module_for_maps_django_env(django_env: str | None, expected: str) -> None:
    assert settings_module_for(django_env) == expected


@pytest.mark.parametrize("django_env", ["staging", "dev", "local", "prod"])
def test_unknown_django_env_names_the_allowed_values(django_env: str) -> None:
    with pytest.raises(ImproperlyConfigured, match="development, production, test"):
        settings_module_for(django_env)


def test_env_file_is_loaded_once_per_process(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("DJANGO_ENV=production\n", encoding="utf-8")
    monkeypatch.setenv("DJANGO_ENV_FILE", str(env_file))
    monkeypatch.delenv("DJANGO_ENV", raising=False)

    load_env_file()
    assert os.environ["DJANGO_ENV"] == "production"
    del os.environ["DJANGO_ENV"]
    load_env_file()

    assert "DJANGO_ENV" not in os.environ


def test_configure_reads_django_env_from_env_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("DJANGO_ENV=production\n", encoding="utf-8")
    monkeypatch.setenv("DJANGO_ENV_FILE", str(env_file))
    monkeypatch.delenv("DJANGO_ENV", raising=False)
    monkeypatch.delenv("DJANGO_SETTINGS_MODULE", raising=False)

    configure_settings_module()

    assert os.environ["DJANGO_SETTINGS_MODULE"] == "mi_proyecto.settings.production"


def test_configure_keeps_explicit_settings_module(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("DJANGO_ENV_FILE", str(tmp_path / "missing.env"))
    monkeypatch.setenv("DJANGO_SETTINGS_MODULE", "mi_proyecto.settings.test")
    monkeypatch.setenv("DJANGO_ENV", "not-validated-when-module-is-explicit")

    configure_settings_module()

    assert os.environ["DJANGO_SETTINGS_MODULE"] == "mi_proyecto.settings.test"
