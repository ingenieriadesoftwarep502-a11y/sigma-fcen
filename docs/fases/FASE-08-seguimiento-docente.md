# FASE-08 · Seguimiento docente

| Campo | Valor |
|---|---|
| Sprints | 6 y 7 (semanas 13–16) |
| Historias | HU-09 Seguimiento docente (8 pts) |
| Puntos | 8 |
| Estado | **Bloqueada** |
| ADR bloqueantes | ADR-008 · RF-083 (definición de "dificultad frecuente") |
| Requisitos | RF-080 a RF-083 |

---

## 1. Objetivo

Que el docente consulte los monitores de sus cursos, las sesiones realizadas, los estudiantes atendidos y las dificultades más frecuentes, para tomar decisiones pedagógicas informadas.

**Resultado observable:** un docente entra a su panel y ve que en su curso se realizaron 24 sesiones, con 18 estudiantes atendidos, y que el tema más recurrente fue "límites laterales".

---

## 2. Gate de entrada

- [ ] FASE-05 cerrada — sin sesiones registradas no hay nada que consultar
- [ ] FASE-02 cerrada — se necesitan cursos con docente asignado
- [ ] **RF-083 confirmado**: ¿qué es exactamente una "dificultad frecuente"?

### La pregunta abierta de RF-083

| Interpretación | Implicación técnica |
|---|---|
| Los `Topic` más repetidos en las sesiones | Directo: agregación por frecuencia |
| Los temas con peor calificación asociada | Requiere cruzar con evaluaciones |
| Observaciones marcadas explícitamente como dificultad | Requiere un campo nuevo en `TutoringSession` |

> La tercera interpretación exige una migración adicional. Por eso esta decisión bloquea: no es un detalle de presentación.

---

## 3. Alcance

### Entra

- Consulta de monitores asignados a los cursos del docente.
- Consulta de sesiones realizadas en sus cursos, con filtros por período y asignatura.
- Conteo de estudiantes distintos atendidos.
- Agregación de dificultades frecuentes según la definición confirmada.
- Autorización estricta: el docente solo ve lo suyo.
- Panel de seguimiento en el frontend.

### No entra

- Métricas globales de la Facultad — es FASE-09.
- Exportación de reportes — se evalúa en FASE-09.
- Comunicación directa docente-monitor dentro del sistema.
- Intervención del docente sobre reservas o sesiones: esta fase es de **solo lectura**.

---

## 4. Contratos propuestos · `[PROPUESTA]`

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/api/v1/teaching/courses/` | docente |
| `GET` | `/api/v1/teaching/monitors/` | docente |
| `GET` | `/api/v1/teaching/sessions/?course=&date_from=&date_to=` | docente |
| `GET` | `/api/v1/teaching/students/` | docente |
| `GET` | `/api/v1/teaching/frequent-topics/?course=` | docente |

---

## 5. Plan de trabajo TDD

La autorización es el riesgo dominante de esta fase: se trata de datos de terceros. **Cada endpoint necesita su prueba de acceso ajeno.**

| # | Tarea | Prueba primero (G2) | Criterio / Regla |
|---|---|---|---|
| T-08.1 | Monitores de mis cursos | Solo los de los cursos del docente | CA-HU09-1 |
| T-08.2 | Acceso a curso ajeno | `403` | CA-HU09-3, RN-009.1 |
| T-08.3 | Sesiones de mis cursos | Fecha, monitor, estudiante y temas | CA-HU09-2 |
| T-08.4 | Filtros de sesiones | Por curso y por rango de fechas | — |
| T-08.5 | Estudiantes atendidos | Conteo distinto correcto, sin duplicados | RF-082 |
| T-08.6 | Dificultades frecuentes | Temas agrupados y ordenados por frecuencia | CA-HU09-4, RN-009.2 |
| T-08.7 | Curso sin sesiones | Resultado vacío con `200`, nunca error | — |
| T-08.8 | Rol incorrecto | Estudiante o monitor accediendo → `403` | RNF-SEC-004 |
| T-08.9 | Rendimiento de las agregaciones | Agregación en base de datos, sin consultas N+1 | RNF-PER-002 |
| T-08.10 | Privacidad de datos del estudiante | La respuesta no expone más datos personales de los necesarios | RNF-SEC-004 |
| T-08.11 | Frontend: panel del docente | Selección de curso y visualización de indicadores | — |
| T-08.12 | Frontend: listado de sesiones | Tabla filtrable y paginada | — |

---

## 6. Criterios de aceptación cubiertos

CA-HU09-1 a CA-HU09-4

---

## 7. Verificación

```bash
<comando de pruebas> tests/ -k "teaching or teacher" -v
<comando de pruebas> --cov=apps/analytics --cov-report=term-missing
ruff check . && mypy .
```

**Verificación manual obligatoria:** con dos docentes y dos cursos distintos, comprobar que ninguno ve datos del otro.

---

## 8. Definition of Done

- [ ] RF-083 confirmado y documentado.
- [ ] **Cada endpoint tiene prueba de acceso a curso ajeno devolviendo `403`.**
- [ ] Los 4 criterios de aceptación con prueba automatizada.
- [ ] Agregaciones resueltas en base de datos, verificado por número de consultas.
- [ ] Las respuestas no exponen datos personales innecesarios del estudiante.
- [ ] Endpoints de solo lectura: ninguno modifica datos.
- [ ] Esquema OpenAPI y tipos del frontend actualizados.
- [ ] CI en verde; PRs aprobadas.

---

## 9. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Un docente accede a datos de cursos ajenos | **Alto — fuga de datos personales** | Prueba de `403` obligatoria por endpoint |
| Filtrado por curso hecho en el frontend | Alto | El filtro se aplica siempre en la consulta del servidor |
| Agregaciones lentas con volumen real | Medio | Agregación en SQL, índice sobre `recorded_at` |
| "Dificultad frecuente" interpretada libremente | Medio | Gate de entrada: RF-083 confirmado |

---

## 10. Siguiente fase

[FASE-09 · Métricas administrativas](FASE-09-metricas.md)
