# FASE-08 · Seguimiento docente

| Campo | Valor |
|---|---|
| Sprints | 6 y 7 (semanas 13–16) |
| Historias | HU-09 Seguimiento docente (8 pts) |
| Puntos | 8 |
| Estado | **En revisión** — backend y frontend implementados el 2026-11-10; pendientes CI y aprobación de PRs |
| ADR bloqueantes | Ninguno — ADR-008 confirmado; definición de RF-083 confirmada el 2026-11-10 por el dueño de producto (opción A) |
| Requisitos | RF-080 a RF-083 |

---

## 1. Objetivo

Que el docente consulte los monitores de sus cursos, las sesiones realizadas, los estudiantes atendidos y las dificultades más frecuentes, para tomar decisiones pedagógicas informadas.

**Resultado observable:** un docente entra a su panel y ve que en su curso se realizaron 24 sesiones, con 18 estudiantes atendidos, y que el tema más recurrente fue "límites laterales".

---

## 2. Gate de entrada

- [ ] FASE-05 cerrada — *implementada y en revisión (pendientes CI y PRs); FASE-08 avanza en paralelo, como hicieron las fases anteriores*
- [ ] FASE-02 cerrada — *implementada y en revisión; los cursos con docente asignado existen desde esa fase*
- [x] **RF-083 confirmado** (opción A): una "dificultad frecuente" es un `Topic` de los más repetidos en las sesiones de los cursos del docente, agrupados y ordenados por frecuencia (número de sesiones descendente; a igual frecuencia, por nombre sin distinguir mayúsculas y luego por id, para un orden determinista). Se calcula con una agregación en base de datos y **no** añade campos ni migraciones a `TutoringSession` *(dueño de producto, 2026-11-10)*

### La pregunta de RF-083 · `[CONFIRMADO]` 2026-11-10: opción A

| Interpretación | Implicación técnica |
|---|---|
| **Los `Topic` más repetidos en las sesiones** — *elegida* | Directo: agregación por frecuencia |
| Los temas con peor calificación asociada | Requiere cruzar con evaluaciones |
| Observaciones marcadas explícitamente como dificultad | Requiere un campo nuevo en `TutoringSession` |

> La tercera interpretación exigía una migración adicional; por eso la decisión bloqueaba. Con la opción A no hay migraciones: el catálogo de temas de FASE-05 ya permite contar.

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

## 4. Diseño y contratos · `[CONFIRMADO]` 2026-11-10

App nueva `apps/analytics`, el contexto **Análisis** del DDD (§3) y de la estructura del SAD, que FASE-09 reutilizará para las métricas. No tiene tablas: todas las cifras son agregaciones sobre los demás contextos. Sigue la estructura de FASE-05 y FASE-06: reglas puras en `domain/rules.py`, lecturas en `selectors.py`, formas en `serializers.py`. No hay `services.py` porque la fase es de solo lectura. Las rutas se montan en `/api/v1/teaching/`, como proponía este documento.

### 4.1 Pertenencia de una sesión a un curso

Una sesión pertenece a un curso cuando **la franja de la sesión tiene la asignatura y el período del curso**. Es la misma regla con la que FASE-05 deja al docente leer una sesión (`sees_everything`). Las franjas no se asocian a un grupo, así que todos los grupos de una asignatura en un período comparten sus sesiones: un docente con dos grupos de la misma asignatura ve las mismas sesiones en ambos, y los estudiantes se cuentan una sola vez.

Los monitores de un curso son las `MonitorAssignment` de su asignatura y período (la misma fuente que `GET /courses/mine/`, T-02.8).

### 4.2 Contratos

Todos son `GET`, solo para el rol `TEACHER` (estudiante, monitor y administrador sin rol docente → `403`; sin sesión → `401`; cualquier otro método → `405`). Los listados son paginados (`count`, `next`, `previous`, `results`; `page` y `page_size` ≤ 100).

| Ruta | Filtros | Respuesta (cada elemento) | Requisito |
|---|---|---|---|
| `/api/v1/teaching/courses/` | `term` | `id`, `subject{id,code,name}`, `term`, `group`, `monitor_count`, `session_count`, `student_count` | Panel |
| `/api/v1/teaching/courses/{id}/` | — | El mismo objeto, para un curso propio de cualquier período | Panel |
| `/api/v1/teaching/monitors/` | `course`, `term` | `id`, `full_name`, `email`, `subject`, `term`, `committed_hours`, `session_count` | RF-080, CA-HU09-1 |
| `/api/v1/teaching/sessions/` | `course`, `term`, `date_from`, `date_to` | `id`, `starts_at`, `ends_at`, `subject`, `term`, `monitor{id,full_name}`, `topics[{id,name}]`, `students[{full_name}]`, `duration_minutes` | RF-081, CA-HU09-2 |
| `/api/v1/teaching/students/` | `course`, `term` | `full_name`, `session_count`, `last_attended_at`; `count` es el número de estudiantes distintos | RF-082 |
| `/api/v1/teaching/frequent-topics/` | `course`, `term` | `id`, `name`, `subject`, `session_count` | RF-083, CA-HU09-4 |

**Alcance de la consulta.** Con `course`, solo ese curso, que debe ser del docente; si no lo es, o no existe, la respuesta es `403` con el mismo mensaje ("Solo puedes consultar tus propios cursos."), para no revelar qué ids existen. `course` manda sobre `term`. Sin `course`, todos los cursos del docente en `term`, o en el período actual si no se indica. El filtro siempre se aplica en la consulta del servidor.

**Fechas.** `date_from` y `date_to` son días completos en hora de Bogotá, ambos incluidos, sobre el inicio de la franja; un rango invertido responde `400` en `date_to`.

**Privacidad (RNF-SEC-004, RF-062).** Del estudiante solo sale el nombre, y solo si asistió (`ATTENDED`): ni id, ni correo, ni inasistencias. Ninguna respuesta lleva evaluaciones, calificaciones ni las observaciones del monitor. El correo del monitor sí se expone, como ya hacía `GET /courses/mine/` para el docente.

**Rendimiento (RNF-PER-002).** Los conteos son subconsultas o `COUNT` agrupados en SQL y cada listado hace un número fijo de consultas, sin importar el número de filas.

### 4.3 Desviaciones respecto a la propuesta

- Se añade `GET /teaching/courses/{id}/` para leer los indicadores de un curso propio y dar a la ruta de cursos su prueba de acceso ajeno (`403`).
- Todos los listados aceptan `term`, porque sin curso hace falta un período; `frequent-topics` y `students` también aceptan `course`.
- `students` es un listado paginado y no un número suelto: su `count` es el conteo distinto (RF-082) y los resultados dan el nombre y las asistencias de cada estudiante.

### 4.4 Frontend

Ruta `/seguimiento`, solo para docentes (`RequireSession roles={["TEACHER"]}`) y enlazada en la navegación lateral como "Seguimiento". El panel elige período y curso (guardados en la URL como `periodo` y `curso`), muestra los indicadores del curso, las dificultades frecuentes, los monitores, los estudiantes atendidos y la tabla de sesiones filtrable por fechas y paginada.

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

**Resultado del 2026-11-10:** backend 1281 pruebas en verde (159 con `-k "teaching or teacher"`, con cobertura del 100 % en `apps/analytics`); `ruff check`, `ruff format --check` y `mypy` sin hallazgos; `manage.py check`, `makemigrations --check` y `spectacular --validate --fail-on-warn` limpios. Frontend: `eslint`, `tsc` y 530 pruebas de `vitest` (70 archivos) en verde.

**Verificación manual obligatoria:** con dos docentes y dos cursos distintos, comprobar que ninguno ve datos del otro.

---

## 8. Definition of Done

- [x] RF-083 confirmado y documentado. *(§2 y §4; `TRD.md` y `DECISIONES-ABIERTAS.md`; 2026-11-10)*
- [x] **Cada endpoint tiene prueba de acceso a curso ajeno devolviendo `403`.** *(`test_t_08_2_*` en `test_teaching_api.py`: curso de otro docente, curso sin docente y curso inexistente, por endpoint; 2026-11-10)*
- [x] Los 4 criterios de aceptación con prueba automatizada. *(CA-HU09-1 a 4 en `test_teaching_api.py`; 2026-11-10)*
- [x] Agregaciones resueltas en base de datos, verificado por número de consultas. *(`test_t_08_9_query_count_does_not_grow_with_rows`, por endpoint; 2026-11-10)*
- [x] Las respuestas no exponen datos personales innecesarios del estudiante. *(`test_t_08_10_*`: sin id ni correo del estudiante, sin inasistencias, evaluaciones ni observaciones; 2026-11-10)*
- [x] Endpoints de solo lectura: ninguno modifica datos. *(`405` para POST/PUT/PATCH/DELETE y ninguna escritura SQL al leer; 2026-11-10)*
- [x] Esquema OpenAPI y tipos del frontend actualizados. *(`spectacular --validate --fail-on-warn`; `npm run gen:api` y `npm run type-check` en verde; 2026-11-10)*
- [ ] Verificación manual con dos docentes y dos cursos distintos.
- [ ] CI en verde; PRs aprobadas.

---

## 9. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Un docente accede a datos de cursos ajenos | **Alto — fuga de datos personales** | Prueba de `403` obligatoria por endpoint |
| Filtrado por curso hecho en el frontend | Alto | El filtro se aplica siempre en la consulta del servidor |
| Agregaciones lentas con volumen real | Medio | Agregación en SQL, índice sobre `recorded_at` |
| "Dificultad frecuente" interpretada libremente | Medio | Gate de entrada: RF-083 confirmado (opción A, 2026-11-10) |
| Dos grupos de la misma asignatura y período comparten sesiones | Bajo | Documentado en §4.1: las franjas no tienen grupo; se acepta, igual que en FASE-05 |

---

## 10. Siguiente fase

[FASE-09 · Métricas administrativas](FASE-09-metricas.md)
