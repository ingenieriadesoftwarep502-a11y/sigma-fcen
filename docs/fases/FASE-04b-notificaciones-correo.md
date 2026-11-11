# FASE-04b · Notificaciones por correo de reservas

| Campo | Valor |
|---|---|
| Sprint | Fuera del plan original — complemento de FASE-04 |
| Historias | HU-03 Reserva · HU-04 Cancelación (eventos de dominio) |
| Puntos | — |
| Estado | **Implementada — en revisión** |
| ADR bloqueantes | Ninguno — amplía el punto 3 de ADR-011 ("la notificación se documenta como evento de dominio") |
| Requisitos | DDD §7 (`ReservationConfirmed`, `ReservationCancelled`) |

---

## 1. Objetivo

Que el estudiante y el monitor se enteren por correo cada vez que una reserva se crea o se cancela, sin importar por qué camino ocurra el cambio.

**Resultado observable:** al reservar, el estudiante recibe "Reserva confirmada" y el monitor "Nueva reserva"; al cancelar, ambos reciben "Reserva cancelada". Si el servidor de correo falla, la reserva o la cancelación se guarda igual y el error queda en el log.

---

## 2. Gate de entrada

- [x] FASE-04 implementada (servicios `reserve_slot` y `cancel_reservation`).
- [x] Proveedor definido: Resend por SMTP con el backend estándar de Django. Sin dependencias nuevas y sin Celery.

---

## 3. Alcance

### Entra

- App `apps/notifications/` sin modelos:
  - `domain/messages.py`: composición pura (asunto, texto plano y HTML) sin base de datos ni backend de correo.
  - `services.py`: toma la instantánea dentro de la transacción y entrega con `transaction.on_commit`.
- Un mensaje por destinatario (`EmailMultiAlternatives`, texto + HTML). Ningún correo expone la dirección del otro participante.
- Contenido en español: asignatura, fecha y hora en hora de Colombia (`America/Bogota`), monitor, estudiante, modalidad, lugar o enlace, nota del estudiante (solo al monitor, RF-047) y motivo de cancelación cuando existe.
- Configuración por variables de entorno (ADR-002).

### No entra

- Correos al registrar una sesión (`COMPLETED` / `NO_SHOW` desde FASE-05).
- Cola de envío, reintentos o seguimiento de entrega: el envío es de mejor esfuerzo.
- Recordatorios antes de la monitoría.
- Preferencias del usuario para desactivar correos.

---

## 4. Mapa de eventos

Se revisaron todos los cambios de estado de una reserva en `apps/reservations/services.py`, `apps/availability/services.py` y `apps/tutoring_sessions/services.py`.

| Evento | Función de servicio | Estudiante | Monitor |
|---|---|---|---|
| Reserva creada | `reserve_slot` | "Reserva confirmada" | "Nueva reserva" (con la nota del estudiante) |
| Cancelación del estudiante dentro de la ventana → `CANCELLED` | `cancel_reservation` | "Cancelaste tu reserva" | "{estudiante} canceló su reserva" |
| Cancelación tardía del estudiante → `NO_SHOW` (ADR-011) | `cancel_reservation` | Aviso de inasistencia | Aviso de inasistencia y cupo libre |
| Cancelación del monitor (motivo obligatorio) | `cancel_reservation` | "{monitor} canceló tu reserva" + motivo | "Cancelaste la reserva de {estudiante}" + motivo |
| Cancelación de un administrador (motivo obligatorio) | `cancel_reservation` | "Un administrador canceló tu reserva" + motivo | "Un administrador canceló la reserva de {estudiante}" + motivo |

**Caminos revisados que no cancelan reservas:**

- `cancel_slot` rechaza con `409` cualquier franja con reservas `CONFIRMED` (T-04.21): no hay cascada.
- `deactivate_template` solo retira franjas sin reservas `CONFIRMED`.
- `deactivate_user` bloquea la cuenta pero no toca sus reservas.
- `record_session` cierra reservas como `COMPLETED` o `NO_SHOW`; queda fuera de alcance.

---

## 5. Diseño

| Decisión | Motivo |
|---|---|
| Envío con `transaction.on_commit` | Una transacción revertida no envía nada y ninguna llamada SMTP ocurre con filas bloqueadas (FASE-04 §11) |
| Cada mensaje en su propio `try` con `logger.exception` | Un fallo no corta el otro correo ni deshace el cambio; el log no incluye direcciones |
| Composición pura separada del envío | Asunto y cuerpo se prueban como datos, sin base de datos |
| Asunto en una sola línea | Evita inyección de cabeceras con nombres de asignatura manipulados |
| HTML con `html.escape` | Ningún dato del usuario se interpreta como marcado |

### Variables de entorno

| Variable | Desarrollo | Producción |
|---|---|---|
| `EMAIL_BACKEND` | `console` (por defecto) | `smtp` (por defecto en `production.py`) |
| `EMAIL_HOST` | `smtp.resend.com` | `smtp.resend.com` |
| `EMAIL_PORT` | `465` | `465` |
| `EMAIL_USE_SSL` | `True` | `True` |
| `EMAIL_HOST_USER` | `resend` | `resend` |
| `RESEND_API_KEY` | vacía | **obligatoria** (es la contraseña SMTP) |
| `DEFAULT_FROM_EMAIL` | `SIGMA-FCEN <notificaciones@localhost>` | **obligatoria**, en un dominio verificado en Resend |
| `EMAIL_TIMEOUT` | `10` | `10` |

Las pruebas usan siempre `locmem` (`settings/test.py`).

---

## 6. Plan de trabajo TDD

| # | Tarea | Prueba primero (G2) |
|---|---|---|
| T-04b.1 | Configuración | `tests/unit/test_settings.py`: consola por defecto, `locmem` en pruebas, SMTP y credenciales obligatorias en producción |
| T-04b.2 | Composición pura | `tests/unit/test_notification_messages.py`: hora de Colombia, destinatarios separados, nota solo al monitor, motivo, inasistencia, escape HTML, asunto sin saltos de línea |
| T-04b.3 | Entrega tras el commit | `tests/integration/test_reservation_notifications.py`: correos en `mail.outbox` solo con `django_capture_on_commit_callbacks(execute=True)`; nada antes del commit ni en operaciones rechazadas |
| T-04b.4 | Aislamiento de fallos | Backend que lanza `SMTPException`/`OSError`: la reserva y la cancelación se guardan, se registra el error con traza y sin direcciones |

---

## 7. Verificación

```bash
cd backend
pytest tests/unit/test_notification_messages.py tests/integration/test_reservation_notifications.py
ruff check . && ruff format --check . && mypy . && pytest
```

---

## 8. Definition of Done

- [x] Pruebas escritas antes de la implementación y en rojo.
- [x] Suite completa, `ruff`, `ruff format --check` y `mypy` en verde.
- [ ] Variables `RESEND_API_KEY` y `DEFAULT_FROM_EMAIL` configuradas en el entorno de producción.
- [ ] Dominio remitente verificado en Resend.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| El envío SMTP es síncrono dentro de la petición, después del commit | `EMAIL_TIMEOUT` de 10 s; si la latencia molesta, mover el envío a una cola (no hay Celery en v1) |
| Correos perdidos si Resend falla | Quedan en el log con `logger.exception`; no hay reintentos en v1 |
| Remitente no verificado en Resend | Producción exige `DEFAULT_FROM_EMAIL` explícito; verificar el dominio antes del despliegue |
