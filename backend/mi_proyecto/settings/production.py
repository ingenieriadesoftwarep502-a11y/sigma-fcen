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
