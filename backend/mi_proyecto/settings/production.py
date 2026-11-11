"""Production settings. Full hardening is scheduled for FASE-10."""

from .base import *  # noqa: F403
from .base import env

# DEBUG is never taken from the environment in production.
DEBUG = False

# Must be set explicitly; an empty host list is a misconfiguration.
ALLOWED_HOSTS = env.list("ALLOWED_HOSTS")

SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_CONTENT_TYPE_NOSNIFF = True

# Reservation emails go out through Resend's SMTP relay; both values must be set explicitly.
EMAIL_BACKEND = env.str("EMAIL_BACKEND", default="django.core.mail.backends.smtp.EmailBackend")
EMAIL_HOST_PASSWORD = env.str("RESEND_API_KEY")
DEFAULT_FROM_EMAIL = env.str("DEFAULT_FROM_EMAIL")
