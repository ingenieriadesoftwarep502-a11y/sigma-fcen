"""User aggregate (DDD section 4.1, ADR-008)."""

import uuid
from typing import Any, ClassVar

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.db.models.functions import Lower
from django.utils import timezone


class UserManager(BaseUserManager["User"]):
    def create_user(self, email: str, password: str | None = None, **extra: Any) -> "User":
        if not email:
            raise ValueError("Users must have an email address.")
        user = self.model(email=self.normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra: Any) -> "User":
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        return self.create_user(email, password, **extra)

    def get_by_natural_key(self, username: str | None) -> "User":
        # Emails are unique regardless of case (RN-001.1), so login is case-insensitive too.
        return self.get(email__iexact=username)


class Role(models.Model):
    """A set of capabilities. The four roles are seeded by migration 0003."""

    class Code(models.TextChoices):
        STUDENT = "STUDENT", "Estudiante"
        MONITOR = "MONITOR", "Monitor"
        TEACHER = "TEACHER", "Docente"
        ADMIN = "ADMIN", "Administrador"

    code = models.CharField(max_length=16, unique=True, choices=Code.choices)

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


class UserRole(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_roles")
    role = models.ForeignKey(Role, on_delete=models.PROTECT, related_name="user_roles")

    class Meta:
        constraints: ClassVar[list[models.BaseConstraint]] = [
            # RN-002: a role is assigned to a given user at most once.
            models.UniqueConstraint(fields=["user", "role"], name="accounts_userrole_unique"),
        ]

    def __str__(self) -> str:
        return f"{self.user} · {self.role}"


class AuditLog(models.Model):
    """Who did what to which account, and when (CA-HU11-5). Never stores credentials."""

    class Action(models.TextChoices):
        USER_CREATED = "USER_CREATED", "Usuario creado"
        USER_UPDATED = "USER_UPDATED", "Usuario editado"
        USER_ACTIVATED = "USER_ACTIVATED", "Usuario activado"
        USER_DEACTIVATED = "USER_DEACTIVATED", "Usuario desactivado"
        ROLES_CHANGED = "ROLES_CHANGED", "Roles modificados"

    actor = models.ForeignKey(User, on_delete=models.PROTECT, related_name="+")
    target = models.ForeignKey(User, on_delete=models.PROTECT, related_name="audit_entries")
    action = models.CharField(max_length=32, choices=Action.choices)
    # Field name -> [before, after]; for creations, the initial values.
    changes = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.created_at:%Y-%m-%d %H:%M} {self.actor} {self.action} {self.target}"
