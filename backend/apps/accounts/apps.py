"""Identity and access bounded context (DDD section 3)."""

from django.apps import AppConfig


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"

    def ready(self) -> None:
        # Registers the OpenAPI extension that documents the cookie authentication.
        from apps.accounts import authentication  # noqa: F401
