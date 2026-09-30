"""Routes of the academic catalog, mounted under /api/v1/."""

from django.urls import path

from apps.academics.views import (
    AcademicTermListCreateView,
    CatalogSummaryView,
    CourseDetailView,
    CourseListCreateView,
    CurrentTermView,
    DepartmentDetailView,
    DepartmentListCreateView,
    MonitorAssignmentDetailView,
    MonitorAssignmentListCreateView,
    MonitorOwnAssignmentListView,
    SubjectDetailView,
    SubjectListCreateView,
    TeacherCourseListView,
)

urlpatterns = [
    path("departments/", DepartmentListCreateView.as_view(), name="department-list"),
    path("departments/<int:pk>/", DepartmentDetailView.as_view(), name="department-detail"),
    path("subjects/", SubjectListCreateView.as_view(), name="subject-list"),
    path("subjects/<int:pk>/", SubjectDetailView.as_view(), name="subject-detail"),
    path("terms/", AcademicTermListCreateView.as_view(), name="term-list"),
    path("terms/current/", CurrentTermView.as_view(), name="term-current"),
    path("courses/", CourseListCreateView.as_view(), name="course-list"),
    path("courses/mine/", TeacherCourseListView.as_view(), name="course-mine"),
    path("courses/<int:pk>/", CourseDetailView.as_view(), name="course-detail"),
    path(
        "monitor-assignments/",
        MonitorAssignmentListCreateView.as_view(),
        name="monitor-assignment-list",
    ),
    path(
        "monitor-assignments/mine/",
        MonitorOwnAssignmentListView.as_view(),
        name="monitor-assignment-mine",
    ),
    path(
        "monitor-assignments/<int:pk>/",
        MonitorAssignmentDetailView.as_view(),
        name="monitor-assignment-detail",
    ),
    path("catalog/summary/", CatalogSummaryView.as_view(), name="catalog-summary"),
]
