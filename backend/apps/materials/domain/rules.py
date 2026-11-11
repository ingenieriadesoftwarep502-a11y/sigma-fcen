"""Pure material rules, free of Django and HTTP (DDD 4.7, RN-008, ADR-012).

ADR-012: any document is accepted except executables and what a browser could run; the real
content of well-known formats must match their extension. Videos are never uploaded: they are
YouTube links, embedded in the platform. The size limit comes from settings.
"""

import re
import unicodedata
from enum import StrEnum
from urllib.parse import parse_qs, urlparse

FILE_FIELD = "file"
VIDEO_FIELD = "video_url"
TITLE_FIELD = "title"
DESCRIPTION_FIELD = "description"

MAX_TITLE_LENGTH = 150
MAX_DESCRIPTION_LENGTH = 1000
MAX_FILENAME_LENGTH = 150
# Bytes read from the start of a file to recognize its real content.
HEAD_BYTES = 2048
FALLBACK_NAME = "archivo"

# Programs, scripts and pages a browser or the operating system may run on open.
BLOCKED_EXTENSIONS = frozenset(
    {
        "apk", "app", "bat", "bin", "cgi", "cmd", "com", "cpl", "deb", "dll", "dmg", "elf",
        "exe", "gadget", "hta", "htm", "html", "inf", "ins", "jar", "js", "jse", "lnk", "mht",
        "mhtml", "mjs", "msc", "msi", "msp", "php", "pif", "ps1", "psm1", "reg", "rpm", "run",
        "scr", "sct", "sh", "shtml", "so", "svg", "svgz", "url", "vb", "vbe", "vbs", "ws",
        "wsc", "wsf", "wsh", "xhtml",
    }
)  # fmt: skip

# Windows PE, ELF, Mach-O (both byte orders, 32 and 64 bits) and fat binaries / Java classes.
EXECUTABLE_SIGNATURES = (
    b"MZ",
    b"\x7fELF",
    b"\xfe\xed\xfa\xce",
    b"\xfe\xed\xfa\xcf",
    b"\xce\xfa\xed\xfe",
    b"\xcf\xfa\xed\xfe",
    b"\xca\xfe\xba\xbe",
)

_ZIP = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")
_OLE = (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1",)
# Formats whose first bytes are fixed: their content must start like this.
KNOWN_SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "png": (b"\x89PNG\r\n\x1a\n",),
    "jpg": (b"\xff\xd8\xff",),
    "jpeg": (b"\xff\xd8\xff",),
    "gif": (b"GIF87a", b"GIF89a"),
    "zip": _ZIP,
    "docx": _ZIP,
    "xlsx": _ZIP,
    "pptx": _ZIP,
    "odt": _ZIP,
    "ods": _ZIP,
    "odp": _ZIP,
    "epub": _ZIP,
    "doc": _OLE,
    "xls": _OLE,
    "ppt": _OLE,
}
# Some PDF writers put a few bytes before the header; readers accept it within 1 KiB.
PDF_MARKER = b"%PDF-"
PDF_WINDOW = 1024

YOUTUBE_HOSTS = frozenset({"youtube.com", "youtube-nocookie.com", "youtu.be"})
YOUTUBE_ID = re.compile(r"[A-Za-z0-9_-]{11}")
# Paths whose second segment is the video id, e.g. /embed/<id>.
YOUTUBE_ID_PATHS = frozenset({"embed", "shorts", "live", "v"})

_UNSAFE_CHARS = re.compile(r"[^\w .()+,\-]")
_SPACES = re.compile(r" {2,}")

BLOCKED_MESSAGE = "Por seguridad no se permiten programas ni archivos ejecutables (.{ext})."
NO_EXTENSION_MESSAGE = "El archivo debe tener una extensión, por ejemplo .pdf."
EMPTY_MESSAGE = "El archivo está vacío."
EXECUTABLE_CONTENT_MESSAGE = "El archivo es un programa ejecutable; no se puede subir."
MISMATCH_MESSAGE = "El contenido del archivo no corresponde a su extensión (.{ext})."
YOUTUBE_MESSAGE = "Pega un enlace válido de un video de YouTube."
TITLE_REQUIRED_MESSAGE = "Escribe un título para el material."
TITLE_TOO_LONG_MESSAGE = f"El título no puede superar {MAX_TITLE_LENGTH} caracteres."
DESCRIPTION_TOO_LONG_MESSAGE = (
    f"La descripción no puede superar {MAX_DESCRIPTION_LENGTH} caracteres."
)


def too_large_message(max_bytes: int) -> str:
    return f"El archivo supera el tamaño máximo de {max_bytes // (1024 * 1024)} MB."


class MaterialKind(StrEnum):
    """A document is a stored file; a video is a YouTube link (ADR-012, item 3)."""

    DOCUMENT = "DOCUMENT"
    VIDEO = "VIDEO"


class MaterialRuleError(Exception):
    """The request breaks a material rule (400); `field` names the offending input."""

    def __init__(self, field: str, message: str) -> None:
        super().__init__(message)
        self.field = field
        self.message = message


class MaterialTooLargeError(Exception):
    """The file exceeds the maximum size (413, CA-HU08-3)."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class MaterialForbiddenError(Exception):
    """The user may not add or remove material here (403)."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _basename(name: str) -> str:
    """The last path segment, whichever separator the uploading system used."""
    return re.split(r"[\\/]", name)[-1]


def extension_of(name: str) -> str:
    base = _basename(name)
    return base.rsplit(".", 1)[1].strip().lower() if "." in base else ""


def sanitize_filename(name: str) -> str:
    """A name safe to show and to suggest on download: no path, no control or odd characters.

    It is only metadata: the stored file always gets a generated name (T-07.5).
    """
    base = unicodedata.normalize("NFC", _basename(name))
    base = "".join(char for char in base if unicodedata.category(char)[0] != "C")
    stem, _, ext = base.rpartition(".") if "." in base else (base, "", "")
    stem = _SPACES.sub(" ", _UNSAFE_CHARS.sub("_", stem)).strip(" .")
    ext = _UNSAFE_CHARS.sub("_", ext).strip(" .")
    stem = stem or FALLBACK_NAME
    if not ext:
        return stem[:MAX_FILENAME_LENGTH]
    return f"{stem[: MAX_FILENAME_LENGTH - len(ext) - 1]}.{ext}"


def ensure_allowed_file(name: str, head: bytes) -> None:
    """RN-008.2 and T-07.4: no executables, by extension or by content; known formats match."""
    ext = extension_of(name)
    if not ext:
        raise MaterialRuleError(FILE_FIELD, NO_EXTENSION_MESSAGE)
    if ext in BLOCKED_EXTENSIONS:
        raise MaterialRuleError(FILE_FIELD, BLOCKED_MESSAGE.format(ext=ext))
    if not head:
        raise MaterialRuleError(FILE_FIELD, EMPTY_MESSAGE)
    if head.startswith(EXECUTABLE_SIGNATURES):
        raise MaterialRuleError(FILE_FIELD, EXECUTABLE_CONTENT_MESSAGE)
    if ext == "pdf":
        matches = PDF_MARKER in head[:PDF_WINDOW]
    else:
        signatures = KNOWN_SIGNATURES.get(ext)
        matches = signatures is None or head.startswith(signatures)
    if not matches:
        raise MaterialRuleError(FILE_FIELD, MISMATCH_MESSAGE.format(ext=ext))


def ensure_size(size: int, *, max_bytes: int) -> None:
    """RN-008.3: at most `max_bytes` per document."""
    if size > max_bytes:
        raise MaterialTooLargeError(too_large_message(max_bytes))


def youtube_id_from(url: str | None) -> str:
    """The 11-character id of a YouTube video link, in any of its usual shapes."""
    text = (url or "").strip()
    if "://" not in text:
        text = f"https://{text}"
    parsed = urlparse(text)
    host = (parsed.hostname or "").lower()
    for prefix in ("www.", "m."):
        host = host.removeprefix(prefix)
    if parsed.scheme not in ("http", "https") or host not in YOUTUBE_HOSTS:
        raise MaterialRuleError(VIDEO_FIELD, YOUTUBE_MESSAGE)

    segments = [segment for segment in parsed.path.split("/") if segment]
    candidate = ""
    if host == "youtu.be" and segments:
        candidate = segments[0]
    elif segments == ["watch"]:
        candidate = parse_qs(parsed.query).get("v", [""])[0]
    elif len(segments) >= 2 and segments[0] in YOUTUBE_ID_PATHS:
        candidate = segments[1]
    if not YOUTUBE_ID.fullmatch(candidate):
        raise MaterialRuleError(VIDEO_FIELD, YOUTUBE_MESSAGE)
    return candidate


def clean_title(title: str | None) -> str:
    cleaned = (title or "").strip()
    if not cleaned:
        raise MaterialRuleError(TITLE_FIELD, TITLE_REQUIRED_MESSAGE)
    if len(cleaned) > MAX_TITLE_LENGTH:
        raise MaterialRuleError(TITLE_FIELD, TITLE_TOO_LONG_MESSAGE)
    return cleaned


def clean_description(description: str | None) -> str:
    cleaned = (description or "").strip()
    if len(cleaned) > MAX_DESCRIPTION_LENGTH:
        raise MaterialRuleError(DESCRIPTION_FIELD, DESCRIPTION_TOO_LONG_MESSAGE)
    return cleaned
