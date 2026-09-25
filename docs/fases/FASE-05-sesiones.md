# FASE-05 · Sesiones e historial

| Campo | Valor |
|---|---|
| Sprint | 5 (semanas 11–12) |
| Historias | HU-06 Registro de sesión (8 pts) · HU-12 Historial del estudiante (3 pts) |
| Puntos | 11 |
| Estado | **Bloqueada** |
| ADR bloqueantes | ADR-010 · pendiente definir el plazo de edición (RF-052) |
| Requisitos | RF-050 a RF-053, RF-046 |

---

## 1. Objetivo

Que el monitor deje constancia verificable de lo trabajado en cada monitoría y que el estudiante consulte su historial completo.

**Resultado observable:** tras una monitoría, el monitor registra asistencia, temas y observaciones; la reserva pasa a `COMPLETED`; el estudiante ve esa sesión en su historial.

**Por qué importa más de lo que parece:** este registro es la evidencia que sostiene la acreditación institucional (Documentación base §1) y la materia prima de las métricas de FASE-09.

---

## 2. Gate de entrada

- [ ] FASE-04 cerrada con su DoD completa
- [ ] Confirmado el plazo máximo de edición de una sesión registrada (RF-052, hoy `[PENDIENTE]`)
- [ ] Confirmado si el catálogo de `Topic` es por asignatura o global

---

## 3. Alcance

### Entra

- Modelo `TutoringSession` en relación uno a uno con `Reservation`.
- Entidad `Topic` y su relación con la sesión.
- Registro de asistencia, temas, observaciones y material usado.
- Transición automática de la reserva a `COMPLETED` o `NO_SHOW`.
- Historial del estudiante, paginado.
- Historial del monitor.
- Pantallas de registro de sesión e historial.

### No entra

- Evaluación de la sesión — es FASE-06.
- Carga de archivos nuevos — es FASE-07; aquí solo se referencia material ya existente.
- Métricas agregadas — es FASE-09.
- Edición de sesiones fuera del plazo confirmado.

---

## 4. Contratos propuestos · `[PROPUESTA]`

| Método | Ruta | Rol |
|---|---|---|
| `POST` | `/api/v1/tutoring-sessions/` | monitor de la franja |
| `GET` | `/api/v1/tutoring-sessions/{id}/` | participantes o docente del curso |
| `PATCH` | `/api/v1/tutoring-sessions/{id}/` | monitor, dentro del plazo |
| `GET` | `/api/v1/tutoring-sessions/history/` | estudiante |
| `GET` | `/api/v1/tutoring-sessions/mine/` | monitor |
| `GET` | `/api/v1/topics/` | autenticado |

**Cuerpo del registro:**

```json
{
  "reservation_id": "uuid",
  "attendance": "ATTENDED",
  "topic_ids": ["uuid"],
  "notes": "texto",
  "material_ids": ["uuid"],
  "duration_minutes": 60
}
```

---

## 5. Plan de trabajo TDD

| # | Tarea | Prueba primero (G2) | Criterio / Regla |
|---|---|---|---|
| T-05.1 | Modelo `Topic` | Nombre único por asignatura | — |
| T-05.2 | Modelo `TutoringSession` | Relación uno a uno estricta con la reserva | RN-006.3 |
| T-05.3 | Regla: reserva confirmada | Sesión sobre reserva cancelada es rechazada | RN-006.1 |
| T-05.4 | Regla: la franja ya inició | Sesión sobre reserva futura → `400` | CA-HU06-2, RN-006.2 |
| T-05.5 | Registro válido | Sesión creada y asociada a la reserva | CA-HU06-1 |
| T-05.6 | Sesión duplicada | `409` | CA-HU06-3 |
| T-05.7 | Inasistencia | Reserva pasa a `NO_SHOW`; no admite evaluación | CA-HU06-4 |
| T-05.8 | Asistencia | Reserva pasa a `COMPLETED` | RN-006.5 |
| T-05.9 | Autorización del monitor | Monitor ajeno → `403` | CA-HU06-5, RN-006.4 |
| T-05.10 | Plazo de edición | Fuera del plazo confirmado → rechazo | RN-006.6, RF-052 |
| T-05.11 | Historial del estudiante | Asignatura, fecha, monitor y evaluación | CA-HU12-1 |
| T-05.12 | Historial vacío | Lista vacía con `200` | CA-HU12-2 |
| T-05.13 | Historial ajeno | `403` | CA-HU12-3 |
| T-05.14 | Paginación del historial | Respuesta paginada | CA-HU12-4 |
| T-05.15 | Rendimiento del historial | Sin consultas N+1 al cargar asignatura y monitor | RNF-PER-002 |
| T-05.16 | Frontend: registro de sesión | Formulario con selección de temas y asistencia | — |
| T-05.17 | Frontend: historial | Listado paginado con filtros básicos | — |

---

## 6. Criterios de aceptación cubiertos

CA-HU06-1 a CA-HU06-5 · CA-HU12-1 a CA-HU12-4

---

## 7. Verificación

```bash
<comando de pruebas> tests/ -k "session or history or topic" -v
<comando de pruebas> --cov=apps/tutoring_sessions --cov-report=term-missing
ruff check . && mypy .
```

---

## 8. Definition of Done

- [ ] Plazo de edición (RF-052) confirmado y documentado.
- [ ] Relación uno a uno con la reserva garantizada en base de datos.
- [ ] Los 9 criterios de aceptación con prueba automatizada.
- [ ] Registrar una sesión y cambiar el estado de la reserva ocurre en una sola transacción.
- [ ] `Topic` es entidad, no texto libre — habilita RF-083 y FASE-08.
- [ ] Historial sin consultas N+1, con assert de número de consultas.
- [ ] Esquema OpenAPI y tipos del frontend actualizados.
- [ ] CI en verde; PRs aprobadas.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Temas como texto libre | Decisión de modelado ya tomada en `DDD.md` §4.5; se verifica en el DoD |
| Sesión y cambio de estado de la reserva desacoplados | Una sola transacción; prueba de fallo intermedio |
| Historial lento con volumen real | `select_related` y prueba de número de consultas |
| Registro de sesiones sobre monitorías que nunca ocurrieron | Regla RN-006.2 más auditoría de `recorded_at` |

---

## 10. Siguiente fase

[FASE-06 · Evaluación del servicio](FASE-06-evaluaciones.md) — requiere cerrar la escala de calificación en ADR-013.
