"""Routes of the materials context, mounted under /api/v1/."""

from django.urls import path

from apps.materials.views import (
    MaterialDetailView,
    MaterialDownloadView,
    MaterialListCreateView,
    UploadableSubjectListView,
)

urlpatterns = [
    path("materials/", MaterialListCreateView.as_view(), name="material-list"),
    path("materials/subjects/", UploadableSubjectListView.as_view(), name="material-subjects"),
    path("materials/<uuid:pk>/", MaterialDetailView.as_view(), name="material-detail"),
    path(
        "materials/<uuid:pk>/download/",
        MaterialDownloadView.as_view(),
        name="material-download",
    ),
]
