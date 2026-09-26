"""Endpoints are private unless they explicitly opt out (T-00.5, RNF-SEC-003).

With SessionAuthentication DRF answers 403 (not 401) to anonymous requests, because the
scheme has no WWW-Authenticate challenge. The 401 status depends on ADR-007.
"""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

PROTECTED_URL = "/test-only/protected/"


@pytest.mark.urls("tests.api.protected_urls")
def test_endpoint_without_explicit_permissions_rejects_anonymous(api_client: APIClient) -> None:
    response = api_client.get(PROTECTED_URL)

    assert response.status_code == 403


@pytest.mark.django_db
@pytest.mark.urls("tests.api.protected_urls")
def test_endpoint_without_explicit_permissions_allows_authenticated(
    api_client: APIClient,
) -> None:
    user = get_user_model().objects.create_user(username="probe", password="probe-pass-123")
    api_client.force_authenticate(user=user)

    response = api_client.get(PROTECTED_URL)

    assert response.status_code == 200
