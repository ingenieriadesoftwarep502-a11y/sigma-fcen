"""Public health endpoint (T-00.5, T-00.6 smoke test)."""

from unittest import mock

import pytest
from django.db import OperationalError
from rest_framework.test import APIClient

HEALTH_URL = "/api/v1/health/"


@pytest.mark.django_db
def test_health_returns_200_without_authentication(api_client: APIClient) -> None:
    response = api_client.get(HEALTH_URL)

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


@pytest.mark.django_db
def test_health_reports_503_when_database_is_unreachable(api_client: APIClient) -> None:
    with mock.patch(
        "mi_proyecto.health.connection.cursor",
        side_effect=OperationalError("connection refused"),
    ):
        response = api_client.get(HEALTH_URL)

    assert response.status_code == 503
    assert response.json() == {"status": "degraded", "database": "unavailable"}


def test_health_rejects_write_methods(api_client: APIClient) -> None:
    response = api_client.post(HEALTH_URL)

    assert response.status_code == 405
