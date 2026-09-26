"""ASGI entry point. DJANGO_ENV selects the settings module (see mi_proyecto.bootstrap)."""

from django.core.asgi import get_asgi_application

from mi_proyecto.bootstrap import configure_settings_module

configure_settings_module()

application = get_asgi_application()
