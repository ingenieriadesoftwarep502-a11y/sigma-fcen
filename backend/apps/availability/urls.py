"""Routes of the availability context, mounted under /api/v1/."""

from django.urls import path

from apps.availability.views import (
    MonitorSlotListView,
    MonitorTemplateListView,
    SlotCreateView,
    SlotDetailView,
    SlotSearchView,
    SlotTemplateCreateView,
    SlotTemplateDetailView,
)

urlpatterns = [
    path("availability-slots/", SlotCreateView.as_view(), name="availability-slot-list"),
    path(
        "availability-slots/mine/",
        MonitorSlotListView.as_view(),
        name="availability-slot-mine",
    ),
    path(
        "availability-slots/search/",
        SlotSearchView.as_view(),
        name="availability-slot-search",
    ),
    path(
        "availability-slots/<int:pk>/",
        SlotDetailView.as_view(),
        name="availability-slot-detail",
    ),
    path("slot-templates/", SlotTemplateCreateView.as_view(), name="slot-template-list"),
    path("slot-templates/mine/", MonitorTemplateListView.as_view(), name="slot-template-mine"),
    path(
        "slot-templates/<int:pk>/",
        SlotTemplateDetailView.as_view(),
        name="slot-template-detail",
    ),
]
