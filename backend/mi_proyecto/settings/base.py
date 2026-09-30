"""Settings shared by every environment.

Values come from environment variables (ADR-002). The repo-root ``.env`` is loaded through
``mi_proyecto.bootstrap``; variables already set in the process environment take precedence.
"""

from datetime import timedelta
from pathlib import Path

import environ

from mi_proyecto.bootstrap import load_env_file

# backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

load_env_file()
env = environ.Env()

# --- Security -----------------------------------------------------------------------------

SECRET_KEY: str = env.str("SECRET_KEY")
DEBUG: bool = env.bool("DEBUG", default=False)
ALLOWED_HOSTS: list[str] = env.list("ALLOWED_HOSTS", default=[])

# --- Application definition ---------------------------------------------------------------

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    # Third party
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
    # Revoked refresh tokens: rotation and logout (ADR-007).
    "rest_framework_simplejwt.token_blacklist",
    # Local
    "apps.accounts",
    "apps.academics",
]

MIDDLEWARE = [
    # CorsMiddleware must run before any middleware that can build a response.
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "mi_proyecto.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "mi_proyecto.wsgi.application"

# --- Database (ADR-005: PostgreSQL only, configured through DATABASE_URL) -----------------

DATABASES = {"default": env.db("DATABASE_URL")}
# Fail fast (e.g. the health check) when the database is unreachable; the URL may override it.
DATABASES["default"]["OPTIONS"] = {"connect_timeout": 5, **DATABASES["default"].get("OPTIONS", {})}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- Authentication -----------------------------------------------------------------------

# Set in the project's first migration (ADR-008); changing it later means rebuilding the database.
AUTH_USER_MODEL = "accounts.User"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# --- Cookies --------------------------------------------------------------------------------

SESSION_COOKIE_SAMESITE = env.str("COOKIE_SAMESITE", default="Lax")
CSRF_COOKIE_SAMESITE = SESSION_COOKIE_SAMESITE
# Scripts receive the token from GET /api/v1/auth/csrf/, never from the cookie.
CSRF_COOKIE_HTTPONLY = True

# --- CORS (whitelist only) ------------------------------------------------------------------

CORS_ALLOWED_ORIGINS: list[str] = env.list("CORS_ALLOWED_ORIGINS", default=[])
# Session cookies travel cross-origin from the Next.js frontend.
CORS_ALLOW_CREDENTIALS = True
CSRF_TRUSTED_ORIGINS = CORS_ALLOWED_ORIGINS

# --- Django REST Framework ----------------------------------------------------------------

REST_FRAMEWORK = {
    # JWT in HttpOnly cookies with CSRF protection (ADR-007).
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "apps.accounts.authentication.CookieJWTAuthentication",
    ],
    # Every endpoint is private unless it explicitly opts out.
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_PAGINATION_CLASS": "shared.pagination.DefaultPagination",
    "DEFAULT_THROTTLE_CLASSES": [
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "anon": env.str("THROTTLE_RATE_ANON", default="60/minute"),
        "user": env.str("THROTTLE_RATE_USER", default="600/minute"),
        # Login, registration, refresh and logout (ScopedRateThrottle, SAD section 7).
        "auth": env.str("THROTTLE_RATE_AUTH", default="10/minute"),
    },
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
}

# --- JWT (ADR-007) ------------------------------------------------------------------------

SIMPLE_JWT = {
    # Short-lived access token; the refresh cookie renews it silently.
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=15),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=1),
    # Every refresh issues a new refresh token and revokes the previous one.
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "ALGORITHM": "HS256",
    # Tokens carry a hash of the password: changing it ends every open session.
    "CHECK_REVOKE_TOKEN": True,
}

SPECTACULAR_SETTINGS = {
    "TITLE": "SIGMA-FCEN API",
    "DESCRIPTION": "API REST del sistema de gestion de monitorias academicas de la FCEN.",
    "VERSION": "1.0.0",
    "SERVE_INCLUDE_SCHEMA": False,
}

# --- Logging --------------------------------------------------------------------------------

# Records go to stderr; never log passwords, tokens or cookies.
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {"class": "logging.StreamHandler"},
    },
    "loggers": {
        "apps": {"handlers": ["console"], "level": "INFO", "propagate": True},
    },
}

# --- Internationalization -----------------------------------------------------------------

# Validation messages reach the Spanish interface as-is (password rules, DRF errors).
LANGUAGE_CODE = "es"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static files -------------------------------------------------------------------------

STATIC_URL = "static/"
