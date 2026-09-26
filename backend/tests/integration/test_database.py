"""The project runs on PostgreSQL in every environment (T-00.4, RNF-OPS-001)."""

import pytest
from django.db import connection


@pytest.mark.django_db
def test_default_database_is_postgresql_and_reachable() -> None:
    assert connection.vendor == "postgresql"

    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")
        assert cursor.fetchone() == (1,)
