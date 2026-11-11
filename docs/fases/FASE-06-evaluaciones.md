# FASE-06 · Evaluación del servicio

| Campo | Valor |
|---|---|
| Sprint | 6 (semanas 13–14) |
| Historias | HU-07 Evaluación de monitoría (5 pts) |
| Puntos | 5 |
| Estado | **En revisión** — backend y frontend implementados el 2026-11-10; pendientes CI y aprobación de PRs |
| ADR bloqueantes | Ninguno — escala y mínimo de publicación de ADR-013, y privacidad de RF-062, confirmados el 2026-11-10 por el dueño de producto (el resto de ADR-013 sigue abierto para FASE-09) |
| Requisitos | RF-060 a RF-063 |

---

## 1. Objetivo

Que el estudiante califique y comente la monitoría recibida, y que esa retroalimentación produzca una valoración por monitor.

**Resultado observable:** tras una sesión `COMPLETED`, el estudiante la califica una sola vez; la valoración promedio del monitor se actualiza y solo se publica si supera el mínimo de evaluaciones acordado.

---

## 2. Gate de entrada

- [ ] FASE-05 cerrada con su DoD completa — *implementada y en revisión (pendientes CI y PRs); FASE-06 avanza en paralelo, como hicieron las fases anteriores*
- [x] **Escala de calificación confirmada** (ADR-013): **entero de 1 a 5**; fuera de rango → `400`. Comentario opcional de hasta 500 caracteres *(dueño de producto, 2026-11-10)*
- [x] **Mínimo de evaluaciones para publicar un promedio**: **2**. Con menos, "sin datos suficientes": no se expone el promedio a nadie, tampoco al monitor *(dueño de producto, 2026-11-10)*
- [x] **Decisión de privacidad confirmada** (RF-062): las evaluaciones son **anónimas para el monitor**. Ninguna respuesta visible para un monitor u otro estudiante expone la identidad (id, nombre, correo) del autor de una evaluación individual *(dueño de producto, 2026-11-10)*

> La escala no es un detalle de interfaz. Cambiarla después de recoger datos invalida todo el histórico y rompe las métricas de FASE-09. Por eso bloquea.

---

## 3. Alcance

### Entra

- Modelo `Evaluation` con unicidad por sesión y estudiante.
- Validación de la escala confirmada.
- Cálculo de la valoración promedio por monitor.
- Umbral mínimo de evaluaciones para publicar.
- Anonimización según la decisión de RF-062.
- Pantalla de evaluación y visualización de la valoración del monitor.

### No entra

- Panel administrativo de valoraciones — es FASE-09.
- Respuesta del monitor a un comentario (fuera de alcance de la versión 1).
- Moderación de comentarios ofensivos — se registra como deuda técnica.
- Recordatorios automáticos para evaluar (evento de dominio documentado, no implementado).

---

## 4. Diseño · `[CONFIRMADO]` 2026-11-10

App nueva `apps/evaluations`, con la misma estructura de FASE-05: reglas puras en `domain/rules.py`, casos de uso en `services.py`, lecturas en `selectors.py`. Mismo formato de error (SAD §6.3): reglas `400`, autorización `403`, estado `409`.

### 4.1 Modelo

**`Evaluation`** — la calificación de un estudiante sobre una sesión a la que asistió.

| Campo | Tipo | Regla |
|---|---|---|
| `id` | UUID | — |
| `session` | FK `TutoringSession` | La sesión de la franja (una por franja, FASE-05) |
| `student` | FK `User` | Autor; nunca llega al monitor (RF-062) |
| `rating` | Entero 1–5 | `CheckConstraint` en base de datos (RN-007.4) |
| `comment` | Texto ≤ 500 | Opcional, sin espacios sobrantes; mismo límite que la nota de la reserva |
| `created_at` | Marca de tiempo UTC | — |

Restricciones: `UniqueConstraint(session, student)` (RN-007.2), que también sirve de índice de las evaluaciones de una sesión.

### 4.2 Reglas

| ID | Regla | Error |
|---|---|---|
| RN-007.1 | Solo evalúa el estudiante cuya reserva quedó `COMPLETED` en la sesión (asistencia `ATTENDED`) | `400` |
| RN-007.2 | Una evaluación por sesión y estudiante, garantizada en base de datos | `409` `already_evaluated` |
| RN-007.3 | Una asistencia `NO_SHOW` no se evalúa | `400` (CA-HU07-5) |
| RN-007.4 | Calificación entera de 1 a 5 | `400` (CA-HU07-4) |
| RN-007.5 | El promedio se publica a partir de 2 evaluaciones (`EVALUATION_MIN_TO_PUBLISH`) | — |
| CA-HU07-3 | Quien no tiene asistencia marcada en la sesión (otro estudiante, el monitor, una cancelación tardía) o ya no tiene el rol Estudiante (RN-002) | `403` |

El promedio es una sola consulta agregada (`AVG` redondeado a 2 decimales en la base de datos) sobre las evaluaciones de las sesiones del monitor.

### 4.3 Contratos

| Método | Ruta | Rol | Respuestas |
|---|---|---|---|
| `POST` | `/api/v1/evaluations/` | estudiante que asistió | `201` · `400` escala, sesión inexistente o `NO_SHOW` · `403` · `409` ya evaluada |
| `GET` | `/api/v1/evaluations/mine/` | estudiante (las propias) | `200` paginado |
| `GET` | `/api/v1/monitors/{id}/rating/` | autenticado | `200` · `404` si el usuario no existe o no es monitor |
| `GET` | `/api/v1/tutoring-sessions/pending-evaluation/` | estudiante (las propias) | `200` paginado, mismo formato que el historial |

**Cuerpo:**

```json
{ "session_id": "uuid", "rating": 5, "comment": "texto opcional" }
```

**Respuesta de la valoración:**

```json
{ "monitor": { "id": "uuid", "full_name": "Sofía Díaz" }, "published": true,
  "average": 4.5, "evaluation_count": 12, "minimum_evaluations": 2 }
```

Por debajo del mínimo: `published: false`, `average: null` y `evaluation_count: null` (el conteo también se oculta: con una sola evaluación, el monitor sabría que hay un único autor posible entre pocos asistentes).

**Privacidad (RF-062):** la valoración es solo un agregado; no incluye identidades ni comentarios. La versión 1 **no muestra los comentarios al monitor**: los documentos no lo exigen y, con pocas evaluaciones, un comentario sin firma puede identificar a su autor. Las vistas de sesión del monitor (FASE-05) no incluyen evaluaciones. El estudiante lee solo las suyas (`/evaluations/mine/` y el campo `evaluation` de su historial, que deja de ser `null` cuando evaluó).

**Frontend:** el historial del estudiante permite evaluar en el lugar cada monitoría a la que asistió y muestra su propia evaluación; avisa cuántas quedan por evaluar. La valoración del monitor aparece en el panel de franjas de cada monitor (vista de asignatura) y en la pantalla Sesiones del propio monitor.

---

## 5. Plan de trabajo TDD

| # | Tarea | Prueba primero (G2) | Criterio / Regla |
|---|---|---|---|
| T-06.1 | Modelo `Evaluation` | Unicidad `(session, student)` garantizada en base de datos | RN-007.2 |
| T-06.2 | Validación de escala | Valor fuera de la escala → `400` | CA-HU07-4, RN-007.4 |
| T-06.3 | Solo sesiones completadas | Sesión no `COMPLETED` → rechazo | CA-HU07-1, RN-007.1 |
| T-06.4 | Evaluación duplicada | `409` | CA-HU07-2 |
| T-06.5 | Evaluación de sesión ajena | `403` | CA-HU07-3 |
| T-06.6 | Sesión `NO_SHOW` | No se puede evaluar | CA-HU07-5, RN-007.3 |
| T-06.7 | Cálculo del promedio | Promedio correcto sobre n evaluaciones | RF-063 |
| T-06.8 | Umbral de publicación | Por debajo del mínimo devuelve "sin datos suficientes" | RN-007.5 |
| T-06.9 | Privacidad de la autoría | Según RF-062: el monitor no accede a la identidad individual | RF-062 |
| T-06.10 | Pendientes de evaluar | El estudiante ve sus sesiones sin evaluar | — |
| T-06.11 | Frontend: formulario de evaluación | Escala, comentario y estado ya evaluado | — |
| T-06.12 | Frontend: valoración del monitor | Promedio o "sin datos suficientes" | — |

---

## 6. Criterios de aceptación cubiertos

CA-HU07-1 a CA-HU07-5

---

## 7. Verificación

```bash
<comando de pruebas> tests/ -k "evaluation or rating" -v
<comando de pruebas> --cov=apps/evaluations --cov-report=term-missing
ruff check . && mypy .
```

**Resultado del 2026-11-10:** backend 1181 pruebas en verde y una falla ajena a la fase (`test_base_settings_print_emails_to_the_console_by_default`, que también falla sin estos cambios porque el `.env` local define otro `EMAIL_BACKEND`); `ruff check`, `ruff format --check` y `mypy` sin hallazgos; `manage.py check` y `makemigrations --check` limpios; cobertura total del 98 % y de `apps/evaluations` del 99 %. Frontend: `eslint`, `tsc` y 506 pruebas de `vitest` en verde.

---

## 8. Definition of Done

- [x] Escala, umbral mínimo y política de privacidad confirmados y documentados. *(§2 y §4; confirmación parcial de ADR-013 en `DECISIONES-ABIERTAS.md`; 2026-11-10)*
- [x] Unicidad `(session, student)` garantizada en base de datos. *(`evaluations_unique_session_student`; `test_evaluation_models.py` lo prueba con `IntegrityError` y la carrera termina en `409`; 2026-11-10)*
- [x] Los 5 criterios de aceptación con prueba automatizada. *(CA-HU07-1 a 5 en `test_evaluation_services.py` y `test_evaluations_api.py`; 2026-11-10)*
- [x] El promedio se calcula con consulta agregada, no en Python sobre todo el conjunto. *(`test_t_06_7_the_average_is_one_aggregate_query`: una sola consulta con `AVG`; 2026-11-10)*
- [x] La respuesta de valoración nunca expone identidades si RF-062 lo prohíbe. *(`test_t_06_9_*`: ni id, nombre, correo ni comentario de los autores en la valoración, las vistas de sesión del monitor ni los listados de otro estudiante; 2026-11-10)*
- [x] Esquema OpenAPI y tipos del frontend actualizados. *(`spectacular --validate --fail-on-warn`; `npm run gen:api` y `npm run type-check` en verde; 2026-11-10)*
- [ ] CI en verde; PRs aprobadas.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Escala cambiada después de recoger datos | Gate de entrada bloqueante |
| Promedios engañosos con una o dos evaluaciones | Umbral mínimo confirmado en ADR-013 |
| Identidad del evaluador filtrada en la respuesta | Prueba explícita sobre la forma de la respuesta |
| Cálculo del promedio en memoria | Agregación en base de datos; revisión en PR |
| Comentarios ofensivos sin moderación | Deuda técnica registrada en Jira |

### 9.1 Deuda técnica

| Deuda | Motivo | Cierre propuesto |
|---|---|---|
| Moderación de comentarios | Fuera de alcance de la versión 1 (§3); hoy los comentarios solo los lee su autor | Registrar en Jira (ADR-000-h) antes de mostrar comentarios a terceros |
| Evento `EvaluationSubmitted` y recordatorio para evaluar | Documentados en DDD §7; el promedio se calcula al leer, así que no hay nada que recalcular | Cuando FASE-09 lo necesite |

---

## 10. Siguiente fase

[FASE-07 · Repositorio académico](FASE-07-materiales.md) o [FASE-08 · Seguimiento docente](FASE-08-seguimiento-docente.md), según la prioridad del sprint.
