# FASE-03 · Disponibilidad y búsqueda

| Campo | Valor |
|---|---|
| Sprint | 3 (semanas 7–8) |
| Historias | HU-05 Registro de disponibilidad (5 pts) · HU-02 Consulta de monitorías (5 pts) |
| Puntos | 10 |
| Estado | **En curso** — diseño confirmado el 2026-10-11 |
| ADR bloqueantes | Ninguno — ADR-010 cerrado el 2026-10-11 |
| Requisitos | RF-030 a RF-034 |

---

## 1. Objetivo

Que un monitor publique sus franjas horarias y que un estudiante las encuentre filtrando por asignatura, horario y monitor.

**Resultado observable:** un monitor publica tres franjas para el martes; un estudiante filtra por esa asignatura y las ve, sin ver franjas pasadas ni ocupadas.

---

## 2. Gate de entrada

- [ ] FASE-02 cerrada con su DoD completa — *pendiente de la aprobación del PR #16; FASE-03 avanza en paralelo, como hizo FASE-02*
- [x] **ADR-010 cerrado** *(2026-10-11)* — sin duración de franja, capacidad y reglas de solapamiento confirmadas, el modelo se construye sobre suposiciones

Preguntas de ADR-010 que deben estar respondidas antes de la primera línea de código:

| # | Pregunta | Efecto si se asume mal |
|---|---|---|
| 1 | Duración de la sesión | Rehacer el modelo y todas las pruebas |
| 2 | Bloques fijos o rangos libres | Cambia el algoritmo de solapamiento |
| 3 | Capacidad de la franja | Cambia la invariante crítica de FASE-04 |
| 5 | Recurrencia semanal | Puede exigir una entidad nueva (`SlotTemplate`) |

---

## 3. Alcance

### Entra

- Modelo `AvailabilitySlot` con su máquina de estados.
- Modelo `SlotTemplate`: plantilla semanal que genera franjas concretas (ADR-010, condición c).
- Detección y rechazo de solapamientos del mismo monitor.
- Creación, edición y eliminación de franjas propias.
- Búsqueda filtrada por asignatura, rango horario y monitor.
- Paginación e índices de consulta.
- Pantalla de gestión de disponibilidad del monitor.
- Pantalla de búsqueda del estudiante.

### No entra

- Reservar — es FASE-04.
- Notificaciones.
- Sincronización con calendarios externos (fuera de alcance de la versión 1).

---

## 4. Diseño · `[CONFIRMADO]` 2026-10-11 — Nicolás García Orozco

Decisiones del gate G1: retirar una franja la **cancela** (no la borra); una plantilla con choques se **rechaza entera**; las franjas empiezan **en punto o a la media** (hora de Bogotá); modalidad **presencial o virtual**.

App nueva `apps/availability`. Reglas puras en `apps/availability/domain/rules.py`.

### 4.1 Modelo

**`AvailabilitySlot`** — la franja concreta, con fecha. Es lo que se busca y, en FASE-04, lo que se reserva.

| Campo | Tipo | Regla |
|---|---|---|
| `monitor` | FK `User` | Rol `MONITOR` y `MonitorAssignment` en `subject` + `term` (RN-003.5) |
| `subject` | FK `Subject` | Activa (T-02.7) |
| `term` | FK `AcademicTerm` | La franja cae dentro de las fechas del período |
| `template` | FK `SlotTemplate`, nulo | Plantilla que la generó; nulo si se publicó suelta |
| `starts_at`, `ends_at` | `DateTimeField` UTC | `ends_at - starts_at` = `SLOT_DURATION_MINUTES` (60); inicio en punto o a la media, hora de Bogotá (`SLOT_START_STEP_MINUTES` = 30) |
| `capacity` | Entero 1–20 | Por defecto `SLOT_DEFAULT_CAPACITY` (1) |
| `status` | `AVAILABLE` · `RESERVED` · `CANCELLED` · `EXPIRED` | Transiciones de DDD §6.1 |
| `modality` | `IN_PERSON` · `VIRTUAL` | — |
| `location` | Texto ≤ 200 | Obligatorio: aula o enlace |

Restricciones en base de datos: `CHECK (ends_at > starts_at)`, `CHECK (capacity BETWEEN 1 AND 20)` y **exclusión de solapamiento** por monitor sobre franjas no canceladas (`ExclusionConstraint` de PostgreSQL con `tstzrange`), además de la regla en el servicio. Índice `(subject, starts_at, status)`.

**`SlotTemplate`** — la plantilla semanal.

| Campo | Tipo | Regla |
|---|---|---|
| `monitor`, `subject`, `term` | FK | Mismas reglas que la franja |
| `weekday` | 0–6 (lunes = 0) | — |
| `start_time` | Hora local de Bogotá, en punto o a la media | — |
| `capacity`, `modality`, `location` | — | Se copian a cada franja generada |
| `is_active` | Booleano | Al desactivarla se cancelan sus franjas futuras sin reserva |

Al crear la plantilla se generan, en una sola transacción, las franjas de ese día y hora para cada semana desde hoy hasta el fin del período. **Si alguna choca con otra franja del monitor, no se crea nada** y la respuesta `400` lista las fechas en conflicto.

### 4.2 Contratos

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| `POST` | `/api/v1/availability-slots/` | monitor | Franja suelta. `400` si se solapa, está en el pasado o la asignatura no está asignada → `403` |
| `GET` | `/api/v1/availability-slots/mine/` | monitor | Franjas propias. Filtros: `term`, `subject`, `status`, `date_from`, `date_to` |
| `PATCH` | `/api/v1/availability-slots/{id}/` | monitor propietario | Cambia `starts_at`, `modality`, `location`, `capacity`. `409` si ya está `RESERVED` |
| `DELETE` | `/api/v1/availability-slots/{id}/` | monitor propietario | **Retira** la franja: pasa a `CANCELLED`, no se borra la fila. `409` si está `RESERVED` |
| `GET` | `/api/v1/availability-slots/search/` | autenticado | Solo `AVAILABLE` y futuras. Filtros: `subject`, `monitor`, `date_from`, `date_to`, `modality`; orden por `starts_at` |
| `POST` | `/api/v1/slot-templates/` | monitor | Crea la plantilla y genera sus franjas. `400` con las fechas en conflicto |
| `GET` | `/api/v1/slot-templates/mine/` | monitor | Plantillas propias, filtro `term` |
| `DELETE` | `/api/v1/slot-templates/{id}/` | monitor propietario | Desactiva la plantilla y cancela sus franjas futuras sin reserva |

Sin credenciales `401`; con otro rol `403`; sobre una franja ajena `404`. Las fechas viajan en ISO 8601 con zona; los filtros `date_from`/`date_to` son fechas locales de Bogotá. Listados con la paginación estándar.

### 4.3 Parámetros configurables (ADR-010, condición a)

| Parámetro | Valor | Usado en |
|---|---|---|
| `SLOT_DURATION_MINUTES` | 60 | FASE-03 |
| `SLOT_DEFAULT_CAPACITY` | 1 | FASE-03 |
| `SLOT_START_STEP_MINUTES` | 30 | FASE-03 |
| `RESERVATION_MIN_ADVANCE_HOURS` | 2 | FASE-04 |
| `RESERVATION_MAX_ACTIVE_PER_SUBJECT_WEEK` | 1 | FASE-04 |

### 4.4 Fuera de este diseño

`EXPIRED` se define en el modelo, pero el proceso que marca las franjas vencidas llega con FASE-05; mientras tanto, la búsqueda excluye las franjas pasadas por fecha. La regla de `409` por reserva se prueba con el estado `RESERVED`, porque `Reservation` aún no existe.

**Modelo de dominio:** ver [`../DDD.md`](../DDD.md) §4.3.

---

## 5. Plan de trabajo TDD

El corazón de esta fase es la **detección de solapamientos**, y es lógica pura: se prueba en `tests/unit/`, sin base de datos y en milisegundos.

| # | Tarea | Prueba primero (G2) | Criterio / Regla |
|---|---|---|---|
| T-03.1 | Regla de solapamiento en `domain/rules.py` | Tabla de casos: antes, después, contenido, contenedor, bordes exactos | RN-003.3 |
| T-03.2 | Regla de franja futura | Franja en el pasado es rechazada | RN-003.2 |
| T-03.3 | Regla `ends_at > starts_at` | Fin anterior o igual al inicio es rechazado | RN-003.1 |
| T-03.4 | Modelo `AvailabilitySlot` | Estados válidos; transiciones prohibidas rechazadas | DDD §6.1 |
| T-03.5 | Servicio de creación | Franja válida se crea; solapada lanza error de dominio | CA-HU05-1, CA-HU05-2 |
| T-03.6 | Autorización por asignatura asignada | Publicar en asignatura no asignada → `403` | CA-HU05-5, RN-003.5 |
| T-03.7 | Eliminación de franja | Sin reservas se elimina; con reserva se impide | CA-HU05-3, CA-HU05-4 |
| T-03.8 | Búsqueda: solo disponibles y futuras | Franjas pasadas y ocupadas no aparecen | CA-HU02-1 |
| T-03.9 | Filtro por asignatura | Solo franjas de esa asignatura | CA-HU02-2 |
| T-03.10 | Filtro por rango horario | Solo franjas dentro del rango | CA-HU02-3 |
| T-03.11 | Filtro por monitor | Solo franjas de ese monitor | CA-HU02-4 |
| T-03.12 | Resultado vacío | Lista vacía con `200`, nunca error | CA-HU02-5 |
| T-03.13 | Acceso no autenticado | `401` | CA-HU02-6 |
| T-03.14 | Rendimiento de la búsqueda | Sin consultas N+1; índice `(subject, starts_at, status)` | RNF-PER-001, RNF-PER-002 |
| T-03.15 | Zona horaria | Guardado en UTC, presentado en `America/Bogota` | RNF-DAT-001 |
| T-03.16 | Frontend: gestión de disponibilidad | Crear, listar y eliminar franjas | — |
| T-03.17 | Frontend: búsqueda | Filtros combinados y estado vacío | — |

### Casos de solapamiento que T-03.1 debe cubrir

```text
Franja existente:        [────────]
  a) antes, sin tocar  [──]              → permitido
  b) después, sin tocar         [──]     → permitido
  c) borde exacto      [──][────────]    → permitido (fin == inicio)
  d) inicio dentro         [────]        → RECHAZADO
  e) fin dentro       [────]             → RECHAZADO
  f) contenida             [──]          → RECHAZADO
  g) contenedora      [────────────]     → RECHAZADO
  h) idéntica          [────────]        → RECHAZADO
```

> Los casos (c), (d) y (e) son donde se rompe casi toda implementación ingenua. Escríbelos primero.

---

## 6. Criterios de aceptación cubiertos

CA-HU02-1 a CA-HU02-6 · CA-HU05-1 a CA-HU05-5

---

## 7. Verificación

```bash
<comando de pruebas> tests/unit/ -k "overlap" -v
<comando de pruebas> tests/ -k "availability or search" -v
<comando de pruebas> --cov=apps/availability --cov-report=term-missing
ruff check . && mypy .
```

---

## 8. Definition of Done

- [ ] ADR-010 cerrado y reflejado en TRD, DDD y esta ficha.
- [ ] Los 8 casos de solapamiento probados en `tests/unit/`, sin base de datos.
- [ ] Los 11 criterios de aceptación con prueba automatizada.
- [ ] Índices creados y verificados con `EXPLAIN` sobre la consulta de búsqueda.
- [ ] Sin consultas N+1 en el listado (assert de número de consultas).
- [ ] Todas las marcas de tiempo en UTC.
- [ ] Esquema OpenAPI y tipos del frontend actualizados.
- [ ] CI en verde; PRs aprobadas.

---

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Solapamiento implementado con comparaciones incompletas | Tabla de 8 casos como prueba obligatoria, escrita antes del código |
| Confusión entre zonas horarias | UTC en almacenamiento, conversión solo en presentación; prueba explícita |
| Búsqueda lenta con volumen realista | Índice compuesto + prueba con 1 000 franjas |
| Recurrencia semanal implementada sin confirmación | Si ADR-010 la deja pendiente, queda fuera y se registra en Jira |

---

## 10. Siguiente fase

[FASE-04 · Reservas y cancelación](FASE-04-reservas.md) — el núcleo del sistema.
