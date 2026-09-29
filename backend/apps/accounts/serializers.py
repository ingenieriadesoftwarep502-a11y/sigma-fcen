"""Request and response shapes of the accounts API."""

from typing import Any, ClassVar

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.accounts.domain.rules import (
    INSTITUTIONAL_EMAIL_DOMAIN,
    is_institutional_email,
    normalize_email,
)
from apps.accounts.models import AuditLog, Role, User

DUPLICATE_EMAIL_MESSAGE = "Ya existe una cuenta con este correo."


def validate_new_email(value: str, *, current: User | None = None) -> str:
    """RN-001.1 (unique regardless of case) and RN-001.2 (@unal.edu.co only)."""
    value = normalize_email(value)
    if not is_institutional_email(value):
        raise serializers.ValidationError(
            f"Usa tu correo institucional @{INSTITUTIONAL_EMAIL_DOMAIN}."
        )
    others = User.objects.filter(email=value)
    if current is not None:
        others = others.exclude(pk=current.pk)
    if others.exists():
        raise serializers.ValidationError(DUPLICATE_EMAIL_MESSAGE)
    return value


class UserSerializer(serializers.ModelSerializer[User]):
    roles: serializers.SlugRelatedField[Role] = serializers.SlugRelatedField(
        many=True, read_only=True, slug_field="code"
    )

    class Meta:
        model = User
        fields: ClassVar[list[str]] = ["id", "email", "first_name", "last_name", "roles"]
        read_only_fields = fields


class LoginSerializer(serializers.Serializer[User]):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class RegisterSerializer(serializers.Serializer[User]):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)

    def validate_email(self, value: str) -> str:
        return validate_new_email(value)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        # Django's validators need the candidate user to detect passwords similar to its data.
        candidate = User(
            email=attrs["email"], first_name=attrs["first_name"], last_name=attrs["last_name"]
        )
        try:
            validate_password(attrs["password"], user=candidate)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)}) from error
        return attrs


class AdminUserSerializer(UserSerializer):
    class Meta(UserSerializer.Meta):
        fields: ClassVar[list[str]] = [*UserSerializer.Meta.fields, "is_active", "date_joined"]
        read_only_fields = fields


def _role_list() -> serializers.ListField:
    return serializers.ListField(
        child=serializers.ChoiceField(choices=Role.Code.choices), allow_empty=False
    )


class UserCreateSerializer(RegisterSerializer):
    """Same rules as self-registration, but the administrator chooses the roles."""

    roles = _role_list()


class UserUpdateSerializer(serializers.Serializer[User]):
    email = serializers.EmailField(required=False)
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False)
    is_active = serializers.BooleanField(required=False)

    def validate_email(self, value: str) -> str:
        return validate_new_email(value, current=self.context["user"])

    def validate_is_active(self, value: bool) -> bool:
        if not value:
            # Deactivation must go through its own endpoint, which reports the impact (CA-HU11-3).
            raise serializers.ValidationError("Para desactivar la cuenta usa /deactivate/.")
        return value


class RoleAssignmentSerializer(serializers.Serializer[User]):
    roles = _role_list()


class DeactivationRequestSerializer(serializers.Serializer[User]):
    confirm = serializers.BooleanField(default=False)


class DeactivationImpactSerializer(serializers.Serializer[dict[str, Any]]):
    future_reservations = serializers.IntegerField()


class DeactivationResultSerializer(serializers.Serializer[dict[str, Any]]):
    deactivated = serializers.BooleanField()
    impact = DeactivationImpactSerializer()
    user = AdminUserSerializer()


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


class UserFilterSerializer(serializers.Serializer[dict[str, Any]]):
    """Query parameters shared by the admin user list and its export."""

    search = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=254,
        help_text="Busca en correo, nombres, apellidos y nombre completo.",
    )
    role = serializers.ChoiceField(choices=Role.Code.choices, required=False)
    is_active = StrictBooleanField(required=False)


class UserReferenceSerializer(serializers.Serializer[User]):
    id = serializers.UUIDField()
    email = serializers.EmailField()
    full_name = serializers.SerializerMethodField()

    def get_full_name(self, user: User) -> str:
        return f"{user.first_name} {user.last_name}".strip()


class AuditEntrySerializer(serializers.Serializer[Any]):
    id = serializers.IntegerField()
    action = serializers.ChoiceField(choices=AuditLog.Action.choices)
    created_at = serializers.DateTimeField()
    actor = UserReferenceSerializer(allow_null=True)
    target = UserReferenceSerializer(allow_null=True)


class RoleCountsSerializer(serializers.Serializer[dict[str, int]]):
    STUDENT = serializers.IntegerField()
    MONITOR = serializers.IntegerField()
    TEACHER = serializers.IntegerField()
    ADMIN = serializers.IntegerField()


class UserSummarySerializer(serializers.Serializer[dict[str, Any]]):
    total = serializers.IntegerField()
    active = serializers.IntegerField()
    inactive = serializers.IntegerField()
    joined_last_30_days = serializers.IntegerField()
    by_role = RoleCountsSerializer()
    recent_activity = AuditEntrySerializer(many=True)
