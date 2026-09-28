"""Settings shared by every environment.

Values come from environment variables (ADR-002). A repo-root ``.env`` file is loaded when
present; variables already set in the process environment take precedence over it.
"""

import os
from datetime import timedelta
from pathlib import Path

import environ

# backend/
BASE_DIR = Path(__file__).resolve().parent.parent.parent

# DJANGO_ENV_FILE lets tooling point at an alternative env file (tests use an empty one).
ENV_FILE = Path(os.environ.get("DJANGO_ENV_FILE", BASE_DIR.parent / ".env"))

env = environ.Env()
if ENV_FILE.is_file():
    environ.Env.read_env(str(ENV_FILE))

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
    "PAGE_SIZE": 20,
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

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# --- Static files -------------------------------------------------------------------------

STATIC_URL = "static/"
