"""Root URL configuration. Every API route lives under /api/v1/ (RNF-MAN-002)."""

from django.contrib import admin
from django.urls import URLPattern, URLResolver, include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from apps.accounts.urls import auth_patterns
from mi_proyecto.health import HealthView

api_v1_patterns: list[URLPattern | URLResolver] = [
    path("health/", HealthView.as_view(), name="health"),
    path("auth/", include(auth_patterns)),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
    path("docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="docs"),
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1_patterns)),
]
