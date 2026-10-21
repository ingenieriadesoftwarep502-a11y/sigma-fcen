"""The committed OpenAPI schema is the contract the frontend types are generated from (SAD 5.3)."""

from pathlib import Path

import pytest
from django.core.management import call_command

SCHEMA_FILE = Path(__file__).resolve().parents[2] / "schema" / "openapi.yaml"
REGENERATE = "python manage.py spectacular --validate --fail-on-warn --file schema/openapi.yaml"


@pytest.mark.django_db
def test_committed_schema_matches_the_api(tmp_path: Path) -> None:
    generated = tmp_path / "openapi.yaml"

    call_command("spectacular", "--validate", "--fail-on-warn", "--file", str(generated))

    assert generated.read_text() == SCHEMA_FILE.read_text(), f"Schema is stale. Run: {REGENERATE}"
