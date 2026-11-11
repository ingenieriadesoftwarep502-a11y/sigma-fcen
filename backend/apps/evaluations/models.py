"""Evaluation aggregate (DDD section 4.6, FASE-06): a student's rating of a session.

A group slot has one session for several students, so the evaluation belongs to the session
and its author; each author evaluates a session once (RN-007.2), guaranteed by the database.
"""

import uuid
from typing import ClassVar

from django.conf import settings
from django.db import models

from apps.evaluations.domain.rules import MAX_COMMENT_LENGTH, RATING_MAX, RATING_MIN
from apps.tutoring_sessions.models import TutoringSession

UNIQUE_SESSION_STUDENT = "evaluations_unique_session_student"


class Evaluation(models.Model):
    """The rating (1 to 5) and optional comment of a student on a session they attended.

    The author is kept to enforce uniqueness and for the student's own history; it never
    reaches the monitor (RF-062).
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(
        TutoringSession, on_delete=models.PROTECT, related_name="evaluations", db_index=False
    )
    student = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="evaluations"
    )
    rating = models.PositiveSmallIntegerField("calificación")
    comment = models.TextField("comentario", max_length=MAX_COMMENT_LENGTH, blank=True, default="")
    created_at = models.DateTimeField("creada", auto_now_add=True)

    class Meta:
        ordering: ClassVar[list[str]] = ["-created_at"]
        constraints: ClassVar[list[models.BaseConstraint]] = [
            # RN-007.2; also the index of a session's evaluations, hence the session first.
            models.UniqueConstraint(fields=["session", "student"], name=UNIQUE_SESSION_STUDENT),
            # RN-007.4, confirmed 2026-11-10.
            models.CheckConstraint(
                condition=models.Q(rating__gte=RATING_MIN) & models.Q(rating__lte=RATING_MAX),
                name="evaluations_rating_range",
            ),
        ]

    def __str__(self) -> str:
        return f"Evaluación {self.pk}"
