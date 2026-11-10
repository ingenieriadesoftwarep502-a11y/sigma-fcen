"""Routes of the tutoring-sessions context, mounted under /api/v1/."""

from django.urls import path

from apps.tutoring_sessions.views import (
    HistoryView,
    MySessionListView,
    SessionCreateView,
    SessionDetailView,
    TopicListCreateView,
)

urlpatterns = [
    path("tutoring-sessions/", SessionCreateView.as_view(), name="tutoring-session-list"),
    path("tutoring-sessions/mine/", MySessionListView.as_view(), name="tutoring-session-mine"),
    path("tutoring-sessions/history/", HistoryView.as_view(), name="tutoring-session-history"),
    path(
        "tutoring-sessions/<uuid:pk>/",
        SessionDetailView.as_view(),
        name="tutoring-session-detail",
    ),
    path("topics/", TopicListCreateView.as_view(), name="topic-list"),
]
