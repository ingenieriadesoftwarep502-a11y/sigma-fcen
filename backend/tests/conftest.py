"""Shared pytest fixtures for the backend test suite."""

from collections.abc import Iterator

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _clear_cache() -> Iterator[None]:
    # Throttle counters live in the cache; tests must not share them.
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()
