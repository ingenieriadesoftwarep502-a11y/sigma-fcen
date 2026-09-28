"""Request and response shapes of the accounts API."""

from typing import Any, ClassVar

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.accounts.domain.rules import INSTITUTIONAL_EMAIL_DOMAIN, is_institutional_email
from apps.accounts.models import Role, User

DUPLICATE_EMAIL_MESSAGE = "Ya existe una cuenta con este correo."


def validate_new_email(value: str, *, current: User | None = None) -> str:
    """RN-001.1 (unique regardless of case) and RN-001.2 (@unal.edu.co only)."""
    if not is_institutional_email(value):
        raise serializers.ValidationError(
            f"Usa tu correo institucional @{INSTITUTIONAL_EMAIL_DOMAIN}."
        )
    others = User.objects.filter(email__iexact=value)
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
