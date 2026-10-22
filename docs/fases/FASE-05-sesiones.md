# FASE-05 · Sesiones e historial

| Campo | Valor |
|---|---|
| Sprint | 5 (semanas 11–12) |
| Historias | HU-06 Registro de sesión (8 pts) · HU-12 Historial del estudiante (3 pts) |
| Puntos | 11 |
| Estado | **En revisión** — backend y frontend implementados el 2026-10-22; pendientes CI y aprobación de PRs |
| ADR bloqueantes | Ninguno — ADR-010 cerrado el 2026-10-11; plazo de edición (RF-052) confirmado el 2026-10-22 |
| Requisitos | RF-050 a RF-053, RF-046 |

---

## 1. Objetivo

Que el monitor deje constancia verificable de lo trabajado en cada monitoría y que el estudiante consulte su historial completo.

**Resultado observable:** tras una monitoría, el monitor registra asistencia, temas y observaciones; cada reserva pasa a `COMPLETED` o `NO_SHOW`; el estudiante ve esa sesión en su historial.

**Por qué importa más de lo que parece:** este registro es la evidencia que sostiene la acreditación institucional (Documentación base §1) y la materia prima de las métricas de FASE-09.

---

## 2. Gate de entrada

- [ ] FASE-04 cerrada con su DoD completa — *código integrado en `feature/fase-01-integracion` (PR #15, aprobada el 2026-10-22); FASE-05 avanza en paralelo, como hicieron FASE-02 y FASE-03*
- [x] Plazo máximo de edición de una sesión registrada (RF-052): **48 horas** desde el registro *(Nicolás García Orozco, 2026-10-22)*
- [x] Catálogo de `Topic`: **por asignatura**; el monitor elige un tema existente o crea uno nuevo al registrar *(Nicolás García Orozco, 2026-10-22)*
- [x] Monitorías grupales (ADR-010, ampliación 2026-10-15): **una sesión por franja**, con temas, observaciones y material compartidos y asistencia marcada por cada reserva *(Nicolás García Orozco, 2026-10-22)*

> La tercera decisión cambia el DDD §4.5: la sesión ya no es uno a uno con la reserva, sino uno a uno con la franja, y cada reserva recibe su propio registro de asistencia. RN-006.3 pasa a leerse "una franja admite a lo sumo una sesión".

---

## 3. Alcance

### Entra

- App nueva `apps/tutoring_sessions`.
- Entidad `Topic` por asignatura, con creación por el monitor asignado.
- Modelo `TutoringSession` uno a uno con `AvailabilitySlot` y `SessionAttendance` uno a uno con `Reservation`.
- Registro de asistencia, temas, observaciones, material usado y duración.
- Transición de cada reserva a `COMPLETED` o `NO_SHOW` en la misma transacción del registro.
- Edición dentro de las 48 h siguientes al registro.
- Historial del estudiante, paginado.
- Historial del monitor.
- Pantallas de registro de sesión e historial.

### No entra

- Evaluación de la sesión — es FASE-06. El historial expone `evaluation: null` hasta entonces.
- Carga de archivos nuevos — es FASE-07; aquí solo se referencia material ya existente.
- Métricas agregadas — es FASE-09.
- Edición de sesiones fuera del plazo confirmado.
- Proceso que marca como `EXPIRED` las franjas que pasan sin sesión (DDD §6.1). Se registra como deuda técnica (§9.1).

---

## 4. Diseño · `[CONFIRMADO]` 2026-10-22 — Nicolás García Orozco

Decisiones del gate G1: la asistencia **no se edita** (dentro de las 48 h se corrigen temas, observaciones, material y duración); el estudiante **no ve** las observaciones del monitor ni la asistencia de los demás; al menos un tema si alguien asistió; duración de 1 a 180 min; observaciones de hasta 2000 caracteres; crear un tema existente devuelve el existente; `EXPIRED` queda como deuda para FASE-10.

Reglas puras en `apps/tutoring_sessions/domain/rules.py`; casos de uso en `services.py`; lecturas en `selectors.py`. Mismo formato de error que reservas (SAD §6.3, `ProblemDetailsMixin`): reglas `400`, autorización `403`, estado `409`.

### 4.1 Modelo

**`Topic`** — tema académico de una asignatura.

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | — |
| `subject` | FK `Subject` | — |
| `name` | Texto ≤ 80 | Sin espacios sobrantes; único por asignatura **sin distinguir mayúsculas** (`UniqueConstraint(Lower("name"), "subject")`) |
| `created_by` | FK `User`, nulo | Quién lo creó |
| `created_at` | Marca de tiempo UTC | — |

**`TutoringSession`** — lo ocurrido en una franja.

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | — |
| `slot` | OneToOne `AvailabilitySlot` | Una franja, a lo sumo una sesión (RN-006.3), garantizado en base de datos |
| `recorded_by` | FK `User` | El monitor de la franja |
| `topics` | M:N `Topic` | Solo temas de la asignatura de la franja |
| `materials` | M:N `Material` | Solo material activo de la asignatura de la franja |
| `notes` | Texto ≤ 2000 | Observaciones del monitor; opcional |
| `duration_minutes` | Entero 1–180 | Duración real; por defecto la de la franja (60) |
| `recorded_at` | Marca de tiempo UTC | Inicio del plazo de edición |
| `updated_at` | Marca de tiempo UTC | Última edición |

**`SessionAttendance`** — la asistencia de cada estudiante.

| Campo | Tipo | Regla |
|---|---|---|
| `session` | FK `TutoringSession` | — |
| `reservation` | OneToOne `Reservation` | Una reserva, a lo sumo una asistencia |
| `attendance` | `ATTENDED` · `NO_SHOW` | Fija la reserva en `COMPLETED` o `NO_SHOW` |

Índices: `TutoringSession(recorded_at)` para métricas (DDD §9) y `Topic(subject, name)` para el catálogo.

### 4.2 Reglas

| ID | Regla | Error |
|---|---|---|
| RN-006.1 | Solo se registra sobre una franja con al menos una reserva `CONFIRMED`; las canceladas y las cancelaciones tardías (`NO_SHOW` por ADR-011) no entran | `400` |
| RN-006.2 | Solo después de `slot.starts_at` | `400` (CA-HU06-2) |
| RN-006.3 | Una franja admite a lo sumo una sesión | `409` (CA-HU06-3) |
| RN-006.4 | Solo el monitor de la franja registra y edita | `403` (CA-HU06-5) |
| RN-006.5 | El registro debe marcar **todas** las reservas `CONFIRMED` de la franja, ni una más ni una menos; cada una pasa a `COMPLETED` (`ATTENDED`) o `NO_SHOW` en la misma transacción | `400` si falta o sobra una |
| RN-006.6 | Se edita hasta 48 h después de `recorded_at` (`SESSION_EDIT_WINDOW_HOURS`); luego, `409` | `409` |
| RN-006.7 | Si al menos un estudiante asistió, la sesión lleva al menos un tema (alimenta RF-083) | `400` |
| RN-006.8 | **La asistencia no se edita.** Dentro del plazo se corrigen temas, observaciones, material y duración. El DDD §6.2 prohíbe `NO_SHOW` → `COMPLETED` porque el registro es la fuente de verdad | `400` si llega `attendance` en el `PATCH` |

El registro sigue el orden de bloqueos de reservas: usuario que actúa → franja (`select_for_update`) → reservas `CONFIRMED` de la franja. Pasada la hora de inicio ya nadie puede cancelar (ADR-011), así que el conjunto de reservas a marcar no cambia mientras se registra.

### 4.3 Contratos

| Método | Ruta | Rol | Respuestas |
|---|---|---|---|
| `POST` | `/api/v1/tutoring-sessions/` | monitor de la franja | `201` · `400` reglas · `403` franja ajena · `409` ya registrada |
| `GET` | `/api/v1/tutoring-sessions/{id}/` | monitor, docente del curso, administrador, estudiantes de la sesión | `200` · `403` · `404` |
| `PATCH` | `/api/v1/tutoring-sessions/{id}/` | monitor de la franja | `200` · `400` · `403` · `409` fuera de plazo |
| `GET` | `/api/v1/tutoring-sessions/mine/` | monitor | `200` paginado. Filtros: `subject`, `term` |
| `GET` | `/api/v1/tutoring-sessions/history/` | estudiante | `200` paginado · `403` si `student` es otra persona y no es administrador. Filtros: `subject`, `status` (`COMPLETED` · `NO_SHOW`), `student` |
| `GET` | `/api/v1/topics/?subject={id}` | autenticado | `200`, sin paginar, por nombre. `subject` obligatorio |
| `POST` | `/api/v1/topics/` | monitor asignado a la asignatura en el período actual, o administrador | `201` nuevo · `200` si ya existía con ese nombre (idempotente) · `403` |

**Cuerpo del registro:**

```json
{
  "slot_id": 42,
  "attendance": [
    { "reservation_id": "uuid", "attendance": "ATTENDED" },
    { "reservation_id": "uuid", "attendance": "NO_SHOW" }
  ],
  "topic_ids": ["uuid"],
  "material_ids": ["uuid"],
  "notes": "Repasamos la regla de la cadena.",
  "duration_minutes": 60
}
```

El monitor se toma del usuario autenticado, nunca del cuerpo. Las reservas por marcar ya están disponibles en `GET /reservations/mine/?role=monitor&status=CONFIRMED&when=past`; no hace falta un endpoint nuevo.

**Qué ve cada quien en el detalle:** el monitor, el docente y el administrador ven todo. El estudiante ve la asignatura, la fecha, el monitor, los temas, el material, la duración y **solo su propia asistencia**: ni las observaciones del monitor ni la asistencia de los demás.

**Historial del estudiante (HU-12):** una fila por reserva propia ya cerrada (`COMPLETED` o `NO_SHOW`, incluida la cancelación tardía, que no tiene sesión), la más reciente primero: asignatura, fecha, monitor, estado, temas de la sesión (si existe) y `evaluation: null` hasta FASE-06.

### 4.4 Parámetros configurables

| Parámetro | Valor | Usado en |
|---|---|---|
| `SESSION_EDIT_WINDOW_HOURS` | 48 | RN-006.6 |
| `SESSION_MAX_DURATION_MINUTES` | 180 | Validación de `duration_minutes` |

**Modelo de dominio:** ver [`../DDD.md`](../DDD.md) §4.5.

---

## 5. Plan de trabajo TDD

| # | Tarea | Prueba primero (G2) | Criterio / Regla |
|---|---|---|---|
| T-05.1 | Modelo `Topic` | Nombre único por asignatura sin distinguir mayúsculas | — |
| T-05.2 | Modelos `TutoringSession` y `SessionAttendance` | Uno a uno estricto con la franja y con la reserva, en base de datos | RN-006.3 |
| T-05.3 | Regla: reservas confirmadas | Franja sin reservas `CONFIRMED` es rechazada; las canceladas no se marcan | RN-006.1 |
| T-05.4 | Regla: la franja ya inició | Sesión sobre franja futura → `400` | CA-HU06-2, RN-006.2 |
| T-05.5 | Registro válido | Sesión creada y asociada a la franja y a sus reservas | CA-HU06-1 |
| T-05.6 | Sesión duplicada | `409` | CA-HU06-3 |
| T-05.7 | Inasistencia | Reserva pasa a `NO_SHOW` | CA-HU06-4 |
| T-05.8 | Asistencia | Reserva pasa a `COMPLETED` | RN-006.5 |
| T-05.9 | Autorización del monitor | Monitor ajeno → `403` | CA-HU06-5, RN-006.4 |
| T-05.10 | Plazo de edición | Dentro de 48 h se edita; fuera → `409`; la asistencia no se edita | RN-006.6, RN-006.8, RF-052 |
| T-05.11 | Historial del estudiante | Asignatura, fecha, monitor y evaluación | CA-HU12-1 |
| T-05.12 | Historial vacío | Lista vacía con `200` | CA-HU12-2 |
| T-05.13 | Historial ajeno | `403` | CA-HU12-3 |
| T-05.14 | Paginación del historial | Respuesta paginada | CA-HU12-4 |
| T-05.15 | Rendimiento del historial | Sin consultas N+1 al cargar asignatura, monitor y temas | RNF-PER-002 |
| T-05.16 | Frontend: registro de sesión | Formulario con asistencia por estudiante y selección o creación de temas | — |
| T-05.17 | Frontend: historial | Listado paginado con filtros básicos | — |
| T-05.18 | Marcado completo de reservas | Falta o sobra una reserva → `400` | RN-006.5 |
| T-05.19 | Atomicidad | Si falla una transición, no queda sesión ni reserva cambiada | RN-006.5 |
| T-05.20 | Temas y material de la asignatura | Tema o material de otra asignatura → `400`; sin tema y con asistentes → `400` | RN-006.7 |
| T-05.21 | Catálogo de temas | Crear es idempotente; monitor no asignado → `403` | — |

---

## 6. Criterios de aceptación cubiertos

CA-HU06-1 a CA-HU06-5 · CA-HU12-1 a CA-HU12-4 (CA-HU12-1 parcial: la evaluación llega con FASE-06)

---

## 7. Verificación

```bash
pytest tests/ -k "session or history or topic" -v
pytest --cov=apps/tutoring_sessions --cov-report=term-missing
ruff check . && ruff format --check . && mypy .
```

**Resultado del 2026-10-22:** backend 1079 pruebas en verde, `ruff` y `mypy` sin hallazgos, cobertura de `apps/tutoring_sessions` del 97 %. Frontend: `eslint`, `tsc`, 485 pruebas de `vitest` y `next build` en verde.

---

## 8. Definition of Done

- [x] Plazo de edición (RF-052) confirmado y documentado. *(48 h; TRD RF-052, DDD RN-006.6; 2026-10-22)*
- [x] Relación uno a uno con la franja y con la reserva garantizada en base de datos. *(`OneToOneField` en `TutoringSession.slot` y `SessionAttendance.reservation`; `test_session_models.py` lo prueba con `IntegrityError`; 2026-10-22)*
- [x] Los 9 criterios de aceptación con prueba automatizada. *(CA-HU06-1 a 5 y CA-HU12-1 a 4 en `test_session_services.py` y `test_sessions_api.py`; CA-HU12-1 parcial: la evaluación llega con FASE-06; 2026-10-22)*
- [x] Registrar una sesión y cambiar el estado de las reservas ocurre en una sola transacción. *(`test_t_05_19_a_failure_midway_leaves_no_session_and_no_changed_reservation`; 2026-10-22)*
- [x] `Topic` es entidad, no texto libre — habilita RF-083 y FASE-08. *(modelo `Topic` por asignatura, único sin distinguir mayúsculas; 2026-10-22)*
- [x] Historial sin consultas N+1, con assert de número de consultas. *(3 consultas en el historial y 5 en el listado del monitor, sin importar el número de filas; `test_t_05_15_*`; 2026-10-22)*
- [x] Esquema OpenAPI y tipos del frontend actualizados. *(`spectacular --validate --fail-on-warn`; `npm run gen:api` y `npm run type-check` en verde; 2026-10-22)*
- [ ] CI en verde; PRs aprobadas.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Temas como texto libre | Decisión de modelado ya tomada en `DDD.md` §4.5; se verifica en el DoD |
| Sesión y cambio de estado de la reserva desacoplados | Una sola transacción; prueba de fallo intermedio |
| Historial lento con volumen real | `select_related`, `prefetch_related` y prueba de número de consultas |
| Registro de sesiones sobre monitorías que nunca ocurrieron | Regla RN-006.2 más auditoría de `recorded_at` |
| Catálogo de temas con duplicados por mayúsculas o espacios | Unicidad sin distinguir mayúsculas en base de datos y limpieza del nombre |

### 9.1 Deuda técnica

| Deuda | Motivo | Cierre propuesto |
|---|---|---|
| Ningún proceso pasa a `EXPIRED` las franjas que terminan sin sesión (DDD §6.1) | La búsqueda ya excluye las franjas pasadas por fecha, así que no afecta a ningún usuario en v1 | Tarea programada en FASE-10. Registrar en Jira (ADR-000-h) |

---

## 10. Siguiente fase

[FASE-06 · Evaluación del servicio](FASE-06-evaluaciones.md) — requiere cerrar la escala de calificación en ADR-013.
