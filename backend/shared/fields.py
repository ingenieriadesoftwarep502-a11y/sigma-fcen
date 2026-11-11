"""Serializer fields shared by every API app."""

from typing import Any, ClassVar

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers


@extend_schema_field(OpenApiTypes.BOOL)
class StrictBooleanField(serializers.Field[bool, bool, bool, Any]):
    """Accepts only "true" or "false" in any letter case; "1", "yes" or "on" are rejected."""

    CHOICES: ClassVar[dict[str, bool]] = {"true": True, "false": False}
    default_error_messages = {"invalid": "Usa true o false."}  # noqa: RUF012

    def to_internal_value(self, data: Any) -> bool:
        try:
            return self.CHOICES[str(data).strip().lower()]
        except KeyError:
            self.fail("invalid")

    def to_representation(self, value: bool) -> bool:
        return value
