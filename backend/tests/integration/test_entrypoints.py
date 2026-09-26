"""manage.py, WSGI and ASGI pick their settings module from DJANGO_ENV (ADR-002)."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]


def _run(code_or_args: list[str], django_env: str) -> subprocess.CompletedProcess[str]:
    env = {k: v for k, v in os.environ.items() if k != "DJANGO_SETTINGS_MODULE"}
    env["DJANGO_ENV"] = django_env
    return subprocess.run(  # noqa: S603 - fixed interpreter and arguments
        [sys.executable, *code_or_args],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def test_manage_py_uses_settings_selected_by_django_env() -> None:
    result = _run(
        [
            "manage.py",
            "shell",
            "--verbosity",
            "0",
            "-c",
            "from django.conf import settings; print(settings.SETTINGS_MODULE)",
        ],
        django_env="test",
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "mi_proyecto.settings.test"


@pytest.mark.parametrize("module", ["mi_proyecto.wsgi", "mi_proyecto.asgi"])
def test_server_entrypoints_use_settings_selected_by_django_env(module: str) -> None:
    code = (
        f"import os, {module} as m; "
        "assert callable(m.application); "
        "print(os.environ['DJANGO_SETTINGS_MODULE'])"
    )

    result = _run(["-c", code], django_env="test")

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "mi_proyecto.settings.test"
