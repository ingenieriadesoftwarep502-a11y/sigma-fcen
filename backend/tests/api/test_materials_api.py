"""Materials HTTP API (FASE-07 §4): upload, list, download and remove study material.

CA-HU08-1 to CA-HU08-5, RN-008, ADR-012, SAD §6.3 error format.
"""

from datetime import timedelta
from pathlib import Path
from typing import Any, cast

import pytest
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from pytest_django.fixtures import Settings
from rest_framework.test import APIClient

from apps.accounts.models import Role, User, UserRole
from apps.materials.models import Material
from tests.availability_data import make_assigned_monitor
from tests.catalog_data import (
    client_for,
    make_assignment,
    make_course,
    make_subject,
    make_term,
    make_user,
)
from tests.material_data import (
    PDF_BYTES,
    VIDEO_ID,
    VIDEO_URL,
    make_document,
    make_video,
    pdf_file,
)
from tests.reservation_data import make_student

pytestmark = pytest.mark.django_db

MATERIALS_URL = "/api/v1/materials/"
UPLOADABLE_URL = "/api/v1/materials/subjects/"
PROBLEM_KEYS = {"type", "title", "status", "detail", "instance"}


@pytest.fixture(autouse=True)
def _media(settings: Settings, tmp_path: Path) -> None:
    settings.MEDIA_ROOT = tmp_path / "media"


@pytest.fixture
def world() -> dict[str, Any]:
    sofia, calculo, term = make_assigned_monitor("sofia.diaz@unal.edu.co")
    algebra = make_subject("1000003", "Álgebra Lineal")
    teacher = make_user("marta.ruiz@unal.edu.co", Role.Code.TEACHER, first_name="Marta")
    make_course(calculo, term, teacher=teacher)
    return {
        "sofia": sofia,
        "calculo": calculo,
        "algebra": algebra,
        "term": term,
        "teacher": teacher,
        "ana": make_student("ana.perez@unal.edu.co"),
        "admin": make_user("admin@unal.edu.co", Role.Code.ADMIN),
    }


def upload(user: User, subject_id: int, **body: Any) -> Any:
    data = {"subject_id": subject_id, "kind": "DOCUMENT", "title": "Taller 1", **body}
    data.setdefault("file", pdf_file())
    return client_for(user).post(MATERIALS_URL, data, format="multipart")


def add_video(user: User, subject_id: int, **body: Any) -> Any:
    data = {"subject_id": subject_id, "kind": "VIDEO", "title": "Clase 1", "video_url": VIDEO_URL}
    return client_for(user).post(MATERIALS_URL, {**data, **body}, format="json")


def listing(user: User, subject_id: int, **params: Any) -> Any:
    return client_for(user).get(MATERIALS_URL, {"subject": subject_id, **params})


def assert_problem(response: Any, status: int) -> dict[str, Any]:
    data = response.json()
    assert response.status_code == status, data
    assert data.keys() >= PROBLEM_KEYS
    return cast(dict[str, Any], data)


# --- POST /materials/ · documents (CA-HU08-1 to CA-HU08-3) -----------------------------------


def test_rnf_sec_materials_require_authentication(world: dict[str, Any]) -> None:
    assert APIClient().get(MATERIALS_URL, {"subject": world["calculo"].pk}).status_code == 401
    assert APIClient().post(MATERIALS_URL, {}).status_code == 401


def test_t_07_7_ca_hu08_1_assigned_monitor_uploads_a_document(world: dict[str, Any]) -> None:
    response = upload(world["sofia"], world["calculo"].pk, description="  Con solución  ")

    assert response.status_code == 201, response.json()
    data = response.json()
    assert data["kind"] == "DOCUMENT"
    assert data["title"] == "Taller 1"
    assert data["description"] == "Con solución"
    assert data["subject"] == {
        "id": world["calculo"].pk,
        "code": "1000004",
        "name": "Cálculo Diferencial",
    }
    assert data["uploaded_by"]["id"] == str(world["sofia"].pk)
    assert data["file_name"] == "Taller 1.pdf"
    assert data["file_extension"] == "pdf"
    assert data["content_type"] == "application/pdf"
    assert data["size_bytes"] == len(PDF_BYTES)
    assert data["youtube_id"] is None
    assert data["can_delete"] is True
    stored = Material.objects.get(pk=data["id"])
    # T-07.5: the stored name is generated; the original only survives as metadata.
    assert "Taller" not in str(stored.file.name)
    assert str(stored.file.name).startswith(f"materials/{world['calculo'].pk}/")
    assert stored.file.read() == PDF_BYTES


def test_t_07_7_teacher_of_the_subject_uploads_a_document(world: dict[str, Any]) -> None:
    response = upload(world["teacher"], world["calculo"].pk)

    assert response.status_code == 201, response.json()


def test_t_07_2_ca_hu08_2_executable_is_rejected_with_400(world: dict[str, Any]) -> None:
    exe = pdf_file("instalador.exe", b"MZ\x90\x00binary")

    data = assert_problem(upload(world["sofia"], world["calculo"].pk, file=exe), 400)

    assert data["type"] == "validation_error"
    assert "file" in data["errors"]
    assert not Material.objects.exists()


def test_t_07_4_a_renamed_executable_is_rejected(world: dict[str, Any]) -> None:
    fake = pdf_file("apuntes.pdf", b"MZ\x90\x00binary")

    data = assert_problem(upload(world["sofia"], world["calculo"].pk, file=fake), 400)

    assert "ejecutable" in data["detail"]


def test_t_07_3_ca_hu08_3_oversized_file_is_rejected_with_413(
    world: dict[str, Any], settings: Settings
) -> None:
    settings.MATERIAL_MAX_FILE_BYTES = 1024 * 1024
    big = pdf_file("grande.pdf", PDF_BYTES + b"0" * (1024 * 1024))

    data = assert_problem(upload(world["sofia"], world["calculo"].pk, file=big), 413)

    assert data["type"] == "file_too_large"
    assert "1 MB" in data["detail"]
    assert data["errors"] == {"file": [data["detail"]]}
    assert not Material.objects.exists()


def test_a_document_needs_its_file(world: dict[str, Any]) -> None:
    response = client_for(world["sofia"]).post(
        MATERIALS_URL,
        {"subject_id": world["calculo"].pk, "kind": "DOCUMENT", "title": "Sin archivo"},
        format="multipart",
    )

    data = assert_problem(response, 400)
    assert "file" in data["errors"]


def test_title_is_required(world: dict[str, Any]) -> None:
    data = assert_problem(upload(world["sofia"], world["calculo"].pk, title="   "), 400)

    assert "title" in data["errors"]


def test_unknown_subject_is_rejected(world: dict[str, Any]) -> None:
    data = assert_problem(upload(world["sofia"], 999_999), 400)

    assert "subject_id" in data["errors"]


# --- POST /materials/ · videos (ADR-012, item 3) ---------------------------------------------


def test_monitor_adds_a_youtube_video(world: dict[str, Any]) -> None:
    response = add_video(world["sofia"], world["calculo"].pk)

    assert response.status_code == 201, response.json()
    data = response.json()
    assert data["kind"] == "VIDEO"
    assert data["youtube_id"] == VIDEO_ID
    assert data["file_name"] is None
    assert data["size_bytes"] is None


def test_a_video_must_be_a_youtube_link(world: dict[str, Any]) -> None:
    response = add_video(world["sofia"], world["calculo"].pk, video_url="https://vimeo.com/1")

    data = assert_problem(response, 400)
    assert "video_url" in data["errors"]


def test_a_video_ignores_any_file(world: dict[str, Any]) -> None:
    response = client_for(world["sofia"]).post(
        MATERIALS_URL,
        {
            "subject_id": world["calculo"].pk,
            "kind": "VIDEO",
            "title": "Clase",
            "video_url": VIDEO_URL,
            "file": pdf_file(),
        },
        format="multipart",
    )

    assert response.status_code == 201, response.json()
    assert not Material.objects.get().file


# --- T-07.6 · who may upload (RN-008.1, ADR-012 item 5) --------------------------------------


def test_t_07_6_rn_008_1_student_cannot_upload(world: dict[str, Any]) -> None:
    data = assert_problem(upload(world["ana"], world["calculo"].pk), 403)

    assert data["type"] == "permission_denied"


def test_t_07_6_monitor_of_another_subject_cannot_upload(world: dict[str, Any]) -> None:
    assert_problem(upload(world["sofia"], world["algebra"].pk), 403)
    assert_problem(add_video(world["sofia"], world["algebra"].pk), 403)


def test_t_07_6_teacher_of_another_subject_cannot_upload(world: dict[str, Any]) -> None:
    assert_problem(upload(world["teacher"], world["algebra"].pk), 403)


def test_t_07_6_an_assignment_of_a_past_term_does_not_allow_uploads(
    world: dict[str, Any],
) -> None:
    today = timezone.localdate()
    past = make_term("2025-2", today - timedelta(days=300), today - timedelta(days=200))
    make_assignment(world["sofia"], world["algebra"], past)

    assert_problem(upload(world["sofia"], world["algebra"].pk), 403)


def test_t_07_6_administrator_does_not_upload(world: dict[str, Any]) -> None:
    assert_problem(upload(world["admin"], world["calculo"].pk), 403)


# --- GET /materials/?subject= (CA-HU08-4) ----------------------------------------------------


def test_t_07_8_ca_hu08_4_student_lists_the_material_of_a_subject(
    world: dict[str, Any],
) -> None:
    older = make_document(world["calculo"], world["sofia"], "Taller 1")
    newer = make_video(world["calculo"], world["teacher"], "Clase grabada")
    make_document(world["algebra"], world["sofia"], "De otra asignatura")
    make_document(world["calculo"], world["sofia"], "Retirado", is_active=False)

    response = listing(world["ana"], world["calculo"].pk)

    assert response.status_code == 200, response.json()
    data = response.json()
    assert data["count"] == 2
    assert [item["id"] for item in data["results"]] == [str(newer.pk), str(older.pk)]
    assert all(item["can_delete"] is False for item in data["results"])


def test_t_07_8_listing_filters_by_kind(world: dict[str, Any]) -> None:
    make_document(world["calculo"], world["sofia"])
    video = make_video(world["calculo"], world["sofia"])

    data = listing(world["ana"], world["calculo"].pk, kind="VIDEO").json()

    assert [item["id"] for item in data["results"]] == [str(video.pk)]


def test_t_07_8_listing_requires_the_subject(world: dict[str, Any]) -> None:
    data = assert_problem(client_for(world["ana"]).get(MATERIALS_URL), 400)

    assert "subject" in data["errors"]


def test_t_07_8_listing_is_paginated(world: dict[str, Any]) -> None:
    for index in range(3):
        make_document(world["calculo"], world["sofia"], f"Taller {index}")

    data = listing(world["ana"], world["calculo"].pk, page_size=2).json()

    assert data["count"] == 3
    assert len(data["results"]) == 2
    assert data["next"] is not None


def test_rnf_per_listing_costs_a_fixed_number_of_queries(world: dict[str, Any]) -> None:
    make_document(world["calculo"], world["sofia"])
    client = client_for(world["ana"])
    with CaptureQueriesContext(connection) as few:
        client.get(MATERIALS_URL, {"subject": world["calculo"].pk})
    for index in range(5):
        make_document(world["calculo"], world["teacher"], f"Extra {index}")
        make_video(world["calculo"], world["sofia"], f"Video {index}")

    with CaptureQueriesContext(connection) as many:
        client.get(MATERIALS_URL, {"subject": world["calculo"].pk})

    assert len(many.captured_queries) == len(few.captured_queries)


# --- GET /materials/{id}/download/ (CA-HU08-4, RNF-SEC-003) ----------------------------------


def test_t_07_9_ca_hu08_4_student_downloads_a_document(world: dict[str, Any]) -> None:
    document = make_document(world["calculo"], world["sofia"], file=pdf_file("Guía 1.pdf"))

    response = client_for(world["ana"]).get(f"{MATERIALS_URL}{document.pk}/download/")

    assert response.status_code == 200
    assert b"".join(response.streaming_content) == PDF_BYTES  # type: ignore[attr-defined]
    assert response["Content-Type"] == "application/pdf"
    assert response["X-Content-Type-Options"] == "nosniff"
    disposition = response["Content-Disposition"]
    assert disposition.startswith("attachment")
    assert "Gu%C3%ADa%201.pdf" in disposition


def test_t_07_9_anonymous_download_is_rejected(world: dict[str, Any]) -> None:
    document = make_document(world["calculo"], world["sofia"])

    assert APIClient().get(f"{MATERIALS_URL}{document.pk}/download/").status_code == 401


def test_a_video_has_nothing_to_download(world: dict[str, Any]) -> None:
    video = make_video(world["calculo"], world["sofia"])

    response = client_for(world["ana"]).get(f"{MATERIALS_URL}{video.pk}/download/")

    assert response.status_code == 404


# --- DELETE /materials/{id}/ (CA-HU08-5, T-07.10, T-07.11) -----------------------------------


def test_t_07_10_ca_hu08_5_someone_else_cannot_remove_material(world: dict[str, Any]) -> None:
    document = make_document(world["calculo"], world["sofia"])

    data = assert_problem(
        client_for(world["teacher"]).delete(f"{MATERIALS_URL}{document.pk}/"), 403
    )

    assert data["type"] == "permission_denied"
    document.refresh_from_db()
    assert document.is_active


def test_t_07_10_t_07_11_author_removes_material_logically(world: dict[str, Any]) -> None:
    document = make_document(world["calculo"], world["sofia"])

    response = client_for(world["sofia"]).delete(f"{MATERIALS_URL}{document.pk}/")

    assert response.status_code == 204
    document.refresh_from_db()
    assert document.is_active is False
    assert document.removed_by == world["sofia"]
    assert document.removed_at is not None
    assert listing(world["ana"], world["calculo"].pk).json()["count"] == 0
    download = client_for(world["ana"]).get(f"{MATERIALS_URL}{document.pk}/download/")
    assert download.status_code == 404


def test_t_07_10_administrator_removes_material(world: dict[str, Any]) -> None:
    video = make_video(world["calculo"], world["sofia"])

    response = client_for(world["admin"]).delete(f"{MATERIALS_URL}{video.pk}/")

    assert response.status_code == 204
    assert listing(world["admin"], world["calculo"].pk).json()["results"] == []


def test_removed_material_cannot_be_removed_again(world: dict[str, Any]) -> None:
    document = make_document(world["calculo"], world["sofia"], is_active=False)

    response = client_for(world["sofia"]).delete(f"{MATERIALS_URL}{document.pk}/")

    assert response.status_code == 404


def test_author_and_administrator_see_they_can_remove(world: dict[str, Any]) -> None:
    make_document(world["calculo"], world["sofia"])

    assert listing(world["sofia"], world["calculo"].pk).json()["results"][0]["can_delete"]
    assert listing(world["admin"], world["calculo"].pk).json()["results"][0]["can_delete"]
    assert not listing(world["teacher"], world["calculo"].pk).json()["results"][0]["can_delete"]


# --- GET /materials/subjects/ · where the user may upload ------------------------------------


def test_monitor_and_teacher_see_the_subjects_they_can_upload_to(world: dict[str, Any]) -> None:
    make_document(world["calculo"], world["sofia"])
    make_video(world["calculo"], world["sofia"])
    make_video(world["calculo"], world["sofia"], is_active=False)
    today = timezone.localdate()
    past = make_term("2025-2", today - timedelta(days=300), today - timedelta(days=200))
    make_assignment(world["sofia"], world["algebra"], past)

    for user, role in ((world["sofia"], "MONITOR"), (world["teacher"], "TEACHER")):
        response = client_for(user).get(UPLOADABLE_URL)

        assert response.status_code == 200, response.json()
        data = response.json()
        assert [item["id"] for item in data] == [world["calculo"].pk]
        assert data[0]["roles"] == [role]
        assert data[0]["document_count"] == 1
        assert data[0]["video_count"] == 1
        assert data[0]["department"] == world["calculo"].department.name


def test_monitor_who_also_teaches_a_subject_sees_it_once(world: dict[str, Any]) -> None:
    UserRole.objects.create(user=world["sofia"], role=Role.objects.get(code=Role.Code.TEACHER))
    make_course(world["calculo"], world["term"], group="2", teacher=world["sofia"])

    data = client_for(world["sofia"]).get(UPLOADABLE_URL).json()

    assert [item["id"] for item in data] == [world["calculo"].pk]
    assert data[0]["roles"] == ["MONITOR", "TEACHER"]


def test_student_has_no_subjects_to_upload_to(world: dict[str, Any]) -> None:
    response = client_for(world["ana"]).get(UPLOADABLE_URL)

    assert response.status_code == 200
    assert response.json() == []
