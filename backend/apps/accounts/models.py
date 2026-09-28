"""User aggregate (DDD section 4.1, ADR-008)."""

import uuid
from typing import Any, ClassVar, NoReturn, TypeAlias

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models, transaction
from django.db.models.functions import Lower
from django.utils import timezone

from apps.accounts.domain.rules import normalize_email

ACCOUNT_DELETION_MESSAGE = "Las cuentas no se eliminan; solo se desactivan."


class AccountDeletionError(Exception):
    """RF-025: accounts are never physically deleted, only deactivated."""

    def __init__(self) -> None:
        super().__init__(ACCOUNT_DELETION_MESSAGE)


class UserQuerySet(models.QuerySet["User"]):
    def delete(self) -> NoReturn:
        raise AccountDeletionError


class UserManager(BaseUserManager["User"]):
    def get_queryset(self) -> UserQuerySet:
        return UserQuerySet(self.model, using=self._db)

    @classmethod
    def normalize_email(cls, email: str | None) -> str:
        # Django only lowercases the domain; RN-001.1 makes the whole address case-insensitive.
        return normalize_email(email or "")

    def create_user(self, email: str, password: str | None = None, **extra: Any) -> "User":
        if not email:
            raise ValueError("Users must have an email address.")
        user = self.model(email=self.normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra: Any) -> "User":
        """A superuser is also a business administrator, or IsAdmin would deny it (ADR-008)."""
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        for flag in ("is_staff", "is_superuser"):
            if extra[flag] is not True:
                raise ValueError(f"Superuser must have {flag}=True.")
        with transaction.atomic(using=self._db):
            user = self.create_user(email, password, **extra)
            admin_role = Role.objects.using(self._db).get(code=Role.Code.ADMIN)
            UserRole.objects.using(self._db).create(user=user, role=admin_role)
        return user

    def get_by_natural_key(self, username: str | None) -> "User":
        # Stored emails are lowercase (RN-001.1): an exact match keeps login case-insensitive
        # while still using the unique index.
        return self.get(email=self.normalize_email(username))


class RoleCode(models.TextChoices):
    STUDENT = "STUDENT", "Estudiante"
    MONITOR = "MONITOR", "Monitor"
    TEACHER = "TEACHER", "Docente"
    ADMIN = "ADMIN", "Administrador"


class Role(models.Model):
    """A set of capabilities. The four roles are seeded by migration 0003."""

    # Module-level so Meta can reference it; Role.Code stays the public name.
    Code: TypeAlias = RoleCode

    code = models.CharField(max_length=16, unique=True, choices=Code.choices)

    class Meta:
        constraints: ClassVar[list[models.BaseConstraint]] = [
            # Permissions compare against these codes: the catalog cannot drift from Role.Code.
            models.CheckConstraint(
                condition=models.Q(code__in=RoleCode.values), name="accounts_role_code_valid"
            ),
        ]

    def __str__(self) -> str:
        return self.get_code_display()


class User(AbstractBaseUser, PermissionsMixin):
    """A person with access to the system, identified by institutional email."""

    # UUID instead of a sequential integer: does not reveal volume nor allow enumeration.
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    first_name = models.CharField(max_length=150, blank=True)
    last_name = models.CharField(max_length=150, blank=True)
    # Accounts are never deleted, only deactivated (RF-025).
    is_active = models.BooleanField(default=True)
    # Django admin site access; business roles live in UserRole (ADR-008).
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(default=timezone.now)
    # A user may hold several roles at once, e.g. student and monitor (ADR-008).
    roles = models.ManyToManyField(Role, through="UserRole", related_name="users", blank=True)

    objects: ClassVar[UserManager] = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS: ClassVar[list[str]] = []

    class Meta:
        constraints: ClassVar[list[models.BaseConstraint]] = [
            # RN-001.1: the email is unique regardless of letter case.
            models.UniqueConstraint(Lower("email"), name="accounts_user_email_ci_unique"),
        ]

    def __str__(self) -> str:
        return self.email

    def has_role(self, code: str) -> bool:
        return self.roles.filter(code=code).exists()

    def delete(self, *args: Any, **kwargs: Any) -> NoReturn:
        raise AccountDeletionError


class UserRole(models.Model):
    # PROTECT backs RF-025 at the ORM level; the unique (user, role) index covers lookups by user.
    user = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="user_roles", db_index=False
    )
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="user_roles")

    class Meta:
        constraints: ClassVar[list[models.BaseConstraint]] = [
            # RN-002: a role is assigned to a given user at most once.
            models.UniqueConstraint(fields=["user", "role"], name="accounts_userrole_unique"),
        ]

    def __str__(self) -> str:
        return f"{self.user} · {self.role}"


AUDIT_LOG_IMMUTABLE_MESSAGE = "El registro de auditoría no se modifica ni se elimina."


class AuditLogImmutableError(Exception):
    """SAD D-6: audit entries are append-only."""

    def __init__(self) -> None:
        super().__init__(AUDIT_LOG_IMMUTABLE_MESSAGE)


class AuditLogQuerySet(models.QuerySet["AuditLog"]):
    """Only inserts and reads; migration 0006 enforces the same rule in the database."""

    def update(self, **kwargs: Any) -> NoReturn:
        raise AuditLogImmutableError

    def delete(self) -> NoReturn:
        raise AuditLogImmutableError


class AuditAction(models.TextChoices):
    USER_CREATED = "USER_CREATED", "Usuario creado"
    USER_UPDATED = "USER_UPDATED", "Usuario editado"
    USER_ACTIVATED = "USER_ACTIVATED", "Usuario activado"
    USER_DEACTIVATED = "USER_DEACTIVATED", "Usuario desactivado"
    ROLES_CHANGED = "ROLES_CHANGED", "Roles modificados"


class AuditLog(models.Model):
    """Who did what to which account, and when (CA-HU11-5). Never stores credentials."""

    # Module-level so Meta can reference it; AuditLog.Action stays the public name.
    Action: TypeAlias = AuditAction

    actor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    # Indexed by the (target, -created_at) composite index below.
    target = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="audit_entries", db_index=False
    )
    action = models.CharField(max_length=32, choices=Action.choices)
    # Always field name -> [before, after]; a creation has None (or []) as "before".
    changes = models.JSONField(default=dict)
    # Facts about the operation that are not field changes, e.g. a deactivation's impact.
    context = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = AuditLogQuerySet.as_manager()

    class Meta:
        ordering: ClassVar[list[str]] = ["-created_at"]
        indexes: ClassVar[list[models.Index]] = [
            # One user's history, newest first (CA-HU11-5).
            models.Index(fields=["target", "-created_at"], name="accounts_audit_target_created"),
            # The global feed, newest first.
            models.Index(fields=["-created_at"], name="accounts_audit_created"),
        ]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            models.CheckConstraint(
                condition=models.Q(action__in=AuditAction.values),
                name="accounts_auditlog_action_valid",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.actor} {self.action} {self.target}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        if not self._state.adding:
            raise AuditLogImmutableError
        super().save(*args, **kwargs)

    def delete(self, *args: Any, **kwargs: Any) -> NoReturn:
        raise AuditLogImmutableError
