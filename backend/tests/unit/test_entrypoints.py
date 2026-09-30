"""WSGI and ASGI entry points expose a callable application (ADR-002)."""

import importlib

import pytest


@pytest.mark.parametrize("module", ["mi_proyecto.wsgi", "mi_proyecto.asgi"])
def test_server_entrypoint_exposes_callable_application(module: str) -> None:
    assert callable(importlib.import_module(module).application)
