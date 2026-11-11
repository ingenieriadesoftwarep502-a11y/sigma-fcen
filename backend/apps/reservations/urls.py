"""Routes of the reservations context, mounted under /api/v1/."""

from django.urls import path

from apps.reservations.views import (
    MyReservationListView,
    ReservationCancelView,
    ReservationCreateView,
    ReservationDetailView,
)

urlpatterns = [
    path("reservations/", ReservationCreateView.as_view(), name="reservation-list"),
    path("reservations/mine/", MyReservationListView.as_view(), name="reservation-mine"),
    path("reservations/<uuid:pk>/", ReservationDetailView.as_view(), name="reservation-detail"),
    path(
        "reservations/<uuid:pk>/cancel/",
        ReservationCancelView.as_view(),
        name="reservation-cancel",
    ),
]
