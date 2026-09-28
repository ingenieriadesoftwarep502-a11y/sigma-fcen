"""Identity use cases that span several models in one transaction."""

from django.db import transaction

from apps.accounts.models import Role, User, UserRole


@transaction.atomic
def register_student(*, email: str, password: str, first_name: str, last_name: str) -> User:
    """Self-registration always yields an active student and nothing else (RN-001.4, ADR-009)."""
    user = User.objects.create_user(
        email=email, password=password, first_name=first_name, last_name=last_name
    )
    UserRole.objects.create(user=user, role=Role.objects.get(code=Role.Code.STUDENT))
    return user
