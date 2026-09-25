# FASE-06 · Evaluación del servicio

| Campo | Valor |
|---|---|
| Sprint | 6 (semanas 13–14) |
| Historias | HU-07 Evaluación de monitoría (5 pts) |
| Puntos | 5 |
| Estado | **Bloqueada** |
| ADR bloqueantes | ADR-013 (escala y mínimo de publicación) · RF-062 (privacidad) |
| Requisitos | RF-060 a RF-063 |

---

## 1. Objetivo

Que el estudiante califique y comente la monitoría recibida, y que esa retroalimentación produzca una valoración por monitor.

**Resultado observable:** tras una sesión `COMPLETED`, el estudiante la califica una sola vez; la valoración promedio del monitor se actualiza y solo se publica si supera el mínimo de evaluaciones acordado.

---

## 2. Gate de entrada

- [ ] FASE-05 cerrada con su DoD completa
- [ ] **Escala de calificación confirmada** (ADR-013) — 1 a 5, 1 a 10, u otra
- [ ] **Mínimo de evaluaciones para publicar un promedio** confirmado
- [ ] **Decisión de privacidad confirmada** (RF-062): ¿el monitor ve quién lo evaluó?

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

## 4. Contratos propuestos · `[PROPUESTA]`

| Método | Ruta | Rol |
|---|---|---|
| `POST` | `/api/v1/evaluations/` | estudiante participante |
| `GET` | `/api/v1/evaluations/mine/` | estudiante |
| `GET` | `/api/v1/monitors/{id}/rating/` | autenticado |
| `GET` | `/api/v1/tutoring-sessions/pending-evaluation/` | estudiante |

**Cuerpo:**

```json
{ "session_id": "uuid", "rating": 5, "comment": "texto opcional" }
```

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

---

## 8. Definition of Done

- [ ] Escala, umbral mínimo y política de privacidad confirmados y documentados.
- [ ] Unicidad `(session, student)` garantizada en base de datos.
- [ ] Los 5 criterios de aceptación con prueba automatizada.
- [ ] El promedio se calcula con consulta agregada, no en Python sobre todo el conjunto.
- [ ] La respuesta de valoración nunca expone identidades si RF-062 lo prohíbe.
- [ ] Esquema OpenAPI y tipos del frontend actualizados.
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

---

## 10. Siguiente fase

[FASE-07 · Repositorio académico](FASE-07-materiales.md) o [FASE-08 · Seguimiento docente](FASE-08-seguimiento-docente.md), según la prioridad del sprint.
