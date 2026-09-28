"""Endpoints are private unless they explicitly opt out (T-00.5, RNF-SEC-003).

The JWT cookie authentication of ADR-007 sends a WWW-Authenticate challenge, so DRF answers
401 (not 403) to anonymous requests.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

PROTECTED_URL = "/test-only/protected/"


@pytest.mark.urls("tests.api.protected_urls")
def test_endpoint_without_explicit_permissions_rejects_anonymous(api_client: APIClient) -> None:
    response = api_client.get(PROTECTED_URL)

    assert response.status_code == 401


@pytest.mark.django_db
@pytest.mark.urls("tests.api.protected_urls")
def test_endpoint_without_explicit_permissions_allows_authenticated(
    api_client: APIClient,
) -> None:
    user = get_user_model().objects.create_user(
        email="probe@unal.edu.co", password="probe-pass-123"
    )
    api_client.force_authenticate(user=user)

    response = api_client.get(PROTECTED_URL)

    assert response.status_code == 200
