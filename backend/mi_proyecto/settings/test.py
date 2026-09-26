"""Settings used by the automated test suite (pytest-django)."""

from .base import *  # noqa: F403

DEBUG = False

# Fast hashing keeps tests quick; never use this hasher outside tests.
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
