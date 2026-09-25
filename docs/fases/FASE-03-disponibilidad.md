# FASE-03 · Disponibilidad y búsqueda

| Campo | Valor |
|---|---|
| Sprint | 3 (semanas 7–8) |
| Historias | HU-05 Registro de disponibilidad (5 pts) · HU-02 Consulta de monitorías (5 pts) |
| Puntos | 10 |
| Estado | **Bloqueada** |
| ADR bloqueantes | ADR-010 |
| Requisitos | RF-030 a RF-034 |

---

## 1. Objetivo

Que un monitor publique sus franjas horarias y que un estudiante las encuentre filtrando por asignatura, horario y monitor.

**Resultado observable:** un monitor publica tres franjas para el martes; un estudiante filtra por esa asignatura y las ve, sin ver franjas pasadas ni ocupadas.

---

## 2. Gate de entrada

- [ ] FASE-02 cerrada con su DoD completa
- [ ] **ADR-010 cerrado** — sin duración de franja, capacidad y reglas de solapamiento confirmadas, el modelo se construye sobre suposiciones

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
- Detección y rechazo de solapamientos del mismo monitor.
- Creación, edición y eliminación de franjas propias.
- Búsqueda filtrada por asignatura, rango horario y monitor.
- Paginación e índices de consulta.
- Pantalla de gestión de disponibilidad del monitor.
- Pantalla de búsqueda del estudiante.

### No entra

- Reservar — es FASE-04.
- Recurrencia semanal si ADR-010 la deja `[PENDIENTE]`; en ese caso se registra como deuda y se implementa en FASE-10.
- Notificaciones.
- Sincronización con calendarios externos (fuera de alcance de la versión 1).

---

## 4. Contratos propuestos · `[PROPUESTA]`

| Método | Ruta | Rol | Notas |
|---|---|---|---|
| `POST` | `/api/v1/availability-slots/` | monitor | `400` si se solapa |
| `GET` | `/api/v1/availability-slots/mine/` | monitor | Franjas propias |
| `PATCH` | `/api/v1/availability-slots/{id}/` | monitor propietario | `409` si tiene reserva |
| `DELETE` | `/api/v1/availability-slots/{id}/` | monitor propietario | `409` si tiene reserva |
| `GET` | `/api/v1/availability-slots/search/` | autenticado | Filtros: `subject`, `monitor`, `date_from`, `date_to` |

**Modelo:** ver [`../DDD.md`](../DDD.md) §4.3.

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
