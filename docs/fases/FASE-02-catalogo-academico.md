# FASE-02 · Catálogo académico

| Campo | Valor |
|---|---|
| Sprint | 2 (semanas 5–6) |
| Historias | HU-11 parcial — administración de asignaturas y asignaciones |
| Puntos | 5 |
| Estado | **Bloqueada** |
| ADR bloqueantes | ADR-008 (roles) |
| Requisitos | RF-022, RF-023, RF-024 |

---

## 1. Objetivo

Que exista el catálogo académico sobre el cual todo lo demás se apoya: asignaturas, cursos por período, docente responsable y monitores autorizados por asignatura.

**Resultado observable:** un administrador crea la asignatura "Cálculo Diferencial", la ofrece en el período 2026-1 con un docente asignado, y autoriza a un monitor para atenderla.

**Por qué va antes de la disponibilidad:** un monitor no puede publicar franjas de una asignatura que no existe ni para la que no está autorizado (RN-003.5).

---

## 2. Gate de entrada

- [ ] FASE-01 cerrada con su DoD completa
- [ ] ADR-008 cerrado — se necesita el rol `MONITOR` y el rol `TEACHER` funcionando
- [ ] Confirmado el formato de `AcademicTerm` (por ejemplo `2026-1`)

---

## 3. Alcance

### Entra

- `Subject`: código único, nombre, créditos, estado activo.
- `AcademicTerm`: identificador del período, fechas de inicio y fin.
- `Course`: instancia de asignatura en un período, con docente y grupo.
- `MonitorAssignment`: autorización de un monitor sobre una asignatura en un período, con horas comprometidas.
- Endpoints de administración y de consulta.
- Pantallas de administración del catálogo.

### No entra

- Importación masiva desde sistemas institucionales (ADR-015).
- Prerrequisitos entre asignaturas o plan de estudios.
- Inscripción de estudiantes a cursos — el sistema no la necesita para la versión 1.

---

## 4. Contratos propuestos · `[PROPUESTA]`

| Método | Ruta | Rol |
|---|---|---|
| `GET` | `/api/v1/subjects/` | autenticado |
| `POST` | `/api/v1/subjects/` | admin |
| `GET/PATCH` | `/api/v1/subjects/{id}/` | autenticado / admin |
| `GET/POST` | `/api/v1/terms/` | admin |
| `GET/POST` | `/api/v1/courses/` | admin |
| `GET` | `/api/v1/courses/mine/` | docente |
| `GET/POST` | `/api/v1/monitor-assignments/` | admin |
| `DELETE` | `/api/v1/monitor-assignments/{id}/` | admin |

**Modelo:** ver [`../DDD.md`](../DDD.md) §4.2.

---

## 5. Plan de trabajo TDD

| # | Tarea | Prueba primero (G2) | Regla |
|---|---|---|---|
| T-02.1 | Modelo `Subject` | Código duplicado es rechazado | — |
| T-02.2 | Modelo `AcademicTerm` | Fecha de fin anterior a la de inicio es rechazada | — |
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
<comando de pruebas> tests/ -k "subject or course or assignment" -v
<comando de pruebas> --cov=apps/academics --cov-report=term-missing
ruff check . && mypy .
```

---

## 8. Definition of Done

- [ ] Las cuatro entidades existen con sus restricciones de unicidad en base de datos.
- [ ] Escritura restringida a administrador, con prueba de `403` por rol.
- [ ] Un monitor sin asignación no puede operar sobre esa asignatura.
- [ ] Esquema OpenAPI y tipos del frontend actualizados.
- [ ] Datos semilla mínimos documentados para desarrollo (sin datos reales de personas).
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
