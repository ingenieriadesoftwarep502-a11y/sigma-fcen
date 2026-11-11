"""Routes of the teacher's follow-up (FASE-08), mounted under /api/v1/teaching/."""

from django.urls import path

from apps.analytics.views import (
    FrequentTopicListView,
    TeachingCourseDetailView,
    TeachingCourseListView,
    TeachingMonitorListView,
    TeachingSessionListView,
    TeachingStudentListView,
)

urlpatterns = [
    path("courses/", TeachingCourseListView.as_view(), name="teaching-course-list"),
    path("courses/<int:pk>/", TeachingCourseDetailView.as_view(), name="teaching-course-detail"),
    path("monitors/", TeachingMonitorListView.as_view(), name="teaching-monitor-list"),
    path("sessions/", TeachingSessionListView.as_view(), name="teaching-session-list"),
    path("students/", TeachingStudentListView.as_view(), name="teaching-student-list"),
    path("frequent-topics/", FrequentTopicListView.as_view(), name="teaching-frequent-topic-list"),
]
