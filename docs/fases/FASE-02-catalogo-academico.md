# FASE-02 · Catálogo académico

| Campo | Valor |
|---|---|
| Sprint | 2 (semanas 5–6) |
| Historias | HU-11 parcial — administración de asignaturas y asignaciones |
| Puntos | 5 |
| Estado | **En curso** |
| ADR bloqueantes | Ninguno — ADR-008 (roles) cerrado el 2026-09-27 |
| Requisitos | RF-022, RF-023, RF-024 |

---

## 1. Objetivo

Que exista el catálogo académico sobre el cual todo lo demás se apoya: asignaturas, cursos por período, docente responsable y monitores autorizados por asignatura.

**Resultado observable:** un administrador crea la asignatura "Cálculo Diferencial", la ofrece en el período 2026-1 con un docente asignado, y autoriza a un monitor para atenderla.

**Por qué va antes de la disponibilidad:** un monitor no puede publicar franjas de una asignatura que no existe ni para la que no está autorizado (RN-003.5).

---

## 2. Gate de entrada

- [ ] FASE-01 cerrada con su DoD completa — *pendiente de la aprobación de la PR #15. Por decisión del equipo (2026-09-29) FASE-02 avanza en paralelo; el catálogo solo depende de los roles de ADR-008, ya implementados.*
- [x] ADR-008 cerrado — se necesita el rol `MONITOR` y el rol `TEACHER` funcionando
- [x] Confirmado el formato de `AcademicTerm`: `AAAA-S`, donde `S` es el semestre, `1` o `2` (por ejemplo `2026-1`) — `[CONFIRMADO]` 2026-09-29

---

## 3. Alcance

### Entra

- `Department`: código único (por ejemplo `MAT`), nombre único, estado activo. Toda asignatura pertenece a un departamento — `[CONFIRMADO]` 2026-09-29.
- `Subject`: código único, nombre, créditos, departamento, estado activo.
- `AcademicTerm`: identificador del período con formato `AAAA-S`, fechas de inicio y fin.
- `Course`: instancia de asignatura en un período, con docente y grupo.
- `MonitorAssignment`: autorización de un monitor sobre una asignatura en un período, con horas comprometidas.
- Endpoints de administración y de consulta.
- Comando de datos semilla `seed_catalog` para desarrollo.
- Pantallas de administración del catálogo.

### No entra

- Importación masiva desde sistemas institucionales (ADR-015).
- Prerrequisitos entre asignaturas o plan de estudios.
- Inscripción de estudiantes a cursos — el sistema no la necesita para la versión 1.
- Auditoría de cambios del catálogo: `AuditLog` (FASE-01) solo registra operaciones sobre cuentas y su restricción `CHECK` limita las acciones; ampliarlo exige migrar `apps/accounts` y se decidirá aparte.

---

## 4. Contratos · `[CONFIRMADO]` (2026-09-29)

Confirmados por el equipo el 2026-09-29, incluida la entidad `Department` y los parámetros de consulta.

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/api/v1/departments/` | autenticado |
| `POST` | `/api/v1/departments/` | admin |
| `GET/PATCH` | `/api/v1/departments/{id}/` | autenticado / admin |
| `GET` | `/api/v1/subjects/` | autenticado |
| `POST` | `/api/v1/subjects/` | admin |
| `GET/PATCH` | `/api/v1/subjects/{id}/` | autenticado / admin |
| `GET` | `/api/v1/terms/` | autenticado (ver nota) |
| `POST` | `/api/v1/terms/` | admin |
| `GET` | `/api/v1/terms/current/` | autenticado |
| `GET/POST` | `/api/v1/courses/` | admin |
| `GET/PATCH` | `/api/v1/courses/{id}/` | admin |
| `GET` | `/api/v1/courses/mine/` | docente |
| `GET/POST` | `/api/v1/monitor-assignments/` | admin |
| `DELETE` | `/api/v1/monitor-assignments/{id}/` | admin |
| `GET` | `/api/v1/catalog/summary/` | admin |

Sin credenciales todas responden `401`; con un rol que no corresponde, `403`. Los listados usan la paginación estándar (`page`, `page_size`).

**Nota sobre `GET /terms/`:** el contrato original lo reservaba al administrador. Se abre a cualquier usuario autenticado porque el selector de período de docentes y estudiantes necesita la lista; crear períodos sigue siendo exclusivo del administrador. Necesidad confirmada el 2026-09-29.

**Período por defecto:** donde se acepta `?term=<código>`, si no se envía se usa el período actual: el que contiene la fecha de hoy; si ninguno la contiene, el más reciente ya terminado; si no hay ninguno pasado, el próximo en empezar. Un código inexistente responde `400`.

**Parámetros de consulta:**

| Ruta | Parámetros |
|---|---|
| `/departments/` | `active` (`true`/`false`) |
| `/subjects/` | `search` (código o nombre), `department` (id o código), `active` (`true`/`false`; otro valor → `400`), `credits`, `term` (para `monitor_count`), `has_monitors` (`true`/`false`), `ordering` (`code`, `name`, `-monitor_count`; por defecto `name`) |
| `/courses/` | `term`, `department` (id o código), `search` (asignatura, nombre o correo del docente), `without_teacher` (`true`/`false`), `without_monitors` (`true`/`false`), `ordering` (`code`, `name`, `-monitor_count`; por defecto `name`) |
| `/courses/mine/` | `term` |
| `/monitor-assignments/` | `term`, `subject` (id), `monitor` (id), `search` (monitor o asignatura) |
| `/catalog/summary/` | `term` |

Quien no es administrador solo ve departamentos y asignaturas activos, sin importar los parámetros.

**Modelo:** ver [`../DDD.md`](../DDD.md) §4.2.

---

## 5. Plan de trabajo TDD

| # | Tarea | Prueba primero (G2) | Regla |
|---|---|---|---|
| T-02.0 | Modelo `Department` | Código o nombre duplicado es rechazado; una asignatura no puede quedar sin departamento | — |
| T-02.1 | Modelo `Subject` | Código duplicado es rechazado | — |
| T-02.2 | Modelo `AcademicTerm` | Fecha de fin anterior a la de inicio es rechazada; un código fuera del formato `AAAA-S` es rechazado | — |
| T-02.3 | Modelo `Course` | Curso duplicado por `(subject, term, group)` es rechazado | — |
| T-02.4 | Modelo `MonitorAssignment` | Asignación duplicada por `(monitor, subject, term)` es rechazada | — |
| T-02.5 | Validación de rol en asignaciones | Asignar como monitor a alguien sin ese rol falla | RN-002 |
| T-02.6 | CRUD de asignaturas | Admin escribe; usuario autenticado solo lee; anónimo recibe `401` | RNF-SEC-003 |
| T-02.7 | Desactivación de asignatura | Una asignatura inactiva no admite franjas nuevas | — |
| T-02.8 | Consulta de cursos del docente | El docente solo ve los suyos | RN-009.1 |
| T-02.9 | Frontend: administración del catálogo | Listado, alta y edición de asignaturas y cursos | — |
| T-02.10 | Frontend: asignación de monitores | Buscar usuario, asignar asignatura y horas | — |

---

## 6. Criterios de aceptación cubiertos

Parte de CA-HU11-1 y CA-HU11-4. Habilita CA-HU05-5 (el monitor solo publica franjas de asignaturas asignadas).

---

## 7. Verificación

```bash
pytest tests/ -k "department or subject or term or course or assignment or catalog" -v
pytest --cov=apps/accounts --cov=apps/academics --cov-report=term-missing
ruff check . && ruff format --check . && mypy .
```

---

## 8. Definition of Done

- [ ] Las cinco entidades (`Department`, `Subject`, `AcademicTerm`, `Course`, `MonitorAssignment`) existen con sus restricciones de unicidad en base de datos.
- [ ] Escritura restringida a administrador, con prueba de `403` por rol.
- [ ] Un monitor sin asignación no puede operar sobre esa asignatura.
- [ ] Esquema OpenAPI y tipos del frontend actualizados.
- [ ] Datos semilla mínimos documentados para desarrollo (sin datos reales de personas): `python manage.py seed_catalog` (idempotente) crea seis departamentos de la FCEN, unas cuarenta asignaturas y los períodos `2026-1` y `2026-2`. No crea usuarios, cursos ni asignaciones.
- [ ] CI en verde; PRs aprobadas.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Modelar `Course` sin período académico | `AcademicTerm` es entidad propia desde el inicio |
| Confundir `Subject` con `Course` | Glosario normativo en `DDD.md` §2; revisión en PR |
| Catálogo vacío bloquea el desarrollo de FASE-03 | Datos semilla documentados como parte del DoD |

---

## 10. Siguiente fase

[FASE-03 · Disponibilidad y búsqueda](FASE-03-disponibilidad.md) — requiere cerrar ADR-010.
