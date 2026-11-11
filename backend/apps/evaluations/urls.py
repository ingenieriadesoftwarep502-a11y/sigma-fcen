"""Routes of the evaluations context, mounted under /api/v1/."""

from django.urls import path

from apps.evaluations.views import (
    EvaluationCreateView,
    MonitorRatingView,
    MyEvaluationListView,
    PendingEvaluationListView,
)

urlpatterns = [
    path("evaluations/", EvaluationCreateView.as_view(), name="evaluation-list"),
    path("evaluations/mine/", MyEvaluationListView.as_view(), name="evaluation-mine"),
    path("monitors/<uuid:pk>/rating/", MonitorRatingView.as_view(), name="monitor-rating"),
    path(
        "tutoring-sessions/pending-evaluation/",
        PendingEvaluationListView.as_view(),
        name="tutoring-session-pending-evaluation",
    ),
]
