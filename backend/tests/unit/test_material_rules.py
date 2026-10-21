"""Pure material rules (T-07.2 to T-07.5, RN-008, ADR-012)."""

import pytest

from apps.materials.domain.rules import (
    MaterialRuleError,
    MaterialTooLargeError,
    clean_description,
    clean_title,
    ensure_allowed_file,
    ensure_size,
    extension_of,
    sanitize_filename,
    youtube_id_from,
)

MB = 1024 * 1024
PDF = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
ZIP = b"PK\x03\x04" + b"\x00" * 16
OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 16
PE = b"MZ\x90\x00" + b"\x00" * 16
ELF = b"\x7fELF" + b"\x00" * 16
VIDEO_ID = "dQw4w9WgXcQ"


# --- T-07.2 · format: anything but executables (CA-HU08-2, RN-008.2) -------------------------


@pytest.mark.parametrize(
    ("name", "head"),
    [
        ("parcial.pdf", PDF),
        ("taller.docx", ZIP),
        ("clase.pptx", ZIP),
        ("notas.xlsx", ZIP),
        ("viejo.doc", OLE),
        ("grafica.png", PNG),
        ("ejercicios.py", b"import numpy as np\n"),
        ("modelo.ipynb", b'{"cells": []}'),
        ("resumen.txt", b"Derivadas"),
        ("datos.csv", b"x,y\n1,2\n"),
        ("codigo.zip", ZIP),
        ("script.R", b"x <- c(1, 2)\n"),
    ],
)
def test_t_07_2_rn_008_2_documents_of_any_kind_are_accepted(name: str, head: bytes) -> None:
    ensure_allowed_file(name, head)


@pytest.mark.parametrize(
    "name",
    [
        "virus.exe",
        "instalar.msi",
        "correr.bat",
        "correr.cmd",
        "deploy.sh",
        "script.ps1",
        "app.js",
        "pagina.html",
        "pagina.htm",
        "dibujo.svg",
        "programa.jar",
        "app.apk",
        "macro.vbs",
        "VIRUS.EXE",
    ],
)
def test_t_07_2_ca_hu08_2_executable_formats_are_rejected(name: str) -> None:
    with pytest.raises(MaterialRuleError, match="no se permiten") as exc:
        ensure_allowed_file(name, b"anything")

    assert exc.value.field == "file"


def test_t_07_2_a_file_without_extension_is_rejected() -> None:
    with pytest.raises(MaterialRuleError, match="extensión") as exc:
        ensure_allowed_file("LEEME", b"hola")

    assert exc.value.field == "file"


def test_t_07_2_an_empty_file_is_rejected() -> None:
    with pytest.raises(MaterialRuleError, match="vacío"):
        ensure_allowed_file("vacio.pdf", b"")


# --- T-07.4 · the real content, not only the extension (security) --------------------------


@pytest.mark.parametrize("head", [PE, ELF, b"\xcf\xfa\xed\xfe" + b"\x00" * 8])
def test_t_07_4_an_executable_renamed_as_a_document_is_rejected(head: bytes) -> None:
    with pytest.raises(MaterialRuleError, match="ejecutable"):
        ensure_allowed_file("apuntes.txt", head)


@pytest.mark.parametrize(
    ("name", "head"),
    [("parcial.pdf", PNG), ("foto.png", PDF), ("taller.docx", PDF), ("viejo.doc", ZIP)],
)
def test_t_07_4_content_that_does_not_match_its_extension_is_rejected(
    name: str, head: bytes
) -> None:
    with pytest.raises(MaterialRuleError, match="no corresponde"):
        ensure_allowed_file(name, head)


# --- T-07.3 · size (CA-HU08-3, RN-008.3) ----------------------------------------------------


def test_t_07_3_rn_008_3_a_file_at_the_limit_is_accepted() -> None:
    ensure_size(20 * MB, max_bytes=20 * MB)


def test_t_07_3_ca_hu08_3_a_file_over_the_limit_is_rejected() -> None:
    with pytest.raises(MaterialTooLargeError, match="20 MB"):
        ensure_size(20 * MB + 1, max_bytes=20 * MB)


# --- T-07.5 · file names (security) ---------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "clean"),
    [
        ("Parcial 1.pdf", "Parcial 1.pdf"),
        ("../../etc/passwd.txt", "passwd.txt"),
        ("C:\\Users\\ana\\taller.docx", "taller.docx"),
        ("..\\..\\secreto.pdf", "secreto.pdf"),
        (".bashrc.txt", "bashrc.txt"),
        ("notas\x00\n.pdf", "notas.pdf"),
        ('a<b>:"c"|?*.pdf', "a_b___c____.pdf"),
        ("Cálculo diferencial ñ.pdf", "Cálculo diferencial ñ.pdf"),
        ("   .pdf", "archivo.pdf"),
        ("", "archivo"),
    ],
)
def test_t_07_5_file_names_are_sanitized(raw: str, clean: str) -> None:
    assert sanitize_filename(raw) == clean


def test_t_07_5_long_names_keep_their_extension() -> None:
    cleaned = sanitize_filename("a" * 400 + ".pdf")

    assert cleaned.endswith(".pdf")
    assert len(cleaned) <= 150


def test_extension_is_lowercase_and_without_dot() -> None:
    assert extension_of("Clase.PDF") == "pdf"
    assert extension_of("archivo") == ""


# --- Videos: YouTube links only (ADR-012, item 3) -------------------------------------------


@pytest.mark.parametrize(
    "url",
    [
        f"https://www.youtube.com/watch?v={VIDEO_ID}",
        f"https://youtube.com/watch?v={VIDEO_ID}&t=42s",
        f"https://m.youtube.com/watch?feature=share&v={VIDEO_ID}",
        f"https://youtu.be/{VIDEO_ID}",
        f"https://youtu.be/{VIDEO_ID}?si=abc",
        f"https://www.youtube.com/embed/{VIDEO_ID}",
        f"https://www.youtube-nocookie.com/embed/{VIDEO_ID}",
        f"https://www.youtube.com/shorts/{VIDEO_ID}",
        f"https://www.youtube.com/live/{VIDEO_ID}",
        f"  www.youtube.com/watch?v={VIDEO_ID}  ",
    ],
)
def test_youtube_links_give_the_video_id(url: str) -> None:
    assert youtube_id_from(url) == VIDEO_ID


@pytest.mark.parametrize(
    "url",
    [
        "",
        "https://vimeo.com/123456",
        "https://www.youtube.com/watch?v=short",
        "https://evil.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
        "javascript:alert(1)",
        "https://www.youtube.com/playlist?list=PL123",
    ],
)
def test_other_links_are_rejected(url: str) -> None:
    with pytest.raises(MaterialRuleError, match="YouTube") as exc:
        youtube_id_from(url)

    assert exc.value.field == "video_url"


# --- Title and description ------------------------------------------------------------------


def test_title_is_trimmed_and_required() -> None:
    assert clean_title("  Taller 3  ") == "Taller 3"
    with pytest.raises(MaterialRuleError, match="título") as exc:
        clean_title("   ")
    assert exc.value.field == "title"


def test_title_has_a_maximum_length() -> None:
    with pytest.raises(MaterialRuleError, match="150"):
        clean_title("a" * 151)


def test_description_is_optional_and_bounded() -> None:
    assert clean_description(None) == ""
    assert clean_description("  Solución del taller  ") == "Solución del taller"
    with pytest.raises(MaterialRuleError, match="1000") as exc:
        clean_description("a" * 1001)
    assert exc.value.field == "description"
