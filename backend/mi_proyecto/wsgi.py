"""WSGI entry point. DJANGO_ENV selects the settings module (see mi_proyecto.bootstrap)."""

from django.core.wsgi import get_wsgi_application

from mi_proyecto.bootstrap import configure_settings_module

configure_settings_module()

application = get_wsgi_application()
