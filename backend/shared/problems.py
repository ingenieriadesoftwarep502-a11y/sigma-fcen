"""Error responses in the single format of SAD §6.3, inspired by RFC 9457.

```json
{"type": "slot_unavailable", "title": "Conflicto", "status": 409,
 "detail": "La franja ya no está disponible.", "instance": "/api/v1/reservations/",
 "errors": {"slot_id": ["La franja ya no está disponible."]}}
```

`detail` is always a readable message, so clients that only read `detail` keep working.
Views opt in with `ProblemDetailsMixin`; the reservations API is the first one (FASE-04).
"""

from collections.abc import Mapping
from typing import Any

from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler

TITLES = {
    status.HTTP_400_BAD_REQUEST: "Datos inválidos",
    status.HTTP_401_UNAUTHORIZED: "Sin autenticación",
    status.HTTP_403_FORBIDDEN: "Permiso denegado",
    status.HTTP_404_NOT_FOUND: "No encontrado",
    status.HTTP_405_METHOD_NOT_ALLOWED: "Método no permitido",
    status.HTTP_409_CONFLICT: "Conflicto",
    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE: "Archivo demasiado grande",
    status.HTTP_429_TOO_MANY_REQUESTS: "Demasiadas peticiones",
}
VALIDATION_TYPE = "validation_error"


class Conflict(exceptions.APIException):
    """A 409 whose `code` becomes the problem `type`; `errors` points at the offending input."""

    status_code = status.HTTP_409_CONFLICT
    default_code = "conflict"
    default_detail = "El estado actual no permite el cambio."

    def __init__(
        self, detail: str, code: str | None = None, errors: dict[str, list[str]] | None = None
    ) -> None:
        super().__init__(detail, code)
        self.errors = errors


def _first_message(errors: Any) -> str:
    """The first readable message of a (possibly nested) DRF validation error."""
    if isinstance(errors, Mapping):
        for value in errors.values():
            message = _first_message(value)
            if message:
                return message
        return ""
    if isinstance(errors, list):
        return _first_message(errors[0]) if errors else ""
    return str(errors)


def _problem_type(exc: Exception) -> str:
    if isinstance(exc, exceptions.ValidationError):
        return VALIDATION_TYPE
    if isinstance(exc, exceptions.APIException):
        codes = exc.get_codes()
        if isinstance(codes, str):
            return codes
        return str(exc.default_code)
    return "error"


def problem_exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """DRF's handler, with the body reshaped into the SAD §6.3 problem format."""
    response = exception_handler(exc, context)
    if response is None:
        return None
    request = context.get("request")
    data = response.data
    body: dict[str, Any] = {
        "type": _problem_type(exc),
        "title": TITLES.get(response.status_code, "Error"),
        "status": response.status_code,
        "instance": request.path if request is not None else "",
    }
    if isinstance(exc, exceptions.ValidationError):
        errors = data if isinstance(data, Mapping) else {"non_field_errors": data}
        body["detail"] = _first_message(errors)
        body["errors"] = errors
    else:
        body["detail"] = str(data.get("detail", "")) if isinstance(data, Mapping) else str(data)
        extra = getattr(exc, "errors", None)
        if extra:
            body["errors"] = extra
    response.data = body
    return response


class ProblemDetailsMixin:
    """Makes a DRF view answer its errors in the SAD §6.3 format."""

    def get_exception_handler(self) -> Any:
        return problem_exception_handler
