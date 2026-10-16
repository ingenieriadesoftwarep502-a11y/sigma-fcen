# FASE-04 · Reservas y cancelación

| Campo | Valor |
|---|---|
| Sprint | 4 (semanas 9–10) |
| Historias | HU-03 Reserva (8 pts) · HU-04 Cancelación (3 pts) |
| Puntos | 11 |
| Estado | **Bloqueada** |
| ADR bloqueantes | ADR-011 |
| Requisitos | RF-040 a RF-046 |

---

## 1. Objetivo

Que un estudiante reserve una franja disponible con garantía de que nadie más puede tomarla, y que pueda cancelarla dentro de la política definida liberando el espacio.

**Resultado observable:** dos estudiantes envían una reserva sobre el último cupo de una franja **en el mismo instante**; exactamente uno recibe `201` y el otro `409`. La base de datos nunca contiene más reservas confirmadas que la capacidad de la franja (ADR-010: la capacidad la elige el monitor; 1 = individual, >1 = grupal).

---

## 2. Por qué esta es la fase más importante

Todo lo demás del sistema es administración de datos con permisos. **Aquí hay concurrencia real, invariantes duras y estado que debe cambiar de forma atómica.** Si esta fase se hace mal, el sistema produce dobles reservas en producción — exactamente el problema que SIGMA-FCEN existe para eliminar (Documentación base §2).

Un `if` en el serializer **no** resuelve esto. Entre la comprobación y la escritura hay una ventana en la que otra petición puede colarse. Este es el problema clásico *check-then-act*.

---

## 3. Gate de entrada

- [ ] FASE-03 cerrada con su DoD completa
- [x] ADR-010 cerrado *(2026-10-11)* — capacidad de la franja, anticipación mínima, límite de reservas activas
- [ ] ADR-011 cerrado — ventana de cancelación, consecuencia de cancelar tarde, cancelación por el monitor

> Sin ADR-011, la pregunta "¿qué significa suficiente anticipación?" queda al criterio del implementador. Eso es inventar una regla de negocio, y está prohibido por el protocolo.

---

## 4. Alcance

### Entra

- Modelo `Reservation` con máquina de estados.
- **Restricción única parcial en base de datos** sobre `(franja, estudiante)` con estado `CONFIRMED`.
- Servicio de reserva transaccional con bloqueo de fila y conteo de reservas `CONFIRMED` frente a la capacidad.
- Transiciones de la franja por cupos: `AVAILABLE` → `RESERVED` al llenarse y `RESERVED` → `AVAILABLE` al cancelar una reserva de una franja llena.
- Validaciones de `apps/availability/services.py` por conteo de reservas `CONFIRMED` y cupos restantes en la búsqueda.
- Servicio de cancelación transaccional que libera la franja.
- Validación de solapamiento de reservas del propio estudiante.
- Consulta de reservas propias para estudiante y monitor.
- Traducción de conflictos a `409` con el formato de error del SAD §6.3.
- Pantallas de reserva, listado y cancelación.

### No entra

- Registro de lo ocurrido en la sesión — es FASE-05.
- Notificaciones por correo (se documentan como evento de dominio, no se implementan).
- Lista de espera sobre franjas ocupadas (fuera de alcance de la versión 1).
- Reprogramación: cancelar y volver a reservar es el flujo de la versión 1.

---

## 5. Contratos propuestos · `[PROPUESTA]`

| Método | Ruta | Rol | Respuestas |
|---|---|---|---|
| `POST` | `/api/v1/reservations/` | estudiante | `201` · `400` franja pasada · `409` ya reservada · `403` rol incorrecto |
| `GET` | `/api/v1/reservations/mine/` | estudiante o monitor | `200` paginado |
| `GET` | `/api/v1/reservations/{id}/` | participantes | `200` · `403` |
| `POST` | `/api/v1/reservations/{id}/cancel/` | estudiante propietario, monitor o admin | `200` · `403` · `409` ya cancelada · `400` fuera de ventana |

**Cuerpo de la reserva:**

```json
{ "slot_id": "uuid" }
```

El estudiante se toma del usuario autenticado, **nunca del cuerpo de la petición**. Aceptarlo del cliente permitiría reservar a nombre de otro.

---

## 6. Diseño de la invariante crítica

Tres capas de defensa. Las tres son obligatorias; ninguna sustituye a las otras.

| Capa | Mecanismo | Qué garantiza |
|---|---|---|
| Base de datos | `UniqueConstraint(fields=["slot", "student"], condition=Q(status="CONFIRMED"))` | Un estudiante no ocupa dos cupos de la misma franja, incluso con varios procesos o servidores |
| Servicio | `select_for_update()` sobre la franja dentro de `transaction.atomic()` y conteo de reservas `CONFIRMED` frente a `capacity` | Serializa el acceso, impide superar la capacidad y produce un error de dominio limpio |
| API | `IntegrityError` → `409 Conflict` | Respuesta comprensible y consistente para el cliente |

```text
POST /reservations/
      │
      ▼
transaction.atomic()
      │
      ├─▶ SELECT ... FOR UPDATE sobre el slot   (bloquea la fila)
      │
      ├─▶ Reglas de dominio: futura, disponible, sin solapamiento propio
      │
      ├─▶ COUNT reservas CONFIRMED del slot < capacity
      │
      ├─▶ INSERT Reservation (status=CONFIRMED)
      │      └─ la restricción única (slot, student) es la última línea de defensa
      │
      └─▶ si COUNT + 1 == capacity: UPDATE slot → RESERVED
            (todo junto, o nada)
```

> **ADR-010, ampliación 2026-10-15:** la capacidad la elige el monitor. El tope se verifica por conteo **bajo bloqueo** de la fila de la franja, no por un contador en memoria. `RESERVED` significa llena (R1); las validaciones del monitor se hacen por conteo de reservas `CONFIRMED` (R2); un estudiante tiene como máximo una reserva por franja (R3); la búsqueda expone los cupos restantes (R4). Ver DECISIONES-ABIERTAS ADR-010.

---

## 7. Plan de trabajo TDD

| # | Tarea | Prueba primero (G2) | Criterio / Regla |
|---|---|---|---|
| T-04.1 | Reglas puras de reserva | Franja pasada, franja no disponible, solapamiento propio | RN-004.1, 004.2, 004.4 |
| T-04.2 | Modelo `Reservation` y estados | Transiciones prohibidas del DDD §6.2 son rechazadas | DDD §6.2 |
| T-04.3 | **Restricción única en base de datos** | Insertar dos `CONFIRMED` del mismo estudiante sobre la misma franja lanza `IntegrityError` | RN-004.3 |
| T-04.4 | Servicio de reserva transaccional | Reserva válida crea la reserva y marca la franja | CA-HU03-1, RN-004.5 |
| T-04.5 | Franja ya reservada | `409`, sin segunda reserva | CA-HU03-2 |
| T-04.6 | **Prueba de concurrencia real** | Dos transacciones simultáneas: exactamente una gana | **CA-HU03-3** |
| T-04.7 | Franja pasada | `400` | CA-HU03-4 |
| T-04.8 | Solapamiento propio del estudiante | Reserva en horario ya comprometido es rechazada | CA-HU03-5 |
| T-04.9 | Límite de reservas activas | Según ADR-010 | RN-004.7 |
| T-04.10 | Autorización de rol | Monitor o docente intentando reservar → `403` | CA-HU03-6 |
| T-04.11 | Atomicidad ante fallo | Si el `UPDATE` de la franja falla, la reserva no queda creada | RN-004.5 |
| T-04.12 | Cancelación dentro de ventana | Reserva `CANCELLED`, franja vuelve a `AVAILABLE` | CA-HU04-1, RN-005.2 |
| T-04.13 | Cancelación fuera de ventana | Se aplica la política de ADR-011 | CA-HU04-2 |
| T-04.14 | Cancelación por tercero | `403` | CA-HU04-3, RN-005.4 |
| T-04.15 | Doble cancelación | `409` | CA-HU04-4, RN-005.3 |
| T-04.16 | Cancelación por el monitor | Exige justificación; registra autor | RN-005.5 |
| T-04.17 | Consulta de reservas propias | Estudiante y monitor ven solo las suyas, paginadas | RF-045, RF-046 |
| T-04.18 | Completar T-01.12 | Desactivar usuario con reservas futuras informa el impacto | CA-HU11-3 |
| T-04.19 | Frontend: reservar | Flujo desde la búsqueda, con manejo de `409` |  — |
| T-04.20 | Frontend: mis reservas y cancelar | Listado, confirmación y estado tras cancelar | — |
| T-04.21 | Validaciones de disponibilidad por conteo | `update_slot`, `cancel_slot` y `deactivate_template` pasan de validar por estado a contar reservas `CONFIRMED` bajo bloqueo de fila: franja con capacidad > 1 y una reserva → retirar, mover la hora de inicio o desactivar la plantilla da `409`; bajar `capacity` por debajo de las reservas `CONFIRMED` da `409` | CA-HU05-4, RN-003.4, ADR-010 R2 |
| T-04.22 | Transiciones por cupos | Capacidad 3: la primera y la segunda reserva dejan la franja `AVAILABLE`; la tercera la pasa a `RESERVED`; cancelar una la devuelve a `AVAILABLE` | RN-004.1, RN-004.5, RN-005.2, ADR-010 R1 |
| T-04.23 | Una reserva por estudiante y franja | El mismo estudiante reservando dos veces una franja grupal → `409`; la restricción `(slot, student)` lanza `IntegrityError` | RN-004.3, ADR-010 R3 |
| T-04.24 | Cupos restantes en la búsqueda | El resultado expone `remaining_seats` = capacidad − reservas `CONFIRMED`, sin consultas N+1 | CA-HU02-1, RNF-PER-001, ADR-010 R4 |
| T-04.25 | Concurrencia con capacidad > 1 | Capacidad 2 con una reserva: dos transacciones simultáneas sobre el último cupo, exactamente una gana y nunca se supera la capacidad | CA-HU03-3, RN-004.3 |

### Cómo se prueba realmente T-04.6

No basta con dos llamadas seguidas: eso no es concurrencia.

```text
Hilo A                          Hilo B
  │                               │
  ├─ abrir transacción            ├─ abrir transacción
  ├─ SELECT FOR UPDATE slot ──┐   │
  │                           │   ├─ SELECT FOR UPDATE slot  (BLOQUEADO)
  ├─ INSERT reservation       │   │
  ├─ COMMIT ──────────────────┘   │
  │                               ├─ (se desbloquea, ve el estado nuevo)
  │                               ├─ falla: franja ocupada
  ▼                               ▼
 201                             409
```

La prueba debe usar hilos con conexiones independientes y transacciones reales. Con una base de datos en memoria o transacciones compartidas, **la prueba miente**.

---

## 8. Criterios de aceptación cubiertos

CA-HU03-1 a CA-HU03-6 · CA-HU04-1 a CA-HU04-4 · CA-HU11-3 (completado)

---

## 9. Verificación

```bash
<comando de pruebas> tests/ -k "reservation" -v
<comando de pruebas> tests/integration/test_reservation_concurrency.py -v
<comando de pruebas> --cov=apps/reservations --cov-report=term-missing
ruff check . && mypy .
```

**Verificación manual obligatoria:** inspeccionar la restricción única en PostgreSQL.

```sql
\d+ reservations_reservation
-- debe aparecer el índice único parcial sobre slot con status = 'CONFIRMED'
```

---

## 10. Definition of Done

- [ ] ADR-010 y ADR-011 cerrados y reflejados en la documentación.
- [ ] Restricción única parcial existente en base de datos y **verificada en PostgreSQL**, no solo en el código del modelo.
- [ ] **CA-HU03-3 probado con concurrencia real**, con conexiones y transacciones independientes.
- [ ] Los 10 criterios de aceptación con prueba automatizada.
- [ ] Reserva y cancelación son atómicas; probado el fallo intermedio.
- [ ] Todos los conflictos devuelven `409` con el formato de error del SAD §6.3.
- [ ] El estudiante nunca se toma del cuerpo de la petición.
- [ ] Cobertura de `apps/reservations` por encima del umbral.
- [ ] Eventos de dominio documentados (no implementados).
- [ ] Esquema OpenAPI y tipos del frontend actualizados.
- [ ] CI en verde; PRs aprobadas.

---

## 11. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Validación solo en el serializer | **Doble reserva en producción** | Restricción en base de datos obligatoria en el DoD |
| Prueba de concurrencia falsa (secuencial) | Falsa sensación de seguridad | Revisión específica en el PR: debe haber hilos y transacciones reales |
| Cancelación no atómica | Franja bloqueada sin reserva | `transaction.atomic()` + prueba de fallo intermedio |
| Ventana de cancelación inventada | Regla arbitraria en producción | Gate de entrada: ADR-011 cerrado |
| Bloqueos prolongados bajo carga | Degradación del servicio | Mantener la transacción mínima; sin llamadas externas dentro |

---

## 12. Siguiente fase

[FASE-05 · Sesiones e historial](FASE-05-sesiones.md)
